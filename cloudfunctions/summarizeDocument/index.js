// cloudfunctions/summarizeDocument/index.js
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 阿里云百炼API配置
const API_KEY = 'sk-3be0c1a23c7b48cc89b5dec85bc0e0d9';
const BAILIAN_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1';
const MODEL_NAME = 'qwen-turbo'; // 使用更快的模型以减少响应时间

// 文档解析库
const mammoth = require('mammoth');
const XLSX = require('node-xlsx');

// 创建axios客户端 - 减少超时时间以适应微信云函数限制
const bailianClient = axios.create({
  baseURL: BAILIAN_BASE_URL,
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  },
  timeout: 15000 // 减少到15秒，确保在微信云函数限制内完成
});

// 优化的文件摘要prompt模板 - 更简洁快速
const SUMMARY_PROMPT = `请分析文档并提供简洁摘要：
1. 核心观点
2. 关键信息
3. 主要结论

不超过800字，语言简练。`;

// 简化的分析prompt模板
const FULL_ANALYSIS_PROMPT = `请深入分析文档：
1. 核心观点和论据
2. 重要数据
3. 结论建议

不超过1200字，内容精炼。`;

// 根据文件类型生成不同的处理策略
async function processDocumentByType(fileUrl, fileType, isFullAnalysis = false, existingSummary = '') {
  try {
    // 根据是否是完整分析使用不同的提示
    let prompt = isFullAnalysis ? FULL_ANALYSIS_PROMPT : SUMMARY_PROMPT;
    
    // 如果已有摘要，在完整分析时包含它
    if (isFullAnalysis && existingSummary) {
      prompt = `以下是一个基础摘要：\n\n${existingSummary}\n\n请基于这个基础摘要，对文档进行更全面、更详细的分析，${FULL_ANALYSIS_PROMPT}`;
    }
    
    // 根据文件类型选择不同的处理方式
    if (fileType && (fileType.toLowerCase() === 'jpg' || fileType.toLowerCase() === 'png' ||
                   fileType.toLowerCase() === 'jpeg' || fileType.toLowerCase() === 'gif' ||
                   fileType.toLowerCase() === 'bmp' || fileType.toLowerCase() === 'webp')) {
      prompt = `请分析以下图片内容，识别图片中的文字信息并提供摘要。如果图片不包含文字，请描述图片的主要内容。`;
      return await processImage(fileUrl, prompt, isFullAnalysis);
    } else if (fileType && fileType.toLowerCase() === 'pdf') {
      // PDF文档需要特殊处理
      prompt = `请分析以下PDF文档内容，${prompt}特别注意文档的结构和章节划分。`;
      return await processPdfDocument(fileUrl, prompt, fileType, isFullAnalysis);
    } else if (fileType && fileType.toLowerCase() === 'docx') {
      prompt = `请分析以下Word文档内容，${prompt}特别注意文档的标题层次和段落结构。`;
      return await processOfficeDocument(fileUrl, prompt, fileType, isFullAnalysis);
    } else if (fileType && fileType.toLowerCase() === 'doc') {
      // 对于旧版Word文档，提供专门的处理或提示
      prompt = `请分析以下Word文档内容，${prompt}特别注意文档的标题层次和段落结构。`;
      return await processOfficeDocument(fileUrl, prompt, fileType, isFullAnalysis);
    } else if (fileType && fileType.toLowerCase() === 'pptx') {
      prompt = `请分析以下PowerPoint演示文稿内容，${prompt}重点关注每页的核心观点和演示逻辑。`;
      return await processOfficeDocument(fileUrl, prompt, fileType, isFullAnalysis);
    } else if (fileType && fileType.toLowerCase() === 'ppt') {
      prompt = `请分析以下PowerPoint演示文稿内容，${prompt}重点关注演示的核心内容和逻辑。`;
      return await processOfficeDocument(fileUrl, prompt, fileType, isFullAnalysis);
    } else if (fileType && fileType.toLowerCase() === 'xlsx') {
      prompt = `请分析以下Excel表格内容，${prompt}重点关注数据、趋势和结论。`;
      return await processOfficeDocument(fileUrl, prompt, fileType, isFullAnalysis);
    } else if (fileType && fileType.toLowerCase() === 'xls') {
      prompt = `请分析以下Excel表格内容，${prompt}重点关注数据、趋势和重要数值。`;
      return await processOfficeDocument(fileUrl, prompt, fileType, isFullAnalysis);
    } else if (fileType && (fileType.toLowerCase() === 'rtf')) {
      prompt = `请分析以下RTF文档内容，${prompt}注意文档的结构和内容。`;
      return await processOfficeDocument(fileUrl, prompt, fileType, isFullAnalysis);
    } else if (fileType && (fileType.toLowerCase() === 'csv')) {
      prompt = `请分析以下CSV数据文件内容，${prompt}重点关注数据、趋势和关键值。`;
      return await processTextDocument(fileUrl, prompt, fileType, isFullAnalysis);
    } else if (fileType && (fileType.toLowerCase() === 'txt')) {
      prompt = `请分析以下文本文档内容，${prompt}提取关键信息和要点。`;
      return await processTextDocument(fileUrl, prompt, fileType, isFullAnalysis);
    } else if (fileType && (fileType.toLowerCase() === 'md')) {
      prompt = `请分析以下Markdown文档内容，${prompt}注意文档的结构和要点。`;
      return await processTextDocument(fileUrl, prompt, fileType, isFullAnalysis);
    } else if (fileType && (fileType.toLowerCase() === 'html' || fileType.toLowerCase() === 'htm')) {
      prompt = `请分析以下HTML文档内容，${prompt}忽略标签，提取文本内容的关键信息。`;
      return await processTextDocument(fileUrl, prompt, fileType, isFullAnalysis);
    } else {
      // 默认作为文本文档处理
      return await processTextDocument(fileUrl, prompt, fileType, isFullAnalysis);
    }
  } catch (error) {
    console.error('处理文档时出错:', error);
    throw new Error('文档处理失败: ' + error.message);
  }
}

