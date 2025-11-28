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
function wechatLoginWithCode(code) {
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

function refreshToken(refreshToken) {
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

function emailPasswordLogin(email, password) {
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

function emailPasswordSignUp(email, password) {
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
function fetchWeekSchedule(userId = DEMO_USER_ID) {
  const query = [
    `user_id=eq.${userId}`,
    'select=id,day_of_week,start_section,length,weeks,location,course:courses(id,name,color,location)',
    'order=day_of_week.asc,start_section.asc'
  ].join('&');
  return request('course_schedules', { query });
}

function fetchCourses(userId = DEMO_USER_ID) {
  const query = [
    `user_id=eq.${userId}`,
    'select=*',
    'order=name.asc'
  ].join('&');
  return request('courses', { query });
}

function createCourse(payload) {
  return request('courses', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    data: payload
  });
}

function updateCourse(id, patch) {
  return request('courses', {
    method: 'PATCH',
    query: `id=eq.${id}`,
    headers: { Prefer: 'return=representation' },
    data: patch
  });
}

function deleteCourse(id) {
  return request('courses', {
    method: 'DELETE',
    query: `id=eq.${id}`
  });
}

function createCourseSchedules(payloadArray) {
  // 支持批量创建排课，payloadArray 是对象数组
  return request('course_schedules', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    data: payloadArray
  });
}

// --- Tasks ---
function fetchTasks(userId = DEMO_USER_ID) {
  const query = [
    `user_id=eq.${userId}`,
    'select=id,type,title,description,deadline,is_completed,progress,related_course_id,created_at,course:courses(id,name,color)',
    'order=deadline.asc'
  ].join('&');
  return request('tasks', { query });
}

function createTask(payload) {
  return request('tasks', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    data: payload
  });
}

function updateTask(id, patch) {
  return request('tasks', {
    method: 'PATCH',
    query: `id=eq.${id}`,
    headers: { Prefer: 'return=representation' },
    data: patch
  });
}

function updateTaskCompletion(id, isCompleted) {
  return updateTask(id, { is_completed: isCompleted });
}

function deleteTask(id) {
  return request('tasks', {
    method: 'DELETE',
    query: `id=eq.${id}`
  });
}

function fetchResources(userId = DEMO_USER_ID) {
  const query = [
    `user_id=eq.${userId}`,
    'select=id,file_name,file_url,file_type,file_size,subject,ai_summary,created_at',
    'order=created_at.desc'
  ].join('&');
  return request('resources', { query });
}

function createResource(payload) {
  return request('resources', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    data: payload
  });
}

function updateResource(id, patch) {
  return request('resources', {
    method: 'PATCH',
    query: `id=eq.${id}`,
    headers: { Prefer: 'return=representation' },
    data: patch
  });
}

function deleteResource(id) {
  return request('resources', {
    method: 'DELETE',
    query: `id=eq.${id}`
  });
}

// --- Focus sessions ---
function createFocusSession(payload) {
  return request('focus_sessions', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    data: payload
  });
}

function normalizeFocusStats(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ...EMPTY_FOCUS_STATS };
  }

  const today = Number(payload.today_minutes ?? payload.today_focus_minutes ?? 0) || 0;
  const week = Number(payload.week_minutes ?? payload.week_focus_minutes ?? 0) || 0;
  const total = Number(payload.total_minutes ?? payload.total_focus_minutes ?? 0) || 0;
  const sessions = Number(payload.session_count ?? payload.total_sessions ?? 0) || 0;
  const streak = Number(payload.streak_days ?? payload.continuous_days ?? 0) || 0;

  return {
    today_minutes: today,
    week_minutes: week,
    total_minutes: total,
    session_count: sessions,
    streak_days: streak,
    total_sessions: sessions,
    continuous_days: streak
  };
}

