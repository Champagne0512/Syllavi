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

const AI_ROLE_PROMPT = `# 角色
你是一个专注于从课程表和待办事项（含讲座、活动）图片中提取结构化数据的智能工具，目标是把图片内容转为标准 JSON。

## 能力要求
- 识别表格或列表形式的课程/任务信息，提取课程名称、星期、节次、教室，或任务标题、优先级、截止日期和类型（lecture/event/task）。
- 对模糊或倾斜图片尝试通过上下文推断；若无法识别则返回空结果。
- 判断图片属于 schedule 还是 todo；若不确定返回 unknown。

## 输出格式（必须严格遵守）
仅返回 JSON 对象，禁止附加任何解释或 Markdown。
示例：{"type":"schedule","data":[]}
- schedule: data 为课程对象数组，字段 {"subject","day","startSection","endSection","room"}
- todo: data 为任务对象数组，字段 {"title","priority","deadline","type"}
- 无法识别时返回 {"type":"unknown","data":[]}
- 缺失字段使用空字符串或合理默认值（如 priority 默认为 "medium"）。
`;

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
    need_generate_messages: true,
    additional_messages: buildAdditionalMessages(imageUrl)
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
      conversation_id: conversationId,
      need_messages: true
    }
  });

  console.log('轮询响应:', JSON.stringify(response.data, null, 2));

  const data = response.data?.data || {};
  if (!Array.isArray(data.messages) || data.messages.length === 0) {
    const messages = await fetchChatMessages(chatId, conversationId);
    if (messages.length) {
      data.messages = messages;
    }
  }

  return data;
}

async function fetchChatMessages(chatId, conversationId) {
  const candidates = [
    {
      url: '/chat/message/list',
      params: { chat_id: chatId, conversation_id: conversationId, order: 'desc', limit: 20 }
    },
    {
      url: '/conversation/message/list',
      params: { conversation_id: conversationId, chat_id: chatId, order: 'desc', limit: 20 }
    }
  ];

  for (const candidate of candidates) {
    try {
      const response = await axiosClient.get(candidate.url, { params: candidate.params });
      console.log(`消息列表响应(${candidate.url}):`, JSON.stringify(response.data, null, 2));
      const list = normalizeMessages(response.data?.data);
      if (Array.isArray(list) && list.length) {
        return list;
      }
    } catch (error) {
      console.warn(`获取 ${candidate.url} 失败:`, error.response ? error.response.data : error.message);
    }
  }

  return [];
}

function extractAnswerPayload(pollData) {
  const messages = Array.isArray(pollData?.messages)
    ? pollData.messages
    : normalizeMessages(pollData?.messages);

  let answerMsg = Array.isArray(messages)
    ? messages
        .slice()
        .reverse()
        .find((msg) => msg && (msg.type === 'answer' || msg.role === 'assistant'))
    : null;

  if (!answerMsg && Array.isArray(messages) && messages.length) {
    answerMsg = messages[messages.length - 1];
  }

  if (!answerMsg) {
    answerMsg = buildFallbackMessage(pollData);
  }

  if (!answerMsg) {
    throw new Error('Coze 没有返回答案');
  }

  const rawContent = pickMessageContent(answerMsg);
  const hintError = detectAiNonJsonHint(rawContent);
  if (hintError) {
    throw new Error(hintError);
  }

  const jsonText = extractJsonText(rawContent);
  const parsed = parseAiJson(jsonText);
  if (parsed) {
    return parsed;
  }

  console.error('JSON 解析失败，原始内容:', rawContent);
  throw new Error('AI 返回的不是标准 JSON');
}

function normalizeMessages(source) {
  if (!source) return [];
  if (Array.isArray(source)) return source;
  if (Array.isArray(source?.messages)) return source.messages;
  if (Array.isArray(source?.data)) return source.data;
  if (Array.isArray(source?.list)) return source.list;
  if (Array.isArray(source?.records)) return source.records;
  return [];
}

function buildFallbackMessage(pollData = {}) {
  const fallbackFields = [
    pollData.output,
    pollData.answer,
    pollData.result,
    pollData.content,
    pollData.response
  ];

  for (const field of fallbackFields) {
    const text = coerceContentToText(field);
    if (text) {
      return { content: text };
    }
  }

  return null;
}