// 处理PDF文档 - 主要使用多模态方法 (针对微信云函数环境优化)
async function processPdfDocument(fileUrl, prompt, fileType, isFullAnalysis = false) {
  try {
    console.log('开始处理PDF文档:', fileUrl);

    // 微信云函数环境中，PDF.js可能受到限制，我们主要依赖多模态AI模型
    // 但在某些情况下，如果可以获取文本，我们也会尝试

    let extractedText = '';
    let textExtractionSuccess = false;

    // 首先尝试直接从URL获取内容（虽然对PDF通常效果不好）
    try {
      const response = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
        maxContentLength: 10 * 1024 * 1024,
        timeout: 10000
      });

      const buffer = Buffer.from(response.data);

      // 尝试简单地将二进制转换为文本（仅对简单PDF有效）
      const text = buffer.toString('utf8', 0, Math.min(10240, buffer.length)); // 限制读取前10KB

      // 检查是否包含文本内容，避免乱码
      const nonTextChars = text.match(/[^\x20-\x7E\s\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g);
      if (!nonTextChars || nonTextChars.length < text.length * 0.5) {
        extractedText = text;
        textExtractionSuccess = true;
      }
    } catch (fetchError) {
      console.log('直接获取PDF文本失败，使用多模态处理:', fetchError.message);
    }

    // 根据是否成功提取文本决定处理方式
    if (textExtractionSuccess && extractedText && extractedText.trim().length > 0) {
      // 如果成功提取了部分文本，使用文本分析
      const maxContentLength = isFullAnalysis ? 15000 : 10000;
      const maxTokens = isFullAnalysis ? 1800 : 1000;
      const systemContent = isFullAnalysis
        ? '你是PDF文档分析专家，请全面分析PDF内容，提取关键信息并保持结构清晰。'
        : '你是PDF文档摘要助手，请准确提取PDF的核心要点和关键信息。';

      // 如果提取的文本过长，截取前面部分
      if (extractedText.length > maxContentLength) {
        extractedText = extractedText.substring(0, maxContentLength);
      }

      console.log('PDF文档提取文本长度:', extractedText.length);

      // 调用AI API进行分析
      const aiResponse = await bailianClient.post('/services/aigc/text-generation/generation', {
        model: MODEL_NAME,
        input: {
          messages: [
            {
              role: 'system',
              content: systemContent
            },
            {
              role: 'user',
              content: `${prompt}\n\nPDF文档内容：\n\n${extractedText}${extractedText.length >= maxContentLength ? '\n\n[注意：文档内容过长，以上只是部分内容]' : ''}`
            }
          ]
        },
        parameters: {
          temperature: 0.3,
          max_tokens: maxTokens
        }
      });

      if (aiResponse.data && aiResponse.data.output && aiResponse.data.output.text) {
        return {
          success: true,
          summary: aiResponse.data.output.text,
          isPartial: extractedText.length >= maxContentLength
        };
      }
    }

    // 如果文本提取方式失败或没有成功，使用多模态处理
    console.log('使用多模态AI处理PDF文档');
    const maxTokens = isFullAnalysis ? 1800 : 1000;
    const systemContent = isFullAnalysis
      ? '你是PDF文档分析专家，请分析PDF内容，提取关键信息。'
      : '你是PDF文档摘要助手，请提取PDF的核心信息。';

    const pdfResponse = await bailianClient.post('/services/aigc/multimodal-generation/generation', {
      model: 'qwen-vl-plus', // 使用多模态模型
      input: {
        messages: [
          {
            role: 'system',
            content: systemContent
          },
          {
            role: 'user',
            content: [
              {
                text: prompt
              },
              {
                image: fileUrl // 将PDF URL作为图像传递给多模态模型
              }
            ]
          }
        ]
      },
      parameters: {
        temperature: 0.3,
        max_tokens: maxTokens
      }
    });

    if (pdfResponse.data && pdfResponse.data.output && pdfResponse.data.output.text) {
      return {
        success: true,
        summary: pdfResponse.data.output.text,
        isPartial: true
      };
    } else {
      throw new Error('PDF文档分析API返回格式不正确');
    }
  } catch (error) {
    console.error('处理PDF文档时出错:', error);
    console.error('错误详情:', error.response?.data || error.message);

    // 最后回退处理方法
    try {
      console.log('尝试使用多模态模型处理PDF文档作为最后手段');
      const maxTokens = isFullAnalysis ? 1800 : 1000;
      const systemContent = isFullAnalysis
        ? '你是PDF文档分析专家，请分析PDF内容，提取关键信息。'
        : '你是PDF文档摘要助手，请提取PDF的核心信息。';

      const fallbackResponse = await bailianClient.post('/services/aigc/multimodal-generation/generation', {
        model: 'qwen-vl-plus', // 使用多模态模型
        input: {
          messages: [
            {
              role: 'system',
              content: systemContent
            },
            {
              role: 'user',
              content: [
                {
                  text: prompt
                },
                {
                  image: fileUrl // 将PDF URL作为图像传递给多模态模型
                }
              ]
            }
          ]
        },
        parameters: {
          temperature: 0.3,
          max_tokens: maxTokens
        }
      });

      if (fallbackResponse.data && fallbackResponse.data.output && fallbackResponse.data.output.text) {
        return {
          success: true,
          summary: fallbackResponse.data.output.text,
          isPartial: true
        };
      }
    } catch (fallbackError) {
      console.error('PDF最后回退处理也失败:', fallbackError);
    }

    return {
      success: true,
      summary: '无法处理此PDF文档。可能的原因：1) 文档已加密或受保护；2) 网络问题；3) 文档格式不受支持。建议检查文档是否可以正常打开。',
      isPartial: true
    };
  }
}

