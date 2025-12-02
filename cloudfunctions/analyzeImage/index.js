// cloudfunctions/analyzeImage/index.js
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// === 配置区域 ===
const BOT_ID = '7578786434098970665';
const PAT = 'pat_8DOeTDQ0iUmtqI6HNcSlYGwddblDGbYsruX52bVaxiGMXmliNFvdZa1x3qrdLdn6';

const axiosClient = axios.create({
  baseURL: 'https://api.coze.cn/v3',
  headers: {
    Authorization: `Bearer ${PAT}`,
    'Content-Type': 'application/json'
  },
  timeout: 1500
});

const DEFAULT_POLL_INTERVAL = 400;

exports.main = async (event) => {
  const { action = 'start' } = event;

  try {
    if (action === 'poll') {
      return await handlePoll(event);
    }

    return await handleStart(event);
  } catch (error) {
    console.error('API 调用错误:', error.response ? error.response.data : error);
    return {
      success: false,
      error: error.message || '云函数执行异常'
    };
  }
};

async function handleStart(event) {
  const { imageUrl, userId } = event;

  if (!imageUrl) {
    return { success: false, error: '缺少 imageUrl 参数' };
  }

  console.log('开始调用 Coze, 图片:', imageUrl);

  const initResponse = await axiosClient.post('/chat', {
    bot_id: BOT_ID,
    user_id: userId || 'weixin_user_001',
    stream: false,
    auto_save_history: true,
    additional_messages: [
      {
        role: 'user',
        content_type: 'object_string',
        content: JSON.stringify([
          { type: 'text', text: '请帮我解析这张图片中的信息，严格按照JSON格式返回。' },
          { type: 'image_url', image_url: { url: imageUrl } }
        ])
      }
    ]
  });

  console.log('Coze 初始化响应:', JSON.stringify(initResponse.data, null, 2));

  const chatId = initResponse.data.data?.id;
  const conversationId = initResponse.data.data?.conversation_id;

  if (!chatId || !conversationId) {
    return { success: false, error: '无法获取聊天 ID 或会话 ID' };
  }

  // 快速探测一次，避免已完成还要等待
  try {
    const peek = await retrieveChat(chatId, conversationId);
    if (peek?.status === 'completed') {
      return { success: true, data: extractAnswerPayload(peek) };
    }
    if (peek?.status === 'failed') {
      return { success: false, error: 'Coze 处理失败', detail: peek };
    }
  } catch (err) {
    console.warn('初次轮询失败，进入异步模式', err.message);
  }

  return {
    success: true,
    pending: true,
    chatId,
    conversationId,
    retryAfter: DEFAULT_POLL_INTERVAL
  };
}

async function handlePoll(event) {
  const { chatId, conversationId } = event;
  if (!chatId || !conversationId) {
    return { success: false, error: '缺少 chatId 或 conversationId' };
  }

  const poll = await retrieveChat(chatId, conversationId);
  const status = poll?.status;

  if (status === 'completed') {
    const payload = extractAnswerPayload(poll);
    return { success: true, pending: false, data: payload };
  }

  if (status === 'failed') {
    return { success: false, pending: false, error: 'Coze 处理失败', detail: poll };
  }

  return {
    success: true,
    pending: true,
    chatId,
    conversationId,
    status: status || 'in_progress',
    retryAfter: DEFAULT_POLL_INTERVAL
  };
}

async function retrieveChat(chatId, conversationId) {
  const response = await axiosClient.get('/chat/retrieve', {
    params: {
      chat_id: chatId,
      conversation_id: conversationId
    }
  });

  console.log('轮询响应:', JSON.stringify(response.data, null, 2));

  return response.data?.data;
}

function extractAnswerPayload(pollData) {
  const messages = pollData?.messages;
  if (!Array.isArray(messages)) {
    throw new Error('Coze 返回数据异常: 缺少 messages');
  }

  const answerMsg = messages
    .slice()
    .reverse()
    .find((msg) => msg.type === 'answer' || msg.role === 'assistant');

  if (!answerMsg) {
    throw new Error('Coze 没有返回答案');
  }

  const rawContent = typeof answerMsg.content === 'string'
    ? answerMsg.content
    : JSON.stringify(answerMsg.content || '');

  let jsonStr = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();

  try {
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('JSON 解析失败，原始内容:', rawContent);
    throw new Error('AI 返回的不是标准 JSON');
  }
}
