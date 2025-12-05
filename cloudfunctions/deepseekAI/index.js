const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// === 环境配置（支持通过云函数环境变量覆盖） ===
const QWEN_API_KEY = process.env.QWEN_API_KEY || 'sk-887c2e4a25524de4a06086e35c6f62eb';
const QWEN_API_URL = process.env.QWEN_API_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const QWEN_MODEL = process.env.QWEN_MODEL || 'qwen-vl-max';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nqixahasfhwofusuwsal.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xaXhhaGFzZmh3b2Z1c3V3c2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2NjE1MjcsImV4cCI6MjA3OTIzNzUyNzA3MDI3NzU2N30.o0MpDV0Q_84iv2xY2TSNBwyaJh0BP8n8pLaIxS1ott4';

const HTTP_TIMEOUT = 20000;
const DEFAULT_WEEKS = Array.from({ length: 16 }).map((_, idx) => idx + 1);
const COURSE_COLORS = ['#9BB5CE', '#C9A5A0', '#A3B18A', '#B0A1BA', '#C2C5AA'];

const SYSTEM_PROMPT = `你是一个只能输出 JSON 的视觉抽取模型。\n\n任务：判定图片是课程表还是待办事项，并提取结构化字段。\n\n输出格式：\n{\n  "type": "schedule" | "todo" | "unknown",\n  "data": [] // 严格的 JSON 数组，禁止解释文本\n}\n\n字段要求：\n- schedule: name(day,start,len,location,teacher,weeks)\n- todo: title(description,deadline,priority,category)\n- 无法识别返回 type="unknown", data=[]。\n- 只能输出图片中真实存在的信息。`;

exports.main = async (event = {}) => {
  const { imageUrl, userId, mode = 'auto', autoStore = false } = event;

  const validationError = validateParams({ imageUrl, userId });
  if (validationError) {
    return validationError;
  }

  try {
    const recognition = await analyzeImage(imageUrl, mode);
    let storageSummary = null;

    if (autoStore && recognition.data.length > 0) {
      storageSummary = await persistRecognition(recognition, userId);
    }

    return {
      success: true,
      data: recognition,
      meta: {
        stored: Boolean(storageSummary),
        storageSummary
      }
    };
  } catch (error) {
    console.error('[deepseekAI] 执行失败:', error);
    return {
      success: false,
      error: error.code || 'AI_PROCESS_FAILED',
      detail: error.message || '未知错误'
    };
  }
};

function validateParams({ imageUrl, userId }) {
  if (!imageUrl) {
    return { success: false, error: 'MISSING_IMAGE_URL', detail: '缺少图片地址' };
  }
  if (!userId) {
    return { success: false, error: 'MISSING_USER_ID', detail: '缺少用户 ID' };
  }
  if (!QWEN_API_KEY) {
    return { success: false, error: 'MISSING_QWEN_API_KEY', detail: '未配置 Qwen API Key' };
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { success: false, error: 'MISSING_SUPABASE_CONFIG', detail: '未配置 Supabase 地址或密钥' };
  }
  return null;
}

async function analyzeImage(imageUrl, mode) {
  const payload = {
    model: QWEN_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: buildUserPrompt(mode) },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }
    ],
    temperature: 0.1,
    max_tokens: 1000
  };

  const response = await axios.post(
    `${QWEN_API_URL}/chat/completions`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${QWEN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: HTTP_TIMEOUT
    }
  );

  const content = extractMessageContent(response.data);
  const parsed = parseJsonPayload(content);
  return normalizeRecognition(parsed, mode);
}

function buildUserPrompt(mode) {
  if (mode === 'course') return '只提取课程表相关字段';
  if (mode === 'task') return '只提取待办事项相关字段';
  return '判断图片内容并提取课程表或待办事项数据';
}

function extractMessageContent(payload) {
  const choices = payload && payload.choices;
  if (!choices || !choices.length) {
    throw new Error('AI 未返回结果');
  }

  const content = choices[0].message && choices[0].message.content;
  if (!content) {
    throw new Error('AI 返回内容为空');
  }

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part) return '';
        if (typeof part === 'string') return part;
        if (part.text) return part.text;
        if (part.content) return part.content;
        return '';
      })
      .join('\n');
  }

  if (typeof content === 'object' && content.text) {
    return content.text;
  }

  throw new Error('无法解析 AI 返回内容');
}

function parseJsonPayload(text) {
  const cleaned = String(text || '').replace(/```json|```/gi, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('AI 输出不包含 JSON');
  }

  try {
    return JSON.parse(match[0]);
  } catch (error) {
    console.error('[deepseekAI] JSON 解析失败:', cleaned);
    throw new Error('AI JSON 解析失败');
  }
}

function normalizeRecognition(raw = {}, preferredMode = 'auto') {
  const type = typeof raw.type === 'string' ? raw.type.toLowerCase() : 'unknown';
  const rows = Array.isArray(raw.data) ? raw.data : [];

  if (type === 'schedule') {
    return { type: 'schedule', data: rows.map(normalizeCourse).filter(Boolean) };
  }

  if (type === 'todo') {
    return { type: 'todo', data: rows.map(normalizeTask).filter(Boolean) };
  }

  if (preferredMode === 'course') {
    return { type: 'schedule', data: rows.map(normalizeCourse).filter(Boolean) };
  }

  if (preferredMode === 'task') {
    return { type: 'todo', data: rows.map(normalizeTask).filter(Boolean) };
  }

  return { type: 'unknown', data: [] };
}