// 处理Office文档 - 使用专门的库解析
async function processOfficeDocument(fileUrl, prompt, fileType, isFullAnalysis = false) {
  try {
    console.log('开始处理Office文档:', fileUrl, '类型:', fileType);

    let extractedText = '';

    // 下载文件并解析内容
    const response = await axios.get(fileUrl, {
      responseType: 'arraybuffer',
      maxContentLength: 10 * 1024 * 1024, // 增加到10MB
      timeout: 15000 // 增加超时时间
    });

    const buffer = Buffer.from(response.data);

    // 根据文件类型使用相应的解析库
    if (fileType.toLowerCase() === 'docx') {
      // 使用mammoth解析docx
      const result = await mammoth.extractRawText({ buffer: buffer });
      extractedText = result.value;
    } else if (fileType.toLowerCase() === 'doc') {
      // 对于旧版doc文件，尝试使用mammoth（可能效果有限）或 return to multi-modal
      // 因为doc格式较老且复杂，这里使用多模态作为回退
      console.log('处理旧版Word文档(.doc)，使用多模态方法');
      // 不直接 return，而是让它继续使用多模态方法
      // 直接跳到多模态处理，所以这里不需要特殊处理
    } else if (fileType.toLowerCase() === 'xlsx') {
      // 使用node-xlsx解析Excel文件
      try {
        const workbook = XLSX.parse(buffer);
        const sheets = workbook.sheets || {};

        // 提取所有工作表的内容
        const allText = [];
        for (const sheetName in sheets) {
          const sheet = sheets[sheetName];
          const sheetText = [];

          // 遍历工作表并提取文本
          Object.keys(sheet).forEach(cell => {
            if (cell !== '!ref' && typeof sheet[cell] === 'object' && sheet[cell].v !== undefined) {
              sheetText.push(sheet[cell].v);
            } else if (typeof sheet[cell] === 'string' || typeof sheet[cell] === 'number') {
              sheetText.push(sheet[cell]);
            }
          });

          if (sheetText.length > 0) {
            allText.push(`工作表 "${sheetName}": ${sheetText.join(' | ')}`);
          }
        }

        extractedText = allText.join('\n\n');
      } catch (excelError) {
        console.error('Excel解析错误:', excelError);
        return {
          success: true,
          summary: '无法解析Excel文件内容。建议检查文件格式是否正确，或转换为CSV格式后重新上传。',
          isPartial: true
        };
      }
    } else if (fileType.toLowerCase() === 'xls') {
      // 对于旧版Excel文件，同样尝试解析
      try {
        const workbook = XLSX.parse(buffer);
        const sheets = workbook.sheets || {};

        // 提取所有工作表的内容
        const allText = [];
        for (const sheetName in sheets) {
          const sheet = sheets[sheetName];
          const sheetText = [];

          // 遍历工作表并提取文本
          Object.keys(sheet).forEach(cell => {
            if (cell !== '!ref' && typeof sheet[cell] === 'object' && sheet[cell].v !== undefined) {
              sheetText.push(sheet[cell].v);
            } else if (typeof sheet[cell] === 'string' || typeof sheet[cell] === 'number') {
              sheetText.push(sheet[cell]);
            }
          });

          if (sheetText.length > 0) {
            allText.push(`工作表 "${sheetName}": ${sheetText.join(' | ')}`);
          }
        }

        extractedText = allText.join('\n\n');
      } catch (excelError) {
        console.error('旧版Excel解析错误:', excelError);
        return {
          success: true,
          summary: '无法解析Excel文件内容。建议检查文件格式是否正确，或转换为.xlsx或CSV格式后重新上传。',
          isPartial: true
        };
      }
    } else if (fileType.toLowerCase() === 'pptx') {
      // 对于PPTX文件，尝试使用多模态方法
      console.log('处理PowerPoint演示文稿(.pptx)');
      // 由于PPT解析需要更复杂的库，我们直接使用多模态AI进行处理
      // 在这里我们不会提取具体文本，而是直接跳到多模态处理
    } else if (fileType.toLowerCase() === 'ppt') {
      // 对于旧版PPT文件，同样使用多模态方法
      console.log('处理旧版PowerPoint演示文稿(.ppt)');
      // 直接跳到多模态处理
    }

    // 检查是否成功提取了文本
    if (extractedText && extractedText.trim().length > 0) {
      // 如果成功提取了文本内容，使用文本分析
      // 根据是否完整分析设置不同的长度限制
      const maxContentLength = isFullAnalysis ? 12000 : 8000;
      const maxTokens = isFullAnalysis ? 1800 : 1000;
      const systemContent = isFullAnalysis
        ? `你是${fileType}文档分析专家，请全面分析文档内容，提取关键信息并保持结构清晰。`
        : `你是${fileType}文档摘要助手，请准确提取文档的核心要点和关键信息。`;

      // 如果提取的文本过长，截取前面部分
      if (extractedText.length > maxContentLength) {
        extractedText = extractedText.substring(0, maxContentLength);
      }

      console.log(`${fileType}文档提取文本长度:`, extractedText.length);

      // 调用AI API进行分析
      const aiResponse = await bailianClient.post('/services/aigc/text-generation/generation', {
        model: MODEL_NAME,
        input: {
          messages: [
            {
              role: 'system',
              content: systemContent
            },
            {
              role: 'user',
              content: `${prompt}\n\n${fileType.toUpperCase()}文档内容：\n\n${extractedText}${extractedText.length >= maxContentLength ? '\n\n[注意：文档内容过长，以上只是部分内容]' : ''}`
            }
          ]
        },
        parameters: {
          temperature: 0.3,
          max_tokens: maxTokens
        }
      });

      console.log(`${fileType}文档分析API返回:`, JSON.stringify(aiResponse.data, null, 2));

      if (aiResponse.data && aiResponse.data.output && aiResponse.data.output.text) {
        return {
          success: true,
          summary: aiResponse.data.output.text,
          isPartial: extractedText.length >= maxContentLength
        };
      } else {
        // 如果文本分析失败，使用多模态回退方法
        console.log('文本分析失败，使用多模态回退方法');
      }
    }

    // 如果文本提取失败或者不支持该格式的文本提取，则使用多模态方法
    console.log('使用多模态模型处理Office文档');
    const maxTokens = isFullAnalysis ? 1800 : 1000;
    const systemContent = isFullAnalysis
      ? `你是${fileType}文档分析专家，请分析文档内容，提取关键信息。`
      : `你是${fileType}文档摘要助手，请提取文档的核心信息。`;

    const multimodalResponse = await bailianClient.post('/services/aigc/multimodal-generation/generation', {
      model: 'qwen-vl-plus', // 使用多模态模型
      input: {
        messages: [
          {
            role: 'system',
            content: systemContent
          },
          {
            role: 'user',
            content: [
              {
                text: prompt
              },
              {
                image: fileUrl // 将文档URL作为图像传递给多模态模型
              }
            ]
          }
        ]
      },
      parameters: {
        temperature: 0.3,
        max_tokens: maxTokens
      }
    });

    if (multimodalResponse.data && multimodalResponse.data.output && multimodalResponse.data.output.text) {
      return {
        success: true,
        summary: multimodalResponse.data.output.text,
        isPartial: true
      };
    } else {
      throw new Error('文档分析API返回格式不正确');
    }
  } catch (error) {
    console.error('处理Office文档时出错:', error);
    console.error('错误详情:', error.response?.data || error.message);

    // 尝试回退处理方法
    try {
      // 如果专门解析失败，尝试使用多模态模型
      console.log('尝试使用多模态模型处理Office文档');
      const maxTokens = isFullAnalysis ? 1800 : 1000;
      const systemContent = isFullAnalysis
        ? `你是${fileType}文档分析专家，请分析文档内容，提取关键信息。`
        : `你是${fileType}文档摘要助手，请提取文档的核心信息。`;

      const response = await bailianClient.post('/services/aigc/multimodal-generation/generation', {
        model: 'qwen-vl-plus', // 使用多模态模型
        input: {
          messages: [
            {
              role: 'system',
              content: systemContent
            },
            {
              role: 'user',
              content: [
                {
                  text: prompt
                },
                {
                  image: fileUrl // 将文档URL作为图像传递给多模态模型
                }
              ]
            }
          ]
        },
        parameters: {
          temperature: 0.3,
          max_tokens: maxTokens
        }
      });

      if (response.data && response.data.output && response.data.output.text) {
        return {
          success: true,
          summary: response.data.output.text,
          isPartial: true
        };
      }
    } catch (fallbackError) {
      console.error('回退处理也失败:', fallbackError);
    }

    // 如果所有方法都失败，返回错误信息
    return {
      success: true,
      summary: `无法处理此${fileType}文档。可能的原因：1) 文件格式不受支持；2) 文件已加密或损坏；3) 文件过大。建议转换为PDF或TXT格式后重新上传。`,
      isPartial: true
    };
  }
}

