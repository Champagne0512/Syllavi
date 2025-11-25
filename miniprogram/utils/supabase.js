// 内联年级验证逻辑，避免模块依赖问题
const ALLOWED_GRADES = ['大一', '大二', '大三', '大四', '研一', '研二', '研三', '博士'];
const normalizeGradeInput = (grade) => {
  if (!grade) return '';
  return ALLOWED_GRADES.includes(grade) ? grade : '';
};

export const SUPABASE_URL = 'https://nqixahasfhwofusuwsal.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xaXhhaGFzZmh3b2Z1c3V3c2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2NjE1MjcsImV4cCI6MjA3OTIzNzUyN30.o0MpDV0Q_84iv2xY2TSNBwyaJh0BP8n8pLaIxS1ott4';

export const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

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

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data,
      header: buildHeaders(headers),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          console.error('Supabase error', res);
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

// Auth & token helpers
export function wechatLoginWithCode(code) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/functions/v1/wechat-login`,
      method: 'POST',
      data: { code },
      header: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      success(res) {
        if (res.statusCode === 200) {
          resolve(res.data);
        } else {
          reject(res.data || res);
        }
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

export function refreshToken(refreshToken) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      method: 'POST',
      data: { refresh_token: refreshToken },
      header: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(res.data || res);
        }
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

export function emailPasswordLogin(email, password) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      method: 'POST',
      data: { email, password },
      header: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(res.data || res);
        }
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

export function emailPasswordSignUp(email, password) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/functions/v1/email-signup`,
      method: 'POST',
      data: { email, password },
      header: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      success(res) {
        if (res.statusCode === 404) {
          signupViaAuth(email, password).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(res.data || res);
        }
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

function signupViaAuth(email, password) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/auth/v1/signup`,
      method: 'POST',
      data: { email, password },
      header: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(res.data || res);
        }
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

// Domain data helpers

// --- Course & schedule ---
export function fetchWeekSchedule(userId = DEMO_USER_ID) {
  const query = [
    `user_id=eq.${userId}`,
    'select=id,day_of_week,start_section,length,weeks,location,course:courses(id,name,color,location)',
    'order=day_of_week.asc,start_section.asc'
  ].join('&');
  return request('course_schedules', { query });
}

export function fetchCourses(userId = DEMO_USER_ID) {
  const query = [
    `user_id=eq.${userId}`,
    'select=*',
    'order=name.asc'
  ].join('&');
  return request('courses', { query });
}

export function createCourse(payload) {
  return request('courses', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    data: payload
  });
}

export function updateCourse(id, patch) {
  return request('courses', {
    method: 'PATCH',
    query: `id=eq.${id}`,
    headers: { Prefer: 'return=representation' },
    data: patch
  });
}

export function deleteCourse(id) {
  return request('courses', {
    method: 'DELETE',
    query: `id=eq.${id}`
  });
}

export function createCourseSchedules(payloadArray) {
  // 支持批量创建排课，payloadArray 是对象数组
  return request('course_schedules', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    data: payloadArray
  });
}

// --- Tasks ---
export function fetchTasks(userId = DEMO_USER_ID) {
  const query = [
    `user_id=eq.${userId}`,
    'select=id,type,title,description,deadline,is_completed,progress,related_course_id',
    'order=deadline.asc'
  ].join('&');
  return request('tasks', { query });
}

export function createTask(payload) {
  return request('tasks', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    data: payload
  });
}

export function updateTask(id, patch) {
  return request('tasks', {
    method: 'PATCH',
    query: `id=eq.${id}`,
    headers: { Prefer: 'return=representation' },
    data: patch
  });
}

export function updateTaskCompletion(id, isCompleted) {
  return updateTask(id, { is_completed: isCompleted });
}

export function deleteTask(id) {
  return request('tasks', {
    method: 'DELETE',
    query: `id=eq.${id}`
  });
}

export function fetchResources(userId = DEMO_USER_ID) {
  const query = [
    `user_id=eq.${userId}`,
    'select=id,file_name,file_url,file_type,file_size,subject,ai_summary,created_at',
    'order=created_at.desc'
  ].join('&');
  return request('resources', { query });
}

export function createResource(payload) {
  return request('resources', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    data: payload
  });
}

export function updateResource(id, patch) {
  return request('resources', {
    method: 'PATCH',
    query: `id=eq.${id}`,
    headers: { Prefer: 'return=representation' },
    data: patch
  });
}

export function deleteResource(id) {
  return request('resources', {
    method: 'DELETE',
    query: `id=eq.${id}`
  });
}

// --- Focus sessions ---
export function createFocusSession(payload) {
  return request('focus_sessions', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    data: payload
  });
}

export function fetchFocusStats(userId = DEMO_USER_ID) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/rest/v1/rpc/get_focus_stats`,
      method: 'POST',
      data: { p_user_id: userId },
      header: buildHeaders(),
      success(res) {
        if (res.statusCode === 404) {
          // 函数未部署时返回空数据，避免前端整体失败
          resolve(null);
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const payload = Array.isArray(res.data) ? res.data[0] : res.data;
          resolve(payload || null);
        } else {
          reject(res.data || res);
        }
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

export function fetchFocusSessions(userId = DEMO_USER_ID) {
  const query = [
    `user_id=eq.${userId}`,
    'select=*',
    'order=started_at.desc',
    'limit=50'
  ].join('&');
  return request('focus_sessions', { query });
}

// --- Room reports (空教室众包, P2) ---
export function fetchRoomReports() {
  // 空教室信息对所有用户可见，这里不按用户过滤
  const query = [
    'select=id,building,room_name,floor,status,features,expires_at',
    'order=expires_at.asc'
  ].join('&');
  return request('room_reports', { query });
}

export function createRoomReport(payload) {
  return request('room_reports', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    data: payload
  });
}

export function deleteRoomReport(id) {
  return request('room_reports', {
    method: 'DELETE',
    query: `id=eq.${id}`
  });
}

// --- User profile ---
export function fetchProfile(userId = DEMO_USER_ID) {
  const query = [`id=eq.${userId}`, 'select=*'].join('&');
  return request('profiles', { query });
}

export function updateProfile(userId, patch) {
  console.log('updateProfile called with:', { userId, patch });
  
  const payload = {
    p_nickname: normalizeTextField(patch?.nickname),
    p_school_name: normalizeTextField(patch?.school_name),
    p_grade: normalizeGradeField(patch?.grade),
    p_bio: normalizeTextField(patch?.bio),
    p_avatar_url: normalizeTextField(patch?.avatar_url)
  };

  console.log('Sending payload to database:', payload);

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/rest/v1/rpc/update_profile_info`,
      method: 'POST',
      data: payload,
      header: buildHeaders(),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(res.data || res);
        }
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

// Storage helpers
export function uploadToStorage(bucket, filePath, fileName) {
  const token = wx.getStorageSync('access_token');
  const userId = wx.getStorageSync('user_id') || wx.getStorageSync('syllaby_user_id') || DEMO_USER_ID;
  const storagePath = `${userId}/${Date.now()}_${fileName}`;

  console.log('上传配置:', { bucket, filePath, fileName, userId, storagePath, token: !!token });

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`,
      filePath,
      name: 'file',
      header: {
        Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`
      },
      success(res) {
        console.log('上传响应:', { 
          statusCode: res.statusCode, 
          data: res.data
        });
        
        if (res.statusCode === 200 || res.statusCode === 201) {
          const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;
          console.log('文件上传成功:', { publicUrl, path: storagePath });
          resolve({ publicUrl, path: storagePath });
        } else {
          // 简化错误处理
          const error = new Error(`上传失败，状态码: ${res.statusCode}`);
          error.statusCode = res.statusCode;
          error.data = res.data;
          reject(error);
        }
      },
      fail(err) {
        console.error('上传请求失败:', err);
        reject(err);
      }
    });
  });
}

export function deleteFromStorage(bucket, path) {
  const token = wx.getStorageSync('access_token');
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`,
      method: 'DELETE',
      header: {
        Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY
      },
      success(res) {
        if (res.statusCode === 200 || res.statusCode === 204) {
          resolve(true);
        } else {
          reject(res.data || res);
        }
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

export function summarizeFile(fileUrl, fileType) {
  const token = wx.getStorageSync('access_token');
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/functions/v1/summarize-file`,
      method: 'POST',
      data: { file_url: fileUrl, file_type: fileType },
      header: {
        Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      success(res) {
        if (res.statusCode === 200 && res.data?.success) {
          resolve(res.data.summary);
        } else {
          reject(res.data || res);
        }
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

export function parseImageWithAI(imageUrl, mode = 'task') {
  const token = wx.getStorageSync('access_token');
  const fn = mode === 'course' ? 'parse-schedule' : 'parse-task';
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/functions/v1/${fn}`,
      method: 'POST',
      data: { image_url: imageUrl },
      header: {
        Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      success(res) {
        if (res.statusCode === 200 && res.data?.success) {
          resolve(res.data);
        } else {
          reject(res.data || res);
        }
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

// --- Profile & Stats (for profile page) ---
export function getUserStats(userId = DEMO_USER_ID) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/rest/v1/rpc/get_user_stats`,
      method: 'POST',
      data: { p_user_id: userId },
      header: buildHeaders(),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // 返回第一个结果
          resolve(Array.isArray(res.data) && res.data.length ? res.data[0] : null);
        } else {
          reject(res.data || res);
        }
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

export function fetchAchievements(userId = DEMO_USER_ID) {
  const query = [
    `user_id=eq.${userId}`,
    'select=*',
    'order=unlocked_at.desc'
  ].join('&');
  return request('achievements', { query });
}

export function checkAndUnlockAchievements(userId = DEMO_USER_ID) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/rest/v1/rpc/check_and_unlock_achievements`,
      method: 'POST',
      data: { p_user_id: userId },
      header: buildHeaders(),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(res.data || res);
        }
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

export function fetchLearningHeatmap(userId = DEMO_USER_ID, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const query = [
    `user_id=eq.${userId}`,
    `date=gte.${startDate.toISOString().split('T')[0]}`,
    'select=date,focus_minutes,tasks_completed,level',
    'order=date.asc'
  ].join('&');
  return request('learning_heatmap', { query });
}

export function updateLearningHeatmap(userId, date, focusMinutes, tasksCompleted) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/rest/v1/rpc/update_learning_heatmap`,
      method: 'POST',
      data: {
        p_user_id: userId,
        p_date: date,
        p_focus_minutes: focusMinutes,
        p_tasks_completed: tasksCompleted
      },
      header: buildHeaders(),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(res.data || res);
        }
      },
      fail(err) {
        reject(err);
      }
    });
  });
}
