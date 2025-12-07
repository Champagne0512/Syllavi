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
  timeout: 20000 // 设置为20秒，确保在微信云函数限制内完成
});

// 恢复完整的文件摘要prompt模板
const SUMMARY_PROMPT = `请分析以下文档内容，并提供一个详细、全面的摘要，重点关注以下方面：
1. 核心主题和主要观点
2. 关键数据和重要信息
3. 结论和建议
4. 主要论点和支撑论据
5. 适合快速理解的要点列表

请确保摘要内容详实全面，不超过2000字，语言简洁明了，便于掌握文档核心内容。`;

// 完整分析的prompt模板 - 优化为更简洁高效
const FULL_ANALYSIS_PROMPT = `请对文档进行更深入的分析，包括：
1. 核心观点和关键论据
2. 重要数据和事实
3. 结论与建议
4. 实用要点列表

请提供详细分析，不超过2500字，内容精炼全面。`;

// 根据文件类型生成不同的处理策略
async function processDocumentByType(fileUrl, fileType, isFullAnalysis = false, existingSummary = '') {
  try {
    // 根据是否是完整分析使用不同的提示
    let prompt = isFullAnalysis ? FULL_ANALYSIS_PROMPT : SUMMARY_PROMPT;
    
    // 如果已有摘要，在完整分析时包含它
    if (isFullAnalysis && existingSummary) {
      prompt = `以下是一个基础摘要：\n\n${existingSummary}\n\n请基于这个基础摘要，对文档进行更全面、更详细的分析，${FULL_ANALYSIS_PROMPT}`;
    }
    
    // 根据文件类型添加特定的处理指令
    if (fileType && fileType.toLowerCase() === 'pdf') {
      prompt = `请分析以下PDF文档内容，${prompt}特别注意文档的结构和章节划分。`;
    } else if (fileType && (fileType.toLowerCase() === 'doc' || fileType.toLowerCase() === 'docx')) {
      prompt = `请分析以下Word文档内容，${prompt}特别注意文档的标题层次和段落结构。`;
    } else if (fileType && (fileType.toLowerCase() === 'ppt' || fileType.toLowerCase() === 'pptx')) {
      prompt = `请分析以下PowerPoint演示文稿内容，${prompt}重点关注每页的核心观点和演示逻辑。`;
    } else if (fileType && (fileType.toLowerCase() === 'jpg' || fileType.toLowerCase() === 'png' || fileType.toLowerCase() === 'jpeg')) {
      prompt = `请分析以下图片内容，识别图片中的文字信息并提供摘要。如果图片不包含文字，请描述图片的主要内容。`;
    }

    // 根据文件类型选择不同的处理方式
    if (fileType && (fileType.toLowerCase() === 'jpg' || fileType.toLowerCase() === 'png' || fileType.toLowerCase() === 'jpeg')) {
      return await processImage(fileUrl, prompt, isFullAnalysis);
    } else {
      return await processTextDocument(fileUrl, prompt, fileType, isFullAnalysis);
    }
  } catch (error) {
    console.error('处理文档时出错:', error);
    throw new Error('文档处理失败: ' + error.message);
  }
}