function pickMessageContent(message = {}) {
  const primary = coerceContentToText(message?.content);
  if (primary) return primary;

  if (typeof message.content_string === 'string') {
    return message.content_string;
  }

  if (typeof message.answer === 'string') {
    return message.answer;
  }

  return coerceContentToText(message);
}

function coerceContentToText(payload) {
  if (!payload) return '';

  if (typeof payload === 'string') {
    return payload.trim();
  }

  if (Array.isArray(payload)) {
    const combined = payload
      .map((item) => {
        if (item?.type === 'object_string' && typeof item?.content === 'string') {
          return item.content;
        }
        if (item?.type === 'object_string' && typeof item?.text === 'string') {
          return item.text;
        }
        if (typeof item === 'string') {
          return item;
        }
        return coerceContentToText(item);
      })
      .filter(Boolean)
      .join('\n');
    return combined.trim();
  }

  if (typeof payload === 'object') {
    if (typeof payload.text === 'string') return payload.text;
    if (typeof payload.content === 'string') return payload.content;
    if (typeof payload.value === 'string') return payload.value;
  }

  return '';
}

function detectAiNonJsonHint(rawContent = '') {
  if (!rawContent) return null;
  const text = rawContent.trim();
  if (!text) return null;

  const missingImageKeywords = ['没有图片', '未提供图片', '无法解析图片', '没有图像'];
  if (missingImageKeywords.some((kw) => text.includes(kw))) {
    return 'AI 提示未收到图片，请检查图片是否上传成功且为公网可访问链接';
  }

  const needMoreInfoKeywords = ['如何判断', '请提供', '需要更多信息'];
  if (needMoreInfoKeywords.some((kw) => text.includes(kw))) {
    return `AI 需要更多上下文: ${text}`;
  }

  if (!text.includes('{') && !text.includes('[')) {
    return `AI 未返回结构化数据: ${text}`;
  }

  return null;
}

function extractJsonText(rawContent = '') {
  if (!rawContent) {
    throw new Error('AI 未返回有效内容');
  }

  let text = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();

  if (text.startsWith('{') || text.startsWith('[')) {
    return text;
  }

  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  const hasBrace = firstBrace >= 0;
  const hasBracket = firstBracket >= 0;

  const startIndex = !hasBrace && !hasBracket
    ? -1
    : hasBrace && hasBracket
      ? Math.min(firstBrace, firstBracket)
      : hasBrace
        ? firstBrace
        : firstBracket;

  if (startIndex === -1) {
    return text;
  }

  const startChar = text[startIndex];
  const endChar = startChar === '[' ? ']' : '}';
  const endIndex = text.lastIndexOf(endChar);

  if (endIndex === -1 || endIndex <= startIndex) {
    return text.slice(startIndex);
  }

  return text.slice(startIndex, endIndex + 1);
}

function parseAiJson(jsonText) {
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    const repaired = repairJsonLikeString(jsonText);
    if (!repaired) {
      return null;
    }
    try {
      return JSON.parse(repaired);
    } catch (err) {
      console.error('JSON 修复失败:', err.message);
      return null;
    }
  }
}

function repairJsonLikeString(text = '') {
  let candidate = text.trim();
  if (!candidate) return null;

  const hasWrapper = candidate.startsWith('{') || candidate.startsWith('[');
  if (!hasWrapper) {
    candidate = `{${candidate}}`;
  }

  candidate = candidate
    .replace(/([,{]\s*)(?!\")(\w+)(\s*:)/g, '$1"$2"$3')
    .replace(/:\s*'([^']*)'/g, ': "$1"')
    .replace(/“|”/g, '"')
    .replace(/‘|’/g, '"');

  // 如果仍然缺少引号，尝试粗暴替换
  if (!candidate.includes('"') && candidate.includes("'")) {
    candidate = candidate.replace(/'/g, '"');
  }

  return candidate;
}

function buildAdditionalMessages(imageUrl) {
  return [
    {
      role: 'system',
      content_type: 'text',
      content: AI_ROLE_PROMPT
    },
    {
      role: 'user',
      content_type: 'object_string',
      content: JSON.stringify([
        {
          type: 'text',
          text: '请解析这张图片中的课程表或待办信息，务必输出严格 JSON。'
        },
        {
          type: 'image_url',
          image_url: imageUrl
        }
      ])
    }
  ];
}