function normalizeCourse(item = {}) {
  const name = sanitizeText(item.name || item.subject || item.course);
  if (!name) return null;

  const day = normalizeDay(item.day || item.day_of_week || item.weekday);
  const start = toNumber(item.start || item.start_section || 1, 1);
  const length = toNumber(item.len || item.length || item.duration || 1, 1);

  return {
    name,
    day: day || 1,
    start,
    len: Math.max(1, length),
    location: sanitizeText(item.location || item.room || item.classroom),
    teacher: sanitizeText(item.teacher || item.mentor),
    weeks: normalizeWeeks(item.weeks),
    color: sanitizeText(item.color)
  };
}

function normalizeTask(item = {}) {
  const title = sanitizeText(item.title || item.name || item.subject);
  if (!title) return null;

  return {
    title,
    description: sanitizeText(item.description || item.details),
    deadline: normalizeDate(item.deadline || item.due || item.date || item.deadline_date),
    priority: normalizePriority(item.priority),
    category: sanitizeText(item.category || item.type || 'general') || 'general'
  };
}

function sanitizeText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function toNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeDay(value) {
  if (typeof value === 'number' && value >= 1 && value <= 7) return value;
  if (!value) return null;

  const dict = {
    '周一': 1,
    '星期一': 1,
    monday: 1,
    '周二': 2,
    '星期二': 2,
    tuesday: 2,
    '周三': 3,
    '星期三': 3,
    wednesday: 3,
    '周四': 4,
    '星期四': 4,
    thursday: 4,
    '周五': 5,
    '星期五': 5,
    friday: 5,
    '周六': 6,
    '星期六': 6,
    saturday: 6,
    '周日': 7,
    '星期日': 7,
    '周天': 7,
    sunday: 7
  };

  const key = String(value).trim().toLowerCase();
  return dict[key] || dict[value] || null;
}

function normalizeWeeks(value) {
  if (Array.isArray(value) && value.length) {
    return value
      .map((week) => Number(week))
      .filter((week) => Number.isInteger(week) && week > 0);
  }

  if (typeof value === 'string' && value.trim()) {
    const items = value.split(/[,，;；]/);
    const weeks = items
      .map((week) => Number(week.trim()))
      .filter((week) => Number.isInteger(week) && week > 0);
    if (weeks.length) {
      return weeks;
    }
  }

  return DEFAULT_WEEKS;
}

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
    return null;
  }

  const text = String(value).trim();
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }

  if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(text)) {
    const [year, month, day] = text.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const match = text.match(/(\d{1,2})月(\d{1,2})日/);
  if (match) {
    const year = new Date().getFullYear();
    return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function normalizePriority(value) {
  if (!value) return 'medium';
  const text = String(value).toLowerCase();
  if (text.includes('1') || text.includes('高') || text.includes('high')) return 'high';
  if (text.includes('3') || text.includes('低') || text.includes('low')) return 'low';
  if (text.includes('0') || text.includes('urgent')) return 'high';
  return 'medium';
}

async function persistRecognition(recognition, userId) {
  if (recognition.type === 'schedule') {
    return storeSchedules(recognition.data, userId);
  }
  if (recognition.type === 'todo') {
    return storeTasks(recognition.data, userId);
  }
  return null;
}

async function storeSchedules(items, userId) {
  const cache = new Map();
  let scheduleCount = 0;

  for (const course of items) {
    const cacheKey = `${course.name}|${course.teacher || ''}`;
    let courseId = cache.get(cacheKey);

    if (!courseId) {
      const color = COURSE_COLORS[cache.size % COURSE_COLORS.length];
      const payload = {
        user_id: userId,
        name: course.name,
        color,
        teacher: course.teacher || null,
        location: course.location || null
      };

      const inserted = await supabaseRequest('courses', 'POST', payload);
      courseId = inserted && inserted[0] && inserted[0].id;
      if (!courseId) {
        throw new Error('创建课程失败');
      }
      cache.set(cacheKey, courseId);
    }

    const schedulePayload = {
      user_id: userId,
      course_id: courseId,
      day_of_week: course.day || 1,
      start_section: course.start || 1,
      length: course.len || 1,
      weeks: course.weeks && course.weeks.length ? course.weeks : DEFAULT_WEEKS,
      location: course.location || null
    };

    await supabaseRequest('course_schedules', 'POST', schedulePayload);
    scheduleCount += 1;
  }

  return {
    insertedCourses: cache.size,
    insertedSchedules: scheduleCount
  };
}

async function storeTasks(items, userId) {
  if (!items.length) return null;
  const rows = items.map((task) => ({
    user_id: userId,
    title: task.title,
    description: task.description || null,
    deadline: toIsoDate(task.deadline),
    type: task.category || 'general',
    priority: task.priority || 'medium',
    status: 'pending'
  }));

  await supabaseRequest('tasks', 'POST', rows, true);
  return {
    insertedTasks: rows.length
  };
}

async function supabaseRequest(path, method, data, bulk = false) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const payload = bulk ? data : [data];

  const response = await axios({
    url,
    method: method || 'POST',
    data: payload,
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      apikey: SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    timeout: HTTP_TIMEOUT
  });

  if (response.status >= 200 && response.status < 300) {
    return response.data;
  }

  throw new Error(`Supabase 请求失败: ${response.status}`);
}

function toIsoDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const isoCandidate = text.length === 10 ? `${text}T00:00:00` : text;
  const date = new Date(isoCandidate);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