// 处理文本类文档
async function processTextDocument(fileUrl, prompt, fileType, isFullAnalysis = false) {
  try {
    // 根据是否是完整分析设置不同的参数 - 优化为更快的处理
    const maxContentLength = isFullAnalysis ? 12000 : 8000; // 减少内容长度以提高处理速度
    const maxTokens = isFullAnalysis ? 2000 : 1500; // 减少输出token数量以提高速度
    const systemContent = isFullAnalysis 
      ? '你是一个文档分析专家，请快速准确地提取并总结关键信息。'
      : '你是一个文档摘要助手，请快速准确地提取要点。';
    
    // 首先尝试获取文件内容 - 优化超时设置
    const response = await axios.get(fileUrl, { 
      responseType: 'text',
      maxContentLength: 3 * 1024 * 1024, // 统一限制为3MB
      timeout: 10000 // 统一设置为10秒获取文件超时
    });
    
    let content = response.data;
    if (!content || content.trim().length === 0) {
      throw new Error('文件内容为空或无法读取');
    }
    
    // 根据是否是完整分析设置不同的内容长度限制
    if (content.length > maxContentLength) {
      content = content.substring(0, maxContentLength) + "\n\n[注意：文档过长，已截断显示部分内容]";
    }
    
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
            content: `${prompt}\n\n文档内容如下：\n\n${content}`
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
        success: true,
        summary: summaryResponse.data.output.text,
        isPartial: content.length >= maxContentLength
      };
    } else {
      throw new Error('API返回格式不正确');
    }
  } catch (error) {
    console.error('处理文本文档时出错:', error);
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
    // 恢复完整的提示语
    const fullPrompt = `${prompt}\n\n请分析以下${fileType}文件:`;
    const maxTokens = isFullAnalysis ? 1500 : 1000; // 减少输出token数量以提高速度
    const systemContent = isFullAnalysis
      ? '你是一个文档分析专家，请快速准确地分析各种格式文档。'
      : '你是一个文档分析助手，请快速准确地提取文档关键信息。';
    
    const response = await bailianClient.post('/services/aigc/multimodal-generation/generation', {
      model: 'qwen-vl-plus',
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
                text: fullPrompt
              },
              {
                file: fileUrl
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
    } else {
      throw new Error('多模态处理API返回格式不正确');
    }
  } catch (error) {
    console.error('多模态处理文档时出错:', error);
    throw new Error('文档处理失败: ' + error.message);
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
    // 使用较小的内容长度和输出
    const maxContentLength = 3000;
    const maxTokens = 600;
    const prompt = '请快速提取文档核心要点，列出3-5个关键点，不超过500字。';
    
    // 获取文件内容
    const response = await axios.get(fileUrl, { 
      responseType: 'text',
      maxContentLength: 1 * 1024 * 1024, // 1MB
      timeout: 10000 // 10秒
    });
    
    let content = response.data;
    if (!content || content.trim().length === 0) {
      throw new Error('文件内容为空或无法读取');
    }
    
    // 限制内容长度
    if (content.length > maxContentLength) {
      content = content.substring(0, maxContentLength) + "\n\n[内容已截断]";
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
      updateTaskStatus(taskId, 'completed', summaryResponse.data.output.text, true, null);
    } else {
      throw new Error('API返回格式不正确');
    }
  } catch (error) {
    console.error('快速摘要异步处理失败:', error);
    updateTaskStatus(taskId, 'failed', null, false, error.message);
  }
}

// 异步处理文档
async function processAsyncDocument(taskId, fileUrl, fileType, isFullAnalysis, existingSummary) {
  try {
    updateTaskStatus(taskId, 'processing', null, false, null);
    
    // 执行实际的文档分析
    const result = await processDocumentByType(fileUrl, fileType, isFullAnalysis, existingSummary);
    
    // 更新任务状态为完成
    updateTaskStatus(taskId, 'completed', result.summary, result.isPartial, null);
  } catch (error) {
    console.error('异步处理文档失败:', error);
    updateTaskStatus(taskId, 'failed', null, false, error.message);
  }
}

// 快速摘要（同步模式）
async function processQuickSummary(fileUrl, fileType, isFullAnalysis) {
  // 使用更短的内容长度和更少的输出
  const maxContentLength = 4000;
  const maxTokens = 800;
  const prompt = isFullAnalysis ? 
    '请快速分析文档核心内容，提供简明扼要的要点列表，不超过800字。' :
    '请快速提取文档要点，列出3-5个关键点，不超过500字。';
  
  try {
    // 尝试获取文件内容
    const response = await axios.get(fileUrl, { 
      responseType: 'text',
      maxContentLength: 1 * 1024 * 1024, // 1MB
      timeout: 5000 // 5秒
    });
    
    let content = response.data;
    if (!content || content.trim().length === 0) {
      throw new Error('文件内容为空或无法读取');
    }
    
    // 限制内容长度
    if (content.length > maxContentLength) {
      content = content.substring(0, maxContentLength) + "\n\n[内容已截断]";
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
        isPartial: true
      };
    } else {
      throw new Error('API返回格式不正确');
    }
  } catch (error) {
    console.error('快速摘要处理失败:', error);
    throw error;
  }
}

// 云函数主入口 - 极简启动模式
exports.main = async (event, context) => {
  try {
    const { action, fileUrl, fileType, existingSummary, taskId } = event;
    
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
      const newTaskId = taskId || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 立即更新任务状态为处理中
      updateTaskStatus(newTaskId, 'processing', null, false, null);
      
      // 使用setTimeout零延迟启动异步处理，确保不影响当前响应
      setTimeout(() => {
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
      const newTaskId = `quick_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
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