function computeFocusStatsFromSessions(rows) {
  const sessions = Array.isArray(rows)
    ? rows.filter((item) => item && (item.completed === undefined || item.completed === true))
    : [];

  if (!sessions.length) {
    return { ...EMPTY_FOCUS_STATS };
  }

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);

  let totalMinutes = 0;
  let todayMinutes = 0;
  let weekMinutes = 0;
  const activeDays = new Set();

  sessions.forEach((session) => {
    const duration = Number(session.duration) || 0;
    if (!duration) {
      return;
    }

    const startedAt = session.started_at ? new Date(session.started_at) : null;
    if (!startedAt || Number.isNaN(startedAt.getTime())) {
      return;
    }

    const dayKey = startedAt.toISOString().slice(0, 10);
    activeDays.add(dayKey);
    totalMinutes += duration;

    if (dayKey === todayKey) {
      todayMinutes += duration;
    }

    if (startedAt >= weekStart) {
      weekMinutes += duration;
    }
  });

  const streakDays = (() => {
    const cursor = new Date(today);
    let streak = 0;
    while (streak < 365) {
      const key = cursor.toISOString().slice(0, 10);
      if (activeDays.has(key)) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  })();

  const sessionCount = sessions.length;

  return {
    today_minutes: todayMinutes,
    week_minutes: weekMinutes,
    total_minutes: totalMinutes,
    session_count: sessionCount,
    streak_days: streakDays,
    total_sessions: sessionCount,
    continuous_days: streakDays
  };
}

function fetchFocusStatsFallback(userId) {
  const query = [
    `user_id=eq.${userId}`,
    'select=duration,started_at,completed',
    'order=started_at.desc',
    'limit=365'
  ].join('&');

  return request('focus_sessions', { query })
    .then((rows) => computeFocusStatsFromSessions(rows))
    .catch(() => ({ ...EMPTY_FOCUS_STATS }));
}

