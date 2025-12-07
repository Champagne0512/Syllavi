// cloudfunctions/summarizeDocument/index.js
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 阿里云百炼API配置
const API_KEY = 'sk-3be0c1a23c7b48cc89b5dec85bc0e0d9';
const BAILIAN_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1';
const MODEL_NAME = 'qwen-turbo'; // 使用更快的模型以减少响应时间

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
    if (fileType && (fileType.toLowerCase() === 'jpg' || fileType.toLowerCase() === 'png' || fileType.toLowerCase() === 'jpeg')) {
      prompt = `请分析以下图片内容，识别图片中的文字信息并提供摘要。如果图片不包含文字，请描述图片的主要内容。`;
      return await processImage(fileUrl, prompt, isFullAnalysis);
    } else if (fileType && fileType.toLowerCase() === 'pdf') {
      // PDF文档需要特殊处理
      prompt = `请分析以下PDF文档内容，${prompt}特别注意文档的结构和章节划分。`;
      return await processPdfDocument(fileUrl, prompt, fileType, isFullAnalysis);
    } else if (fileType && (fileType.toLowerCase() === 'doc' || fileType.toLowerCase() === 'docx')) {
      prompt = `请分析以下Word文档内容，${prompt}特别注意文档的标题层次和段落结构。`;
      return await processOfficeDocument(fileUrl, prompt, fileType, isFullAnalysis);
    } else if (fileType && (fileType.toLowerCase() === 'ppt' || fileType.toLowerCase() === 'pptx')) {
      prompt = `请分析以下PowerPoint演示文稿内容，${prompt}重点关注每页的核心观点和演示逻辑。`;
      return await processOfficeDocument(fileUrl, prompt, fileType, isFullAnalysis);
    } else {
      // 默认作为文本文档处理
      return await processTextDocument(fileUrl, prompt, fileType, isFullAnalysis);
    }
  } catch (error) {
    console.error('处理文档时出错:', error);
    throw new Error('文档处理失败: ' + error.message);
  }
}

// 处理PDF文档 - 使用多模态模型
async function processPdfDocument(fileUrl, prompt, fileType, isFullAnalysis = false) {
  try {
    console.log('开始处理PDF文档:', fileUrl);
    
    // 使用更长的内容限制，因为PDF通常包含更多信息
    const maxTokens = isFullAnalysis ? 1800 : 1000;
    const systemContent = isFullAnalysis 
      ? '你是PDF文档分析专家，请全面分析PDF内容，提取关键信息并保持结构清晰。'
      : '你是PDF文档摘要助手，请准确提取PDF的核心要点和关键信息。';
    
    // 使用多模态模型处理PDF
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
    
    console.log('PDF分析API返回:', JSON.stringify(response.data, null, 2));
    
    if (response.data && response.data.output && response.data.output.text) {
      return {
        success: true,
        summary: response.data.output.text,
        isPartial: true // PDF处理通常被视为部分处理，因为可能无法提取全部内容
      };
    } else {
      // 如果多模态模型处理失败，尝试直接二进制方式读取
      console.log('多模态PDF处理失败，尝试直接读取二进制内容');
      return await processTextDocument(fileUrl, prompt, fileType, isFullAnalysis);
    }
  } catch (error) {
    console.error('处理PDF文档时出错:', error);
    console.error('错误详情:', error.response?.data || error.message);
    
    // 如果多模态处理失败，尝试直接二进制方式读取
    console.log('PDF多模态处理失败，回退到二进制读取');
    return await processTextDocument(fileUrl, prompt, fileType, isFullAnalysis);
  }
}

// 处理Office文档 - 使用多模态模型
async function processOfficeDocument(fileUrl, prompt, fileType, isFullAnalysis = false) {
  try {
    console.log('开始处理Office文档:', fileUrl, '类型:', fileType);
    
    // 使用更长的内容限制，因为Office文档通常包含更多信息
    const maxTokens = isFullAnalysis ? 1800 : 1000;
    const systemContent = isFullAnalysis 
      ? `你是${fileType}文档分析专家，请全面分析文档内容，提取关键信息并保持结构清晰。`
      : `你是${fileType}文档摘要助手，请准确提取文档的核心要点和关键信息。`;
    
    // 使用多模态模型处理Office文档
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
    
    console.log('Office文档分析API返回:', JSON.stringify(response.data, null, 2));
    
    if (response.data && response.data.output && response.data.output.text) {
      return {
        success: true,
        summary: response.data.output.text,
        isPartial: true // Office文档处理通常被视为部分处理
      };
    } else {
      // 如果多模态模型处理失败，尝试直接二进制方式读取
      console.log('多模态Office文档处理失败，尝试直接读取二进制内容');
      return await processTextDocument(fileUrl, prompt, fileType, isFullAnalysis);
    }
  } catch (error) {
    console.error('处理Office文档时出错:', error);
    console.error('错误详情:', error.response?.data || error.message);
    
    // 如果多模态处理失败，尝试直接二进制方式读取
    console.log('Office文档多模态处理失败，回退到二进制读取');
    return await processTextDocument(fileUrl, prompt, fileType, isFullAnalysis);
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
      
    const response = await bailianClient.post('/services/aigc/multimodal-generation/generation', {
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
    
    if (response.data && response.data.output && response.data.output.text) {
      return {
        success: true,
        summary: response.data.output.text,
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
    const response = await bailianClient.post('/services/aigc/text-generation/generation', {
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
    
    console.log('多模态处理API返回:', JSON.stringify(response.data, null, 2));
    
    if (response.data && response.data.output && response.data.output.text) {
      return {
        success: true,
        summary: response.data.output.text,
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

// 简单的任务状态存储（生产环境应使用数据库）
const taskStatusMap = new Map();

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

// 获取任务状态 - 同步版本，避免超时
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
    
    // 极简同步摘要 - 仅用于小文件
    if (action === 'summarize' || action === 'fullAnalysis') {
      if (!fileUrl) {
        return {
          success: false,
          error: '缺少fileUrl参数'
        };
      }
      
      console.log('使用快速模式处理文档:', fileUrl, '类型:', fileType);
      
      // 生成任务ID
      const newTaskId = `quick_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      
      // 立即更新任务状态为处理中
      updateTaskStatus(newTaskId, 'processing', null, false, null);
      
      // 使用setTimeout零延迟启动异步处理
      setTimeout(() => {
        processQuickSummaryAsync(newTaskId, fileUrl, fileType).catch(error => {
          console.error('快速处理失败:', error);
          updateTaskStatus(newTaskId, 'failed', null, false, error.message);
        });
      }, 0);
      
      return {
        success: true,
        taskId: newTaskId,
        message: '快速分析已启动'
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