// 处理文本类文档
async function processTextDocument(fileUrl, prompt, fileType, isFullAnalysis = false) {
  try {
    // 增加内容长度限制以提高处理能力
    const maxContentLength = isFullAnalysis ? 12000 : 8000; // 增加内容长度限制
    const maxTokens = isFullAnalysis ? 1500 : 800; // 增加输出token数量
    const systemContent = isFullAnalysis 
      ? '你是文档分析专家，请全面分析文档内容，包括核心观点、关键数据和结论建议。'
      : '你是文档摘要助手，请准确提取文档的核心要点和关键信息。';
    
    let content = '';
    let isEncrypted = false;
    let isBinary = false;
    
    try {
      // 尝试获取文件内容，支持多种编码格式
      const response = await axios.get(fileUrl, { 
        responseType: 'arraybuffer', // 先以二进制方式获取
        maxContentLength: 5 * 1024 * 1024, // 增加到5MB
        timeout: 12000 // 增加到12秒获取文件超时
      });
      
      // 尝试检测编码并转换为文本
      const buffer = Buffer.from(response.data);
      
      // 检测是否是二进制文件
      const textBuffer = buffer.toString('utf8', 0, Math.min(1024, buffer.length));
      
      // 简单检测是否为加密内容或二进制内容
      const nonTextChars = textBuffer.match(/[^\x20-\x7E\s\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g);
      if (nonTextChars && nonTextChars.length > textBuffer.length * 0.3) {
        isBinary = true;
        console.log('检测到二进制或加密内容');
      } else if (textBuffer.includes('加密') || textBuffer.includes('密码') || textBuffer.includes('protected')) {
        isEncrypted = true;
        console.log('检测到加密文档');
      } else {
        content = buffer.toString('utf8');
      }
    } catch (error) {
      console.error('获取文件内容失败:', error);
      throw new Error('文件获取失败: ' + error.message);
    }
    
    // 如果是二进制或加密内容，返回特殊提示
    if (isBinary || isEncrypted) {
      return {
        success: true,
        summary: isEncrypted 
          ? '此文档已加密，需要密码才能访问内容。请先解密文档后重新上传。'
          : '无法解析此文档格式，可能是因为文件格式不支持或文件损坏。请尝试转换为PDF或TXT格式后重新上传。',
        isPartial: true
      };
    }
    
    if (!content || content.trim().length === 0) {
      throw new Error('文件内容为空或无法读取');
    }
    
    // 根据是否是完整分析设置不同的内容长度限制
    if (content.length > maxContentLength) {
      content = content.substring(0, maxContentLength);
    }
    
    // 添加调试日志
    console.log('准备发送给AI的内容长度:', content.length);
    console.log('文件URL:', fileUrl);
    console.log('文件类型:', fileType);
    
    // 调用阿里云百炼API进行摘要
    const summaryResponse = await bailianClient.post('/services/aigc/text-generation/generation', {
      model: MODEL_NAME,
      input: {
        messages: [
          {
            role: 'system',
            content: systemContent
          },
          {
            role: 'user',
            content: `${prompt}\n\n文档内容如下：\n\n${content}${content.length >= maxContentLength ? '\n\n[注意：文档过长，以上只是部分内容]' : ''}`
          }
        ]
      },
      parameters: {
        temperature: 0.3,
        max_tokens: maxTokens
      }
    });
    
    console.log('API返回:', JSON.stringify(summaryResponse.data, null, 2));
    
    if (summaryResponse.data && summaryResponse.data.output && summaryResponse.data.output.text) {
      return {
        success: true,
        summary: summaryResponse.data.output.text,
        isPartial: content.length >= maxContentLength
      };
    } else {
      throw new Error('API返回格式不正确');
    }
  } catch (error) {
    console.error('处理文本文档时出错:', error);
    console.error('错误详情:', error.response?.data || error.message);
    // 如果直接读取文件失败，尝试通过多模态模型处理
    return await processWithMultimodal(fileUrl, prompt, fileType, isFullAnalysis);
  }
}

// 处理图片
async function processImage(fileUrl, prompt, isFullAnalysis = false) {
  try {
    const maxTokens = isFullAnalysis ? 1500 : 1000; // 减少输出token数量以提高速度
    const systemContent = isFullAnalysis
      ? '你是一个图像分析专家，请快速准确地分析图片内容。'
      : '你是一个图像分析助手，请快速准确地提取图片信息。';
      
    const imageResponse = await bailianClient.post('/services/aigc/multimodal-generation/generation', {
      model: 'qwen-vl-plus', // 使用多模态模型处理图片
      input: {
        messages: [
          {
            role: 'system',
            content: systemContent
          },
          {
            role: 'user',
            content: [
              {
                text: prompt
              },
              {
                image: fileUrl
              }
            ]
          }
        ]
      },
      parameters: {
        temperature: 0.3,
        max_tokens: maxTokens
      }
    });

    if (imageResponse.data && imageResponse.data.output && imageResponse.data.output.text) {
      return {
        success: true,
        summary: imageResponse.data.output.text,
        isPartial: false
      };
    } else {
      throw new Error('图片分析API返回格式不正确');
    }
  } catch (error) {
    console.error('处理图片时出错:', error);
    throw new Error('图片处理失败: ' + error.message);
  }
}

// 使用多模态模型处理无法直接读取的文档
async function processWithMultimodal(fileUrl, prompt, fileType, isFullAnalysis = false) {
  try {
    // 首先尝试获取文件内容，支持多种编码格式
    let content = '';
    let isEncrypted = false;
    let isBinary = false;
    
    try {
      // 以二进制方式获取文件
      const fileResponse = await axios.get(fileUrl, { 
        responseType: 'arraybuffer',
        maxContentLength: 3 * 1024 * 1024, // 增加到3MB
        timeout: 8000 // 8秒
      });
      
      // 尝试检测编码并转换为文本
      const buffer = Buffer.from(fileResponse.data);
      
      // 检测是否是二进制文件
      const textBuffer = buffer.toString('utf8', 0, Math.min(1024, buffer.length));
      
      // 简单检测是否为加密内容或二进制内容
      const nonTextChars = textBuffer.match(/[^\x20-\x7E\s\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g);
      if (nonTextChars && nonTextChars.length > textBuffer.length * 0.3) {
        isBinary = true;
        console.log('多模态处理检测到二进制或加密内容');
      } else if (textBuffer.includes('加密') || textBuffer.includes('密码') || textBuffer.includes('protected')) {
        isEncrypted = true;
        console.log('多模态处理检测到加密文档');
      } else {
        content = buffer.toString('utf8');
      }
      
      console.log('多模态处理获取到的文件内容长度:', content.length);
    } catch (fileError) {
      console.error('获取文件内容失败:', fileError);
      // 如果无法获取文件内容，使用通用错误消息
      return {
        success: true,
        summary: `无法读取此${fileType}文档，可能是因为文件格式不支持、网络问题或文件已损坏。请尝试转换为PDF或TXT格式后重新上传。`,
        isPartial: true
      };
    }
    
    // 如果是二进制或加密内容，返回特殊提示
    if (isBinary || isEncrypted) {
      return {
        success: true,
        summary: isEncrypted 
          ? '此文档已加密，需要密码才能访问内容。请先解密文档后重新上传。'
          : `此${fileType}文档包含二进制内容，无法直接提取文本。请尝试将其转换为PDF或纯文本格式后再上传。`,
        isPartial: true
      };
    }
    
    // 如果没有内容，返回错误信息
    if (!content || content.trim().length === 0) {
      return {
        success: true,
        summary: `此${fileType}文档没有可读的文本内容，可能是空文件或只包含图像。`,
        isPartial: true
      };
    }
    
    // 根据内容长度和是否是完整分析设置不同的参数
    const maxContentLength = isFullAnalysis ? 5000 : 3000;
    const maxTokens = isFullAnalysis ? 1200 : 700;
    const limitedContent = content.length > maxContentLength ? content.substring(0, maxContentLength) : content;
    
    // 优化的提示语，包含实际内容
    const fullPrompt = limitedContent.trim() 
      ? `${prompt}\n\n文档内容：\n${limitedContent}${content.length > maxContentLength ? '\n\n[注意：文档过长，以上只是部分内容]' : ''}`
      : `${prompt}\n\n文件URL: ${fileUrl}\n\n请尝试分析此文档。`;
    
    const systemContent = isFullAnalysis
      ? '你是文档分析专家，请准确分析文档内容，即使信息有限也要尽可能提供有价值的分析。'
      : '你是文档摘要助手，请提取文档关键信息，即使信息有限也要尽可能提供有价值的摘要。';
    
    console.log('使用文本模型处理文档，内容长度:', fullPrompt.length);
    
    // 使用文本模型而不是多模态模型，因为我们已经提取了文本内容
    const multimodalTextResponse = await bailianClient.post('/services/aigc/text-generation/generation', {
      model: MODEL_NAME,
      input: {
        messages: [
          {
            role: 'system',
            content: systemContent
          },
          {
            role: 'user',
            content: fullPrompt
          }
        ]
      },
      parameters: {
        temperature: 0.3,
        max_tokens: maxTokens
      }
    });

    console.log('多模态处理API返回:', JSON.stringify(multimodalTextResponse.data, null, 2));

    if (multimodalTextResponse.data && multimodalTextResponse.data.output && multimodalTextResponse.data.output.text) {
      return {
        success: true,
        summary: multimodalTextResponse.data.output.text,
        isPartial: content.length > maxContentLength
      };
    } else {
      throw new Error('文档处理API返回格式不正确');
    }
  } catch (error) {
    console.error('处理文档时出错:', error);
    console.error('错误详情:', error.response?.data || error.message);
    
    // 最后的备用方案 - 返回通用错误信息
    return {
      success: true,
      summary: `无法处理此${fileType}文档。可能的原因：1) 文件格式不支持；2) 文件已加密或损坏；3) 网络问题。建议转换为PDF或TXT格式后重新上传。`,
      isPartial: true
    };
  }
}

// 任务状态管理 - 使用内存存储（在单个容器实例中）
// 注意：在实际生产环境中，由于云函数实例可能重启，应使用数据库存储
let taskStatusMap = new Map();

// 更新任务状态
function updateTaskStatus(taskId, status, summary, isPartial, error) {
  taskStatusMap.set(taskId, {
    status,
    summary,
    isPartial,
    error,
    updatedAt: Date.now()
  });
}

// 获取任务状态
function getTaskStatus(taskId) {
  const task = taskStatusMap.get(taskId);
  if (!task) {
    return {
      status: 'not_found',
      error: '任务不存在'
    };
  }

  return task;
}

// 清理过期任务 (防止内存泄漏)
function cleanupExpiredTasks() {
  const now = Date.now();
  const expiredTaskIds = [];

  for (const [taskId, task] of taskStatusMap) {
    // 如果任务状态为处理中且超过10分钟没有更新，则认为任务过期
    if (task.status === 'processing' && (now - task.updatedAt > 10 * 60 * 1000)) {
      expiredTaskIds.push(taskId);
    }
  }

  for (const taskId of expiredTaskIds) {
    taskStatusMap.delete(taskId);
  }
}

// 定期清理（在内存中运行）
setTimeout(() => {
  cleanupExpiredTasks();
}, 30000); // 30秒后执行清理

// 快速摘要异步处理
async function processQuickSummaryAsync(taskId, fileUrl, fileType) {
  try {
    // 减小内容长度和输出
    const maxContentLength = 3000;
    const maxTokens = 500;
    const prompt = '快速提取文档要点，列出3个关键点，不超过400字。';
    
    console.log('快速摘要处理文件:', fileUrl, '类型:', fileType);
    
    let content = '';
    let isEncrypted = false;
    let isBinary = false;
    
    try {
      // 以二进制方式获取文件
      const response = await axios.get(fileUrl, { 
        responseType: 'arraybuffer',
        maxContentLength: 2 * 1024 * 1024, // 2MB
        timeout: 8000 // 8秒
      });
      
      // 尝试检测编码并转换为文本
      const buffer = Buffer.from(response.data);
      const textBuffer = buffer.toString('utf8', 0, Math.min(1024, buffer.length));
      
      // 检测是否为加密内容或二进制内容
      const nonTextChars = textBuffer.match(/[^\x20-\x7E\s\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g);
      if (nonTextChars && nonTextChars.length > textBuffer.length * 0.3) {
        isBinary = true;
        console.log('快速摘要检测到二进制或加密内容');
      } else if (textBuffer.includes('加密') || textBuffer.includes('密码') || textBuffer.includes('protected')) {
        isEncrypted = true;
        console.log('快速摘要检测到加密文档');
      } else {
        content = buffer.toString('utf8');
      }
    } catch (error) {
      console.error('获取文件内容失败:', error);
      updateTaskStatus(taskId, 'failed', null, false, '文件获取失败: ' + error.message);
      return;
    }
    
    // 如果是二进制或加密内容，返回特殊提示
    if (isBinary || isEncrypted) {
      const errorMessage = isEncrypted 
        ? '此文档已加密，需要密码才能访问内容。请先解密文档后重新上传。'
        : '无法解析此文档格式，可能是二进制文件或格式不支持。请尝试转换为PDF或TXT格式后重新上传。';
      
      updateTaskStatus(taskId, 'completed', errorMessage, false, null);
      return;
    }
    
    console.log('快速摘要获取到的文件内容长度:', content ? content.length : 0);
    
    if (!content || content.trim().length === 0) {
      updateTaskStatus(taskId, 'completed', '文档内容为空或无法读取，请检查文件是否有效。', false, null);
      return;
    }
    
    // 限制内容长度
    if (content.length > maxContentLength) {
      content = content.substring(0, maxContentLength);
    }
    
    console.log('准备发送给快速摘要API的内容长度:', content.length);
    
    // 调用API
    const summaryResponse = await bailianClient.post('/services/aigc/text-generation/generation', {
      model: MODEL_NAME,
      input: {
        messages: [
          {
            role: 'system',
            content: '你是一个文档摘要助手，请快速准确地提取关键信息。'
          },
          {
            role: 'user',
            content: `${prompt}\n\n文档内容：\n\n${content}`
          }
        ]
      },
      parameters: {
        temperature: 0.3,
        max_tokens: maxTokens
      }
    });
    
    console.log('快速摘要API返回:', JSON.stringify(summaryResponse.data, null, 2));
    
    if (summaryResponse.data && summaryResponse.data.output && summaryResponse.data.output.text) {
      updateTaskStatus(taskId, 'completed', summaryResponse.data.output.text, content.length >= maxContentLength, null);
    } else {
      throw new Error('API返回格式不正确');
    }
  } catch (error) {
    console.error('快速摘要异步处理失败:', error);
    console.error('错误详情:', error.response?.data || error.message);
    
    // 检查是否是加密或二进制错误
    if (error.message && (error.message.includes('加密') || error.message.includes('二进制'))) {
      updateTaskStatus(taskId, 'completed', error.message, false, null);
    } else {
      updateTaskStatus(taskId, 'failed', null, false, error.message);
    }
  }
}

// 异步处理文档
async function processAsyncDocument(taskId, fileUrl, fileType, isFullAnalysis, existingSummary) {
  try {
    console.log('开始异步处理文档，任务ID:', taskId);
    updateTaskStatus(taskId, 'processing', null, false, null);
    
    // 执行实际的文档分析
    const result = await processDocumentByType(fileUrl, fileType, isFullAnalysis, existingSummary);
    console.log('文档分析完成，结果长度:', result.summary ? result.summary.length : 0);
    
    // 更新任务状态为完成
    updateTaskStatus(taskId, 'completed', result.summary, result.isPartial, null);
    console.log('任务状态已更新为完成');
  } catch (error) {
    console.error('异步处理文档失败:', error);
    console.error('错误详情:', error.response?.data || error.message);
    updateTaskStatus(taskId, 'failed', null, false, error.message);
  }
}

// 快速摘要（同步模式）
async function processQuickSummary(fileUrl, fileType, isFullAnalysis) {
  const maxContentLength = 4000;
  const maxTokens = 600;
  const prompt = isFullAnalysis ? 
    '快速分析文档核心，提供要点列表，不超过600字。' :
    '快速提取文档要点，列出3个关键点，不超过400字。';
  
  try {
    let content = '';
    let isEncrypted = false;
    let isBinary = false;
    
    // 以二进制方式获取文件
    const response = await axios.get(fileUrl, { 
      responseType: 'arraybuffer',
      maxContentLength: 2 * 1024 * 1024, // 2MB
      timeout: 8000 // 8秒
    });
    
    // 尝试检测编码并转换为文本
    const buffer = Buffer.from(response.data);
    const textBuffer = buffer.toString('utf8', 0, Math.min(1024, buffer.length));
    
    // 检测是否为加密内容或二进制内容
    const nonTextChars = textBuffer.match(/[^\x20-\x7E\s\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g);
    if (nonTextChars && nonTextChars.length > textBuffer.length * 0.3) {
      isBinary = true;
      console.log('快速摘要同步模式检测到二进制或加密内容');
    } else if (textBuffer.includes('加密') || textBuffer.includes('密码') || textBuffer.includes('protected')) {
      isEncrypted = true;
      console.log('快速摘要同步模式检测到加密文档');
    } else {
      content = buffer.toString('utf8');
    }
    
    // 如果是二进制或加密内容，返回特殊提示
    if (isBinary || isEncrypted) {
      const errorMessage = isEncrypted 
        ? '此文档已加密，需要密码才能访问内容。请先解密文档后重新上传。'
        : '无法解析此文档格式，可能是二进制文件或格式不支持。请尝试转换为PDF或TXT格式后重新上传。';
      
      return {
        summary: errorMessage,
        isPartial: false
      };
    }
    
    if (!content || content.trim().length === 0) {
      return {
        summary: '文档内容为空或无法读取，请检查文件是否有效。',
        isPartial: false
      };
    }
    
    // 限制内容长度
    if (content.length > maxContentLength) {
      content = content.substring(0, maxContentLength);
    }
    
    // 调用API
    const summaryResponse = await bailianClient.post('/services/aigc/text-generation/generation', {
      model: MODEL_NAME,
      input: {
        messages: [
          {
            role: 'system',
            content: '你是一个文档摘要助手，请快速准确地提取关键信息。'
          },
          {
            role: 'user',
            content: `${prompt}\n\n文档内容：\n\n${content}`
          }
        ]
      },
      parameters: {
        temperature: 0.3,
        max_tokens: maxTokens
      }
    });
    
    if (summaryResponse.data && summaryResponse.data.output && summaryResponse.data.output.text) {
      return {
        summary: summaryResponse.data.output.text,
        isPartial: content.length >= maxContentLength
      };
    } else {
      throw new Error('API返回格式不正确');
    }
  } catch (error) {
    console.error('快速摘要处理失败:', error);
    
    // 检查是否是加密或二进制错误
    if (error.message && (error.message.includes('加密') || error.message.includes('二进制'))) {
      return {
        summary: error.message,
        isPartial: false
      };
    }
    
    throw error;
  }
}

// 云函数主入口 - 极简启动模式
exports.main = async (event, context) => {
  try {
    const { action, fileUrl, fileType, existingSummary, taskId } = event;

    console.log('云函数收到请求:', JSON.stringify(event, null, 2));

    if (!action) {
      return {
        success: false,
        error: '缺少action参数'
      };
    }

    // 启动分析任务 - 极简快速响应
    if (action === 'startAnalysis') {
      if (!fileUrl) {
        return {
          success: false,
          error: '缺少fileUrl参数'
        };
      }

      const isFullAnalysis = event.isFullAnalysis || false;
      console.log('启动分析任务:', fileUrl, '类型:', fileType, '完整分析:', isFullAnalysis);

      // 立即生成任务ID并返回
      const newTaskId = taskId || `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      // 立即更新任务状态为处理中
      updateTaskStatus(newTaskId, 'processing', null, false, null);
      console.log('已创建任务ID:', newTaskId);

      // 使用setTimeout零延迟启动异步处理，确保不影响当前响应
      setTimeout(() => {
        console.log('开始异步处理文档，任务ID:', newTaskId);
        processAsyncDocument(newTaskId, fileUrl, fileType, isFullAnalysis, existingSummary).catch(error => {
          console.error('异步处理失败:', error);
          updateTaskStatus(newTaskId, 'failed', null, false, error.message);
        });
      }, 0);

      return {
        success: true,
        taskId: newTaskId,
        message: '分析任务已启动'
      };
    }

    // 检查分析结果
    if (action === 'checkResult') {
      if (!taskId) {
        return {
          success: false,
          error: '缺少taskId参数'
        };
      }

      // 快速获取任务状态
      const taskStatus = getTaskStatus(taskId);
      console.log('检查任务状态，任务ID:', taskId, '状态:', taskStatus.status);

      return {
        success: true,
        ...taskStatus
      };
    }

    return {
      success: false,
      error: '不支持的操作'
    };
  } catch (error) {
    console.error('云函数执行出错:', error);
    return {
      success: false,
      error: error.message || '云函数执行异常'
    };
  }
};