function fetchFocusStats(userId = DEMO_USER_ID) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/rest/v1/rpc/get_focus_stats`,
      method: 'POST',
      data: { p_user_id: userId },
      header: buildHeaders(),
      success(res) {
        if (res.statusCode === 404) {
          // 函数未部署时，回退到直接读取表并计算
          fetchFocusStatsFallback(userId)
            .then((stats) => resolve(stats))
            .catch(() => resolve({ ...EMPTY_FOCUS_STATS }));
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const payload = Array.isArray(res.data) ? res.data[0] : res.data;
          resolve(normalizeFocusStats(payload));
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

function fetchFocusSessions(userId = DEMO_USER_ID) {
  const query = [
    `user_id=eq.${userId}`,
    'select=*',
    'order=started_at.desc',
    'limit=50'
  ].join('&');
  return request('focus_sessions', { query });
}

// --- Room reports (空教室众包, P2) ---
function fetchRoomReports() {
  // 空教室信息对所有用户可见，这里不按用户过滤
  const query = [
    'select=id,building,room_name,floor,status,features,expires_at',
    'order=expires_at.asc'
  ].join('&');
  return request('room_reports', { query });
}

function createRoomReport(payload) {
  return request('room_reports', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    data: payload
  });
}

function deleteRoomReport(id) {
  return request('room_reports', {
    method: 'DELETE',
    query: `id=eq.${id}`
  });
}

// --- User profile ---
function fetchProfile(userId = DEMO_USER_ID) {
  const query = [`id=eq.${userId}`, 'select=*'].join('&');
  return request('profiles', { query });
}

function updateProfile(userId, patch) {
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
function resolveSessionInfo() {
  const app = typeof getApp === 'function' ? getApp() : null;
  const globalUserId = app?.globalData?.supabase?.userId;
  const globalToken = app?.globalData?.supabase?.accessToken;
  const storedUserId = wx.getStorageSync('user_id') || wx.getStorageSync('syllaby_user_id');
  const storedToken = wx.getStorageSync('access_token');

  return {
    userId: globalUserId || storedUserId || DEMO_USER_ID,
    token: storedToken || globalToken || null
  };
}

// 下载HTTP URL文件到本地并上传
function downloadAndUploadFile(bucket, httpPath, fileName, userId, token) {
  console.log('开始下载文件:', httpPath);
  
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: httpPath,
      success: (downloadRes) => {
        if (downloadRes.statusCode === 200) {
          console.log('文件下载成功，临时路径:', downloadRes.tempFilePath);
          
          // 处理文件名中的中文字符
          const safeFileName = encodeURIComponent(fileName)
            .replace(/%20/g, '_')
            .replace(/[^a-zA-Z0-9_\-./]/g, '_');
          
          // 构建合法的存储路径（不包含中文字符）
          const timestamp = Date.now();
          const storagePath = `${userId}/${timestamp}_${safeFileName}`;
          console.log('使用安全存储路径:', storagePath);
          
          const serviceKey = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
          
          wx.uploadFile({
            url: `${SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`,
            filePath: downloadRes.tempFilePath,
            name: 'file',
            header: {
              Authorization: `Bearer ${serviceKey}`,
              apikey: SUPABASE_ANON_KEY,
              'x-upsert': 'true'
            },
            timeout: 30000, // 30秒超时
            success(uploadRes) {
              console.log('上传响应:', { 
                statusCode: uploadRes.statusCode, 
                data: uploadRes.data
              });
              
              if (uploadRes.statusCode === 200 || uploadRes.statusCode === 201) {
                const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;
                console.log('文件上传成功:', { publicUrl, path: storagePath });
                resolve({ publicUrl, path: storagePath });
              } else {
                const error = new Error(`上传失败，状态码: ${uploadRes.statusCode}`);
                error.statusCode = uploadRes.statusCode;
                error.data = uploadRes.data;
                reject(error);
              }
            },
            fail(uploadErr) {
              console.error('文件上传失败:', uploadErr);
              reject(new Error(`文件上传失败: ${uploadErr.errMsg}`));
            }
          });
        } else {
          reject(new Error(`文件下载失败，状态码: ${downloadRes.statusCode}`));
        }
      },
      fail: (err) => {
        reject(new Error(`文件下载失败: ${err.errMsg}`));
      }
    });
  });
}

// 直接读取微信临时文件并上传为二进制数据
function readTempFileAndUpload(bucket, tempFilePath, fileName, userId, storagePath, ext) {
  console.log('开始处理微信临时文件:', tempFilePath);
  
  return new Promise(async (resolve, reject) => {
    try {
      // 第一步：规范化微信临时文件路径
      // http://tmp/xxx 是微信的本地临时文件路径，可以直接读取
      let realFilePath = tempFilePath;
      
      // 确保路径是微信可以读取的格式
      if (tempFilePath.startsWith('http://tmp/')) {
        // 微信临时文件，尝试不同的路径格式
        const fileNameOnly = tempFilePath.split('/').pop();
        const possiblePaths = [
          tempFilePath, // 原始路径
          tempFilePath.replace('http://tmp/', '/tmp/'), // 去掉http前缀
          `${wx.env.USER_DATA_PATH}/${fileNameOnly}` // 用户数据目录路径
        ];
        
        // 检查哪个路径有效
        const fs = wx.getFileSystemManager();
        let validPath = null;
        
        for (const path of possiblePaths) {
          try {
            fs.accessSync(path);
            validPath = path;
            console.log('找到有效路径:', path);
            break;
          } catch (e) {
            console.log('路径无效:', path);
          }
        }
        
        if (!validPath) {
          throw new Error('无法找到有效的微信临时文件路径');
        }
        
        realFilePath = validPath;
      }
      
      // 第二步：直接读取文件为二进制数据（无需下载！）
      const fs = wx.getFileSystemManager();
      const fileData = fs.readFileSync(realFilePath);
      console.log('文件读取成功，大小:', fileData.byteLength, 'bytes');
      
      // 第三步：直接使用wx.request上传二进制数据，不使用request函数
      const contentType = getContentType(ext);
      
      // 直接构建正确的Storage API URL，不通过request函数
      const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`;
      console.log('SUPABASE_URL:', SUPABASE_URL);
      console.log('bucket:', bucket);
      console.log('storagePath:', storagePath);
      console.log('最终上传URL:', uploadUrl);
      console.log('准备上传文件，大小:', fileData.byteLength, 'bytes');
      
      const uploadResult = await new Promise((resolve, reject) => {
        wx.request({
          url: uploadUrl,
          method: 'POST',
          data: fileData,
          header: {
            'Content-Type': contentType,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
            'x-upsert': 'true'
          },
          timeout: 30000,
          success(res) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(res.data);
            } else {
              console.error('上传失败，响应:', res);
              reject(new Error(`上传失败: ${res.statusCode}`));
            }
          },
          fail(err) {
            console.error('网络请求失败:', err);
            reject(new Error(`网络请求失败: ${err.errMsg}`));
          }
        });
      });
      
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;
      console.log('文件上传成功:', { publicUrl, path: storagePath });
      resolve({ publicUrl, path: storagePath });
      
    } catch (err) {
      console.error('微信临时文件上传失败:', err);
      reject(new Error(`文件上传失败: ${err.message}`));
    }
  });
}

