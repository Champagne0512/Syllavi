// 内联年级验证逻辑，避免模块依赖问题
const ALLOWED_GRADES = ['大一', '大二', '大三', '大四', '研一', '研二', '研三', '博士'];
const normalizeGradeInput = (grade) => {
  if (!grade) return '';
  return ALLOWED_GRADES.includes(grade) ? grade : '';
};

const SUPABASE_URL = 'https://nqixahasfhwofusuwsal.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xaXhhaGFzZmh3b2Z1c3V3c2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2NjE1MjcsImV4cCI6MjA3OTIzNzUyN30.o0MpDV0Q_84iv2xY2TSNBwyaJh0BP8n8pLaIxS1ott4';
// 服务端密钥，用于绕过RLS限制
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xaXhhaGFzZmh3b2Z1c3V3c2FsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzY2MTUyNywiZXhwIjoyMDc5MjM3NTI3fQ.uNUTizbVayqD9Q4GQYwHjtPCrJfKDy6CTvsNaWIhCJs';

const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';
const EMPTY_FOCUS_STATS = Object.freeze({
  today_minutes: 0,
  week_minutes: 0,
  total_minutes: 0,
  session_count: 0,
  streak_days: 0,
  total_sessions: 0,
  continuous_days: 0
});

const normalizeTextField = (value) => {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
};

const normalizeGradeField = (value) => {
  const normalized = normalizeTextField(value);
  if (!normalized) return null;
  const allowed = normalizeGradeInput(normalized);
  return allowed || null;
};

function buildHeaders(extra = {}) {
  const token = wx.getStorageSync('access_token');
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

function request(path, { method = 'GET', data = null, query = '', headers = {} } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}${query ? `?${query}` : ''}`;

  // 确保数据被正确序列化
  let requestData = data
  if (data && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    requestData = JSON.stringify(data)
  }

  const finalHeaders = buildHeaders(headers);
  
  // 添加调试信息
  if (method === 'POST' && (path === 'group_tasks' || path === 'group_task_members')) {
    console.log('请求URL:', url);
    console.log('请求方法:', method);
    console.log('请求头:', finalHeaders);
    console.log('请求数据:', requestData);
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data: requestData,
      header: finalHeaders,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // 对于 DELETE 请求，即使没有数据返回也视为成功
          if (method === 'DELETE' && (res.data === null || res.data === '')) {
            resolve({ success: true, deleted: true });
          } else {
            resolve(res.data);
          }
        } else {
          console.error('Supabase error', res);
          // 添加更多错误信息
          if (res.statusCode === 400 || res.statusCode === 401) {
            console.error('权限或数据格式错误:', res.data);
          }
          reject(res);
        }
      },
      fail(err) {
        console.error('Supabase network issue', err);
        reject(err);
      }
    });
  });
}