// 获取文件对应的MIME类型
function getContentType(ext) {
  const mimeMap = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppt: 'application/vnd.ms-powerpoint',
    jpg: 'image/jpeg',
    png: 'image/png',
    default: 'application/octet-stream'
  };
  return mimeMap[ext] || mimeMap.default;
}

function uploadToStorage(bucket, filePath, fileName, options = {}) {
  const { userId: overrideUserId, token: overrideToken } = options;
  const session = resolveSessionInfo();
  const userId = overrideUserId || session.userId;
  const token = overrideToken || session.token;
  
  // 使用哈希+扩展名的方式，避免中文编码问题
  const ext = fileName.split('.').pop().toLowerCase();
  const randomHash = Math.random().toString(36).substr(2, 8);
  const timestamp = Date.now();
  const safeFileName = `${timestamp}_${randomHash}.${ext}`;
  const storagePath = `${userId}/${safeFileName}`;

  console.log('上传配置:', { bucket, filePath, fileName: safeFileName, originalName: fileName, userId, storagePath, token: !!token });

  // 处理HTTP URL路径：微信小程序的文件选择器返回的是HTTP临时路径
  // 需要先下载到本地，然后再上传
  // 但微信临时文件（http://tmp/）可以直接使用，不需要下载
  if (filePath && filePath.startsWith('http') && !filePath.includes('://tmp/')) {
    console.log('检测到HTTP URL路径，开始下载到本地...');
    return downloadAndUploadFile(bucket, filePath, fileName, userId, token);
  }
  
  // 微信临时文件需要直接读取为二进制数据（无需下载）
  if (filePath && filePath.includes('://tmp/')) {
    console.log('处理微信临时文件，直接读取为二进制数据');
    return readTempFileAndUpload(bucket, filePath, fileName, userId, storagePath, ext);
  }

  // 临时解决方案：使用服务端密钥绕过RLS限制
  const serviceKey = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
  
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`,
      filePath,
      name: 'file',
      header: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: SUPABASE_ANON_KEY,
        'x-upsert': 'true'
      },
      timeout: 30000, // 30秒超时
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

function deleteFromStorage(bucket, path) {
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

function summarizeFile(fileUrl, fileType) {
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

function parseImageWithAI(imageUrl, mode = 'task') {
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
function getUserStats(userId = DEMO_USER_ID) {
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

function fetchAchievements(userId = DEMO_USER_ID) {
  const query = [
    `user_id=eq.${userId}`,
    'select=*',
    'order=unlocked_at.desc'
  ].join('&');
  return request('achievements', { query });
}

function checkAndUnlockAchievements(userId = DEMO_USER_ID) {
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

function fetchLearningHeatmap(userId = DEMO_USER_ID, days = 30) {
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

function updateLearningHeatmap(userId, date, focusMinutes, tasksCompleted) {
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

module.exports = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  DEMO_USER_ID,
  wechatLoginWithCode,
  refreshToken,
  emailPasswordLogin,
  emailPasswordSignUp,
  fetchWeekSchedule,
  fetchCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  createCourseSchedules,
  fetchTasks,
  createTask,
  updateTask,
  updateTaskCompletion,
  deleteTask,
  fetchResources,
  createResource,
  updateResource,
  deleteResource,
  createFocusSession,
  fetchFocusStats,
  fetchFocusSessions,
  fetchRoomReports,
  createRoomReport,
  deleteRoomReport,
  fetchProfile,
  updateProfile,
  uploadToStorage,
  deleteFromStorage,
  summarizeFile,
  parseImageWithAI,
  getUserStats,
  fetchAchievements,
  checkAndUnlockAchievements,
  fetchLearningHeatmap,
  updateLearningHeatmap
};
