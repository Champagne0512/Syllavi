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
  // 优先使用主键名，备用键名作为兜底
  let token = wx.getStorageSync('access_token');
  let refreshToken = wx.getStorageSync('refresh_token');
  let expiresAt = wx.getStorageSync('token_expires_at');
  
  // 如果主键名获取失败，尝试备用键名（重编译后可能存在的情况）
  if (!token) {
    token = wx.getStorageSync('syllaby_access_token');
  }
  if (!refreshToken) {
    refreshToken = wx.getStorageSync('syllaby_refresh_token');
  }
  if (!expiresAt) {
    expiresAt = wx.getStorageSync('syllaby_token_expires_at');
  }
  
  const now = Date.now();
  let authToken = token;
  
  // 如果token即将过期或已过期，尝试刷新
  if (expiresAt && (expiresAt - now) < 5 * 60 * 1000 && refreshToken) {
    // 这里异步刷新token会导致问题，暂时使用现有token
    console.warn('Token即将过期，但同步刷新会导致问题');
  }
  
  // 如果没有token，使用匿名密钥
  if (!authToken) {
    authToken = SUPABASE_ANON_KEY;
  }
  
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Prefer': 'return=representation',
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
  
  // 添加调试信息和认证状态
  const authStatus = checkAuthStatus();
  console.log(`[Supabase请求] ${method} ${url}`, {
    authenticated: authStatus.isAuthenticated,
    userId: authStatus.userId
  });
  
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data: requestData,
      header: finalHeaders,
      timeout: 10000, // 添加10秒超时
      success(res) {
        console.log(`[Supabase响应] 状态码: ${res.statusCode}`);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // 对于 DELETE 请求，即使没有数据返回也视为成功
          if (method === 'DELETE' && (res.data === null || res.data === '')) {
            resolve({ success: true, deleted: true });
          } else {
            resolve(res.data);
          }
        } else {
          console.error('[Supabase错误]', res);
          // 添加重试逻辑
          if (res.statusCode === 401) {
            console.log('尝试刷新令牌...');
            refreshToken().then(refreshResult => {
              if (refreshResult.success) {
                // 重新构建请求头
                const newHeaders = buildHeaders(headers);
                wx.request({
                  url,
                  method,
                  data: requestData,
                  header: newHeaders,
                  timeout: 10000,
                  success(retryRes) {
                    if (retryRes.statusCode >= 200 && retryRes.statusCode < 300) {
                      resolve(retryRes.data);
                    } else {
                      reject(retryRes);
                    }
                  },
                  fail(retryErr) {
                    reject(retryErr);
                  }
                });
              } else {
                reject(res);
              }
            });
          } else {
            reject(res);
          }
        }
      },
      fail(err) {
        console.error('[Supabase网络错误]', err);
        reject(err);
      }
    });
  });
}

// 从冲突文件中提取的用户认证函数
async function wechatLoginWithCode(code, retryCount = 0) {
  const MAX_RETRIES = 2;
  const TIMEOUT = 10000; // 10秒超时
  
  try {
    const response = await wx.request({
      url: `${SUPABASE_URL}/auth/v1/token?grant_type=authorization_code`,
      method: 'POST',
      timeout: TIMEOUT,
      header: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      data: {
        auth_code: code
      }
    });
    
    if (response.statusCode >= 200 && response.statusCode < 300 && response.data) {
      const { access_token, refresh_token, user } = response.data;
      
      // 同时写入新旧键名，确保重新编译后状态保持
      wx.setStorageSync('access_token', access_token);
      wx.setStorageSync('syllaby_access_token', access_token);
      
      if (refresh_token) {
        wx.setStorageSync('refresh_token', refresh_token);
        wx.setStorageSync('syllaby_refresh_token', refresh_token);
      }
      
      wx.setStorageSync('user_id', user.id);
      wx.setStorageSync('syllaby_user_id', user.id);
      
      return { success: true, user };
    } else {
      console.error('微信登录失败:', response);
      return { success: false, error: response };
    }
  } catch (error) {
    console.warn(`微信登录请求失败 (尝试 ${retryCount + 1}/${MAX_RETRIES + 1}):`, error);
    
    // 如果是网络错误且还有重试次数，则重试
    if (retryCount < MAX_RETRIES && (
      error.errMsg?.includes('request:fail') || 
      error.errMsg?.includes('timeout') ||
      error.errMsg?.includes('network')
    )) {
      console.log(`将在${2000}ms后重试...`);
      // 等待2秒后重试
      await new Promise(resolve => setTimeout(resolve, 2000));
      return wechatLoginWithCode(code, retryCount + 1);
    } else {
      console.error('微信登录请求失败:', error);
      return { success: false, error };
    }
  }
}

function emailPasswordLogin(email, password, retryCount = 0) {
  const MAX_RETRIES = 2;
  const TIMEOUT = 10000; // 10秒超时
  
  return new Promise((resolve, reject) => {
    const makeRequest = () => {
      wx.request({
        url: `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
        method: 'POST',
        data: { email, password },
        timeout: TIMEOUT,
        header: {
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        success(res) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            // 处理登录成功，存储token到所有键名
            if (res.data && res.data.access_token) {
              const accessToken = res.data.access_token;
              const refreshToken = res.data.refresh_token;
              const userId = res.data.user.id;
              
              // 同时写入新旧键名，确保重新编译后状态保持
              wx.setStorageSync('access_token', accessToken);
              wx.setStorageSync('syllaby_access_token', accessToken);
              
              if (refreshToken) {
                wx.setStorageSync('refresh_token', refreshToken);
                wx.setStorageSync('syllaby_refresh_token', refreshToken);
              }
              
              wx.setStorageSync('user_id', userId);
              wx.setStorageSync('syllaby_user_id', userId);
            }
            resolve(res.data);
          } else {
            reject(res.data || res);
          }
        },
        fail(err) {
          console.warn(`登录请求失败 (尝试 ${retryCount + 1}/${MAX_RETRIES + 1}):`, err);
          
          // 如果是网络错误且还有重试次数，则重试
          if (retryCount < MAX_RETRIES && (
            err.errMsg?.includes('request:fail') || 
            err.errMsg?.includes('timeout') ||
            err.errMsg?.includes('network')
          )) {
            console.log(`将在${2000}ms后重试...`);
            setTimeout(() => {
              emailPasswordLogin(email, password, retryCount + 1)
                .then(resolve)
                .catch(reject);
            }, 2000);
          } else {
            reject(err);
          }
        }
      });
    };
    
    makeRequest();
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
          // 如果自定义函数不存在，回退到直接使用Auth API
          signupViaAuth(email, password).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // 处理注册成功，存储token到所有键名
          if (res.data && res.data.access_token) {
            const accessToken = res.data.access_token;
            const refreshToken = res.data.refresh_token;
            const userId = res.data.user.id;
            
            // 同时写入新旧键名，确保重新编译后状态保持
            wx.setStorageSync('access_token', accessToken);
            wx.setStorageSync('syllaby_access_token', accessToken);
            
            if (refreshToken) {
              wx.setStorageSync('refresh_token', refreshToken);
              wx.setStorageSync('syllaby_refresh_token', refreshToken);
            }
            
            wx.setStorageSync('user_id', userId);
            wx.setStorageSync('syllaby_user_id', userId);
          }
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
          // 处理注册成功，存储token到所有键名
          if (res.data && res.data.access_token) {
            const accessToken = res.data.access_token;
            const refreshToken = res.data.refresh_token;
            const userId = res.data.user.id;
            
            // 同时写入新旧键名，确保重新编译后状态保持
            wx.setStorageSync('access_token', accessToken);
            wx.setStorageSync('syllaby_access_token', accessToken);
            
            if (refreshToken) {
              wx.setStorageSync('refresh_token', refreshToken);
              wx.setStorageSync('syllaby_refresh_token', refreshToken);
            }
            
            wx.setStorageSync('user_id', userId);
            wx.setStorageSync('syllaby_user_id', userId);
          }
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

async function refreshToken() {
  try {
    // 优先使用主键名，备用键名作为兜底
    let refresh_token = wx.getStorageSync('refresh_token');
    if (!refresh_token) {
      refresh_token = wx.getStorageSync('syllaby_refresh_token');
    }
    
    if (!refresh_token) {
      console.log('没有refresh token，清除过期的access token');
      // 清除所有键名
      wx.removeStorageSync('access_token');
      wx.removeStorageSync('syllaby_access_token');
      wx.removeStorageSync('token_expires_at');
      wx.removeStorageSync('syllaby_token_expires_at');
      return { success: false, error: 'No refresh token' };
    }

    const response = await wx.request({
      url: `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      method: 'POST',
      header: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      data: { refresh_token }
    });
    
    if (response.statusCode >= 200 && response.statusCode < 300 && response.data) {
      const { access_token, refresh_token: new_refresh_token, expires_in } = response.data;
      const newRefreshToken = new_refresh_token || refresh_token;
      
      // 同时写入新旧键名，确保重新编译后状态保持
      wx.setStorageSync('access_token', access_token);
      wx.setStorageSync('syllaby_access_token', access_token);
      
      if (newRefreshToken) {
        wx.setStorageSync('refresh_token', newRefreshToken);
        wx.setStorageSync('syllaby_refresh_token', newRefreshToken);
      }
      
      // 设置新的过期时间
      if (expires_in) {
        const expiresAt = Date.now() + expires_in * 1000;
        wx.setStorageSync('token_expires_at', expiresAt);
        wx.setStorageSync('syllaby_token_expires_at', expiresAt);
      }
      
      console.log('Token刷新成功');
      return { 
        success: true, 
        access_token, 
        refresh_token: newRefreshToken, 
        expires_in 
      };
    } else {
      console.warn('Token刷新失败:', response);
      // 清除所有无效的token键名
      wx.removeStorageSync('access_token');
      wx.removeStorageSync('syllaby_access_token');
      wx.removeStorageSync('refresh_token');
      wx.removeStorageSync('syllaby_refresh_token');
      wx.removeStorageSync('token_expires_at');
      wx.removeStorageSync('syllaby_token_expires_at');
      return { success: false, error: response };
    }
  } catch (error) {
    console.error('刷新令牌失败:', error);
    // 清除所有无效的token键名
    wx.removeStorageSync('access_token');
    wx.removeStorageSync('syllaby_access_token');
    wx.removeStorageSync('refresh_token');
    wx.removeStorageSync('syllaby_refresh_token');
    wx.removeStorageSync('token_expires_at');
    wx.removeStorageSync('syllaby_token_expires_at');
    return { success: false, error };
  }
}

// 检查用户认证状态
function checkAuthStatus() {
  // 优先使用主键名，备用键名作为兜底
  let token = wx.getStorageSync('access_token');
  let refreshToken = wx.getStorageSync('refresh_token');
  let expiresAt = wx.getStorageSync('token_expires_at');
  let userId = wx.getStorageSync('user_id');
  
  // 如果主键名获取失败，尝试备用键名（重编译后可能存在的情况）
  if (!token) {
    token = wx.getStorageSync('syllaby_access_token');
  }
  if (!refreshToken) {
    refreshToken = wx.getStorageSync('syllaby_refresh_token');
  }
  if (!expiresAt) {
    expiresAt = wx.getStorageSync('syllaby_token_expires_at');
  }
  if (!userId) {
    userId = wx.getStorageSync('syllaby_user_id');
  }
  
  console.log('认证状态检查:', {
    hasToken: !!token,
    hasRefreshToken: !!refreshToken,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    userId: userId
  });
  
  return {
    isAuthenticated: !!token && !!userId,
    hasRefreshToken: !!refreshToken,
    tokenExpiresAt: expiresAt,
    userId
  };
}

// 从冲突文件中提取的课程管理函数
async function fetchCourses(userId) {
  const query = `user_id=eq.${userId}&order=created_at.desc`;
  return request('courses', { query });
}

async function createCourse(courseData) {
  const rows = await request('courses', {
    method: 'POST',
    data: courseData
  });

  if (Array.isArray(rows)) {
    return rows;
  }

  // Supabase 也可能返回单个对象，保持调用方的数组解构写法
  if (rows && typeof rows === 'object') {
    return [rows];
  }

  return [];
}

async function updateCourse(id, updates) {
  const query = `id=eq.${id}`;
  return request('courses', {
    method: 'PATCH',
    query,
    data: updates
  });
}

async function deleteCourse(id) {
  const query = `id=eq.${id}`;
  return request('courses', {
    method: 'DELETE',
    query
  });
}

async function createCourseSchedules(schedules) {
  return request('course_schedules', {
    method: 'POST',
    data: schedules
  });
}

// 从冲突文件中提取的任务管理函数
async function fetchTasks(userId) {
  const query = `user_id=eq.${userId}&order=deadline.asc`;
  return request('tasks', { query });
}

// 获取包含小组任务的完整任务列表
async function fetchAllTasks(userId = DEMO_USER_ID) {
  try {
    // 获取个人任务（包括标记为小组任务的）
    const personalTasks = await fetchTasks(userId);
    
    // 处理标记为小组任务的个人任务
    const markedGroupTasks = (personalTasks || []).map(task => {
      if (task.title && task.title.startsWith('[小组任务]')) {
        return {
          ...task,
          type: 'group_task', // 标记为小组任务
          // 从描述中提取小组信息
          groupInfo: {
            groupId: extractGroupIdFromDescription(task.description) || null,
            groupName: extractGroupNameFromDescription(task.description) || '学习小组'
          }
        };
      }
      return task;
    });
    
    try {
      // 尝试获取用户的小组任务（如果表存在）
      const groupTaskQuery = [
        `user_id=eq.${userId}`,
        'select=task_id,is_completed,completed_at,assigned_at',
        'order=assigned_at.desc'
      ].join('&');
      
      const groupTaskMembers = await request('group_task_members', { query: groupTaskQuery });
      
      if (groupTaskMembers && groupTaskMembers.length > 0) {
        try {
          // 获取任务详细信息
          const taskIds = groupTaskMembers.map(member => member.task_id).join(',');
          
          // 先尝试使用关联查询
          let taskDetailsQuery = [
            `id=in.(${taskIds})`,
            'select=id,title,description,deadline,created_at,group_id,created_by,study_groups(id,name,description)'
          ].join('&');
          
          let taskDetails = [];
          
          try {
            taskDetails = await request('group_tasks', { query: taskDetailsQuery });
          } catch (relError) {
            console.warn('关联查询失败，尝试分离查询:', relError);
            
            // 如果关联查询失败，则分开查询任务和小组信息
            const taskDetailsOnlyQuery = [
              `id=in.(${taskIds})`,
              'select=id,title,description,deadline,created_at,group_id,created_by'
            ].join('&');
            
            taskDetails = await request('group_tasks', { query: taskDetailsOnlyQuery });
            
            // 获取小组信息
            const groupIds = [...new Set(taskDetails.map(t => t.group_id).filter(Boolean))];
            if (groupIds.length > 0) {
              const groupIdsStr = groupIds.join(',');
              const groupsQuery = [
                `id=in.(${groupIdsStr})`,
                'select=id,name,description'
              ].join('&');
              
              const groups = await request('study_groups', { query: groupsQuery });
              
              // 手动关联小组信息
              taskDetails = taskDetails.map(task => {
                const group = groups.find(g => g.id === task.group_id);
                return {
                  ...task,
                  study_groups: group || { id: task.group_id, name: '学习小组', description: '' }
                };
              });
            }
          }
          
          // 组合数据
          const groupTasks = groupTaskMembers.map(member => {
            const taskDetail = taskDetails.find(t => t.id === member.task_id);
            if (!taskDetail) return null;
            
            return {
              id: taskDetail.id,
              type: 'group_task', // 标记为小组任务
              title: taskDetail.title,
              description: taskDetail.description,
              deadline: taskDetail.deadline,
              is_completed: member.is_completed,
              progress: member.is_completed ? 1 : 0,
              related_course_id: null,
              course: null,
              // 添加小组相关信息
              groupInfo: {
                groupId: taskDetail.group_id,
                groupName: taskDetail.study_groups?.name || '学习小组',
                groupDescription: taskDetail.study_groups?.description || ''
              },
              // 添加小组任务特有字段
              task_member_id: member.id,
              assigned_at: member.assigned_at,
              completed_at: member.completed_at
            };
          }).filter(Boolean); // 过滤掉null值
          
          // 合并个人任务和小组任务，按截止时间排序
          const allTasks = markedGroupTasks.concat(groupTasks).sort((a, b) => {
            return new Date(a.deadline) - new Date(b.deadline);
          });
          
          return allTasks;
        } catch (groupTaskError) {
          console.warn('处理小组任务时出错，降级到只使用标记的个人任务:', groupTaskError);
        }
      }
    } catch (groupTaskError) {
      console.warn('无法获取小组任务表，只返回标记为小组任务的个人任务:', groupTaskError);
    }
    
    // 如果没有小组任务表或者获取失败，只返回标记为小组任务的个人任务
    return markedGroupTasks;
  } catch (error) {
    console.error('获取所有任务失败:', error);
    // 降级到只返回个人任务
    return fetchTasks(userId);
  }
}

// 从任务描述中提取小组名称
function extractGroupNameFromDescription(description) {
  if (!description) return null;
  
  // 查找"分配给: xxx"模式
  const match = description.match(/分配给:\s*(.+?)(?:\n|$)/);
  if (match && match[1]) {
    return match[1].trim();
  }
  
  return null;
}

// 从任务描述中提取小组ID
function extractGroupIdFromDescription(description) {
  if (!description) return null;
  
  // 查找"小组ID: xxx"模式
  const match = description.match(/小组ID:\s*(.+?)(?:\n|$)/);
  if (match && match[1]) {
    return match[1].trim();
  }
  
  return null;
}

// 从冲突文件中提取的其他必要函数
async function createTask(taskData) {
  return request('tasks', {
    method: 'POST',
    data: taskData
  });
}

async function updateTask(id, updates) {
  const query = `id=eq.${id}`;
  return request('tasks', {
    method: 'PATCH',
    query,
    data: updates
  });
}

async function deleteTask(id) {
  const query = `id=eq.${id}`;
  return request('tasks', {
    method: 'DELETE',
    query
  });
}

// 从冲突文件中提取的其他必要函数
async function fetchWeekSchedule(userId, startDate, endDate) {
  const filters = [`user_id=eq.${userId}`];
  if (startDate) {
    filters.push(`start_date=gte.${startDate}`);
  }
  if (endDate) {
    filters.push(`end_date=lte.${endDate}`);
  }
  
  // 构建查询参数
  const queryParts = [filters.join('&')];
  // 使用视图v_weekly_schedule，它已经预连接了课程信息
  queryParts.push('select=id,course_id,day_of_week,start_section,length,weeks,schedule_location,course_name,course_color,final_location,teacher');
  queryParts.push('order=day_of_week.asc,start_section.asc');
  const query = queryParts.join('&');

  // 使用预连接的视图查询，更稳定
  try {
    return await request('v_weekly_schedule', { query });
  } catch (error) {
    console.error('查询 v_weekly_schedule 失败:', error);
    throw error;
  }
}

// 专注统计相关函数
async function fetchFocusStats(userId) {
  // 直接查询数据库，避免云函数404错误
  return await fetchFocusStatsDirect(userId);
}

// 直接查询数据库获取专注统计
async function fetchFocusStatsDirect(userId) {
  try {
    // 先查询所有专注会话，然后在客户端计算统计
    const sessionQuery = [
      `user_id=eq.${userId}`,
      'completed=eq.true',
      'select=duration,started_at'
    ].join('&');
    
    const sessions = await request('focus_sessions', { query: sessionQuery });
    console.log('专注会话数据获取成功:', sessions?.length, '条记录');
    
    // 在客户端计算统计数据
    let totalMinutes = 0;
    let longestSession = 0;
    let totalSessions = 0;
    
    if (sessions && sessions.length > 0) {
      sessions.forEach(session => {
        const duration = Number(session.duration) || 0;
        totalMinutes += duration;
        longestSession = Math.max(longestSession, duration);
        totalSessions++;
      });
    }
    
    // 查询今日专注时间
    const today = new Date().toISOString().slice(0, 10);
    const todayQuery = [
      `user_id=eq.${userId}`,
      `date=eq.${today}`,
      'select=focus_minutes'
    ].join('&');
    
    const todayResult = await request('learning_heatmap', { query: todayQuery });
    const todayMinutes = todayResult && todayResult.length > 0 ? todayResult[0].focus_minutes : 0;
    console.log('今日专注时间:', todayMinutes);
    
    // 查询本周专注时间
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekQuery = [
      `user_id=eq.${userId}`,
      `date=gte.${weekStartStr}`,
      'select=focus_minutes'
    ].join('&');
    
    const weekResults = await request('learning_heatmap', { query: weekQuery });
    let weekMinutes = 0;
    if (weekResults && weekResults.length > 0) {
      weekMinutes = weekResults.reduce((sum, item) => sum + (Number(item.focus_minutes) || 0), 0);
    }
    console.log('本周专注时间:', weekMinutes);
    
    // 计算连续天数（简化版本，基于热力图数据）
    const streakQuery = [
      `user_id=eq.${userId}`,
      'order=date.desc',
      'limit=30',
      'select=date,focus_minutes'
    ].join('&');
    
    const streakResult = await request('learning_heatmap', { query: streakQuery });
    let streakDays = 0;
    if (streakResult && streakResult.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      for (let i = 0; i < streakResult.length; i++) {
        const record = streakResult[i];
        const recordDate = new Date(record.date);
        recordDate.setHours(0, 0, 0, 0);
        
        const diffDays = Math.floor((today - recordDate) / (1000 * 60 * 60 * 24));
        
        if (diffDays === i && record.focus_minutes > 0) {
          streakDays++;
        } else if (diffDays > i) {
          break;
        }
      }
    }
    console.log('连续天数:', streakDays);
    
    return {
      total_minutes: totalMinutes,
      total_sessions: totalSessions,
      longest_session: longestSession,
      avg_session_length: totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0,
      today_minutes: todayMinutes,
      streak_days: streakDays,
      continuous_days: streakDays,
      week_minutes: weekMinutes,
      night_owl_sessions: 0, // 需要复杂查询，暂时设为0
      early_bird_sessions: 0,
      deep_diver_sessions: 0
    };
  } catch (error) {
    console.error('直接查询专注统计失败:', error);
    return {
      total_minutes: 0,
      total_sessions: 0,
      longest_session: 0,
      avg_session_length: 0,
      today_minutes: 0,
      streak_days: 0,
      continuous_days: 0,
      week_minutes: 0,
      night_owl_sessions: 0,
      early_bird_sessions: 0,
      deep_diver_sessions: 0
    };
  }
}

// 获取专注热力图数据
async function fetchFocusHeatmapRemote(userId, days = 365) {
  try {
    const query = [
      `user_id=eq.${userId}`,
      'order=date.desc',
      `limit=${days}`,
      'select=date,focus_minutes,level'
    ].join('&');
    
    const result = await request('learning_heatmap', { query });
    console.log('热力图数据获取成功:', result?.length, '条记录');
    return result || [];
  } catch (error) {
    console.error('获取热力图数据失败:', error);
    return [];
  }
}

// 获取专注时段分布数据
async function fetchFocusDistributionRemote(userId) {
  try {
    // 查询专注会话的时段分布
    const query = [
      `user_id=eq.${userId}`,
      'completed=eq.true',
      'select=started_at'
    ].join('&');
    
    const sessions = await request('focus_sessions', { query });
    
    // 统计24小时分布
    const hourlyData = Array(24).fill(0);
    
    if (sessions && sessions.length > 0) {
      sessions.forEach(session => {
        if (session.started_at) {
          const hour = new Date(session.started_at).getHours();
          hourlyData[hour] += 1; // 统计次数，而不是分钟数
        }
      });
    }
    
    const distribution = hourlyData.map((count, hour) => ({
      hour: hour,
      sessions: count,
      minutes: count * 30, // 假设平均每次30分钟
      label: `${hour.toString().padStart(2, '0')}:00`
    }));
    
    console.log('时段分布数据获取成功:', distribution.length, '个小时段');
    return distribution;
  } catch (error) {
    console.error('获取时段分布失败:', error);
    return [];
  }
}

// 直接查询时段分布
async function fetchFocusDistributionDirect(userId) {
  try {
    // 这里需要根据实际的数据库表结构来查询
    // 暂时返回空数组，需要根据实际表结构调整
    return [];
  } catch (error) {
    console.error('获取时段分布失败:', error);
    return [];
  }
}

// 获取用户成就数据
async function fetchRemoteAchievementsSnapshot(userId) {
  try {
    // 直接查询成就表
    const query = [
      `user_id=eq.${userId}`,
      'order=unlocked_at.desc',
      'select=achievement_id,achievement_name,achievement_desc,achievement_icon,unlocked_at'
    ].join('&');
    
    const result = await request('achievements', { query });
    console.log('成就数据获取成功:', result?.length, '条记录');
    return result || [];
  } catch (error) {
    console.error('获取成就数据失败:', error);
    return [];
  }
}

// 直接查询成就数据
async function fetchAchievementsDirect(userId) {
  try {
    const query = [
      `user_id=eq.${userId}`,
      'order=unlocked_at.desc',
      'select=achievement_id,achievement_name,achievement_desc,achievement_icon,unlocked_at'
    ].join('&');
    
    return await request('achievements', { query });
  } catch (error) {
    console.error('获取成就数据失败:', error);
    return [];
  }
}

// 获取用户资料
async function fetchProfile(userId) {
  try {
    const query = [
      `id=eq.${userId}`,
      'select=nickname,school_name,grade,avatar_url,bio,created_at,updated_at'
    ].join('&');
    
    return await request('profiles', { query });
  } catch (error) {
    console.error('获取用户资料失败:', error);
    return [];
  }
}

// 更新用户资料
async function updateProfile(userId, profileData) {
  try {
    const query = `id=eq.${userId}`;
    return await request('profiles', {
      method: 'PATCH',
      query,
      data: profileData
    });
  } catch (error) {
    console.error('更新用户资料失败:', error);
    throw error;
  }
}

// 获取资源列表
async function fetchResources(userId) {
  try {
    const query = [
      `user_id=eq.${userId}`,
      'order=created_at.desc',
      'select=id,file_name,file_type,subject,file_size,ai_summary,created_at,file_url'
    ].join('&');
    
    return await request('resources', { query });
  } catch (error) {
    console.error('获取资源列表失败:', error);
    return [];
  }
}

async function createResource(resourceData) {
  try {
    return await request('resources', {
      method: 'POST',
      data: resourceData
    });
  } catch (error) {
    console.error('创建资源失败:', error);
    throw error;
  }
}

async function updateResource(id, updates) {
  try {
    const query = `id=eq.${id}`;
    return await request('resources', {
      method: 'PATCH',
      query,
      data: updates
    });
  } catch (error) {
    console.error('更新资源失败:', error);
    throw error;
  }
}

async function deleteResource(id) {
  try {
    const query = `id=eq.${id}`;
    return await request('resources', {
      method: 'DELETE',
      query
    });
  } catch (error) {
    console.error('删除资源失败:', error);
    throw error;
  }
}

function deleteFromStorage(bucket, path) {
  if (!bucket || !path) {
    return Promise.reject(new Error('缺少存储路径信息'));
  }

  const token = wx.getStorageSync('access_token') || SUPABASE_ANON_KEY;
  const normalizedPath = path.replace(/^\/+/, '');

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/storage/v1/object/${bucket}/${normalizedPath}`,
      method: 'DELETE',
      header: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data || null);
        } else {
          reject(res);
        }
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

function summarizeFile(fileUrl, fileType = 'pdf') {
  if (!fileUrl) {
    return Promise.reject(new Error('缺少文件地址'));
  }

  const token = wx.getStorageSync('access_token') || SUPABASE_ANON_KEY;
  const payload = {
    file_url: fileUrl,
    file_type: fileType
  };

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/functions/v1/summarize-file`,
      method: 'POST',
      data: payload,
      header: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const summaryText = res.data?.summary || '';
          resolve(summaryText);
        } else {
          reject(res);
        }
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

async function parseImageWithAI(imageUrl, mode = 'task', options = {}) {
  if (!imageUrl) {
    throw new Error('缺少图片地址');
  }
  if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
    throw new Error('当前环境未启用云开发能力');
  }

  const { userId = wx.getStorageSync('user_id') || DEMO_USER_ID } = options;

  console.log('[AI] 开始调用云函数解析图片:', { imageUrl, userId, mode });

  // 直接调用 deepseekAI 云函数 (同步模式)
  const result = await wx.cloud.callFunction({
    name: 'deepseekAI',
    data: {
      imageUrl,
      userId,
      mode
    }
  });

  console.log('[AI] 云函数响应:', result);

  if (!result.result) {
    throw new Error('云函数无响应');
  }

  if (!result.result.success) {
    throw new Error(result.result.error || 'AI 解析失败');
  }

  // 直接返回识别结果 (已经自动存储到数据库)
  return result.result.data;
}

function callAnalyzeImageFunction(data) {
  return wx.cloud
    .callFunction({
      name: 'analyzeImage',
      data
    })
    .then((res) => res?.result)
    .catch((error) => {
      console.error('[AI] 云函数调用失败', error);
      throw error;
    });
}

function normalizeAiPayload(raw = {}, preferredMode = 'task') {
  const aiType = typeof raw?.type === 'string' ? raw.type.toLowerCase() : '';
  let normalizedType = null;
  if (aiType === 'todo') {
    normalizedType = 'task';
  } else if (aiType === 'schedule') {
    normalizedType = 'course';
  }
  if (!normalizedType) {
    normalizedType = preferredMode === 'course' ? 'course' : 'task';
  }

  const sourceList = Array.isArray(raw?.data) ? raw.data : [];
  const normalizedData = normalizedType === 'task'
    ? sourceList.map(normalizeAiTask).filter(Boolean)
    : sourceList.map(normalizeAiCourse).filter(Boolean);

  return {
    type: normalizedType,
    rawType: aiType || null,
    data: normalizedData,
    raw
  };
}

function normalizeAiTask(item = {}) {
  const title = sanitizeText(item.title || item.name || item.subject);
  if (!title) return null;

  return {
    kind: 'task',
    title,
    type: mapTaskType(item.type),
    deadline: normalizeAiDeadline(item.deadline || item.due || item.date || item.deadline_date),
    course: sanitizeText(item.course || item.subject || ''),
    priority: (item.priority || 'medium').toLowerCase()
  };
}

function normalizeAiCourse(item = {}) {
  const name = sanitizeText(item.name || item.subject || item.title);
  if (!name) return null;

  const day = normalizeWeekdayNumber(item.day || item.day_of_week || item.weekday) || 1;
  const start = toFiniteNumber(item.start_section || item.startSection || item.start || 1) || 1;
  const endSection = toFiniteNumber(item.end_section || item.endSection || item.end) || start;
  const length = Math.max(1, toFiniteNumber(item.length) || endSection - start + 1);
  let weeks = Array.isArray(item.weeks)
    ? item.weeks
        .map((week) => toFiniteNumber(week))
        .filter((week) => typeof week === 'number' && week > 0)
    : [];

  return {
    kind: 'course',
    name,
    day_of_week: day,
    start_section: start,
    length,
    location: sanitizeText(item.location || item.room || ''),
    teacher: sanitizeText(item.teacher || ''),
    weeks
  };
}

function wait(duration = 600) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(200, duration)));
}

function mapTaskType(value) {
  const text = sanitizeText(value).toLowerCase();
  if (!text) return 'task';

  const includes = (keywords) => keywords.some((kw) => text.includes(kw));

  if (includes(['通知', '公告', 'notification', 'notice', 'announcement', '消息'])) {
    return 'notification';
  }

  if (includes(['lecture', '讲座', 'seminar', '分享会', '论坛'])) {
    return 'lecture';
  }

  if (includes(['event', '活动', 'party', 'festival', 'meetup', '音乐会', '运动会'])) {
    return 'event';
  }

  if (includes(['exam', 'test', '考试', '测验'])) {
    return 'exam';
  }

  return 'task';
}

function normalizeWeekdayNumber(value) {
  if (typeof value === 'number' && value >= 1 && value <= 7) {
    return value;
  }
  const map = {
    '周一': 1,
    '星期一': 1,
    monday: 1,
    mon: 1,
    '周二': 2,
    '星期二': 2,
    tuesday: 2,
    tue: 2,
    '周三': 3,
    '星期三': 3,
    wednesday: 3,
    wed: 3,
    '周四': 4,
    '星期四': 4,
    thursday: 4,
    thu: 4,
    '周五': 5,
    '星期五': 5,
    friday: 5,
    fri: 5,
    '周六': 6,
    '星期六': 6,
    saturday: 6,
    sat: 6,
    '周日': 7,
    '星期日': 7,
    sunday: 7,
    sun: 7
  };
  const key = sanitizeText(value).toLowerCase();
  return map[key] || null;
}

function sanitizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeAiDeadline(value) {
  if (!value && value !== 0) return '';
  if (typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  const text = sanitizeText(value);
  if (!text) return '';
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString();
  }
  return text;
}

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// 上传文件到存储
async function uploadToStorage(bucket, filePath, fileName, options = {}) {
  if (!bucket || !filePath) {
    throw new Error('缺少上传参数');
  }

  const userId = options.userId || wx.getStorageSync('user_id') || DEMO_USER_ID;
  const token = options.token || wx.getStorageSync('access_token') || SUPABASE_ANON_KEY;
  const originalName = fileName || filePath.split('/').pop() || `upload_${Date.now()}`;
  
  // 清理文件名，移除特殊字符和中文字符，只保留字母、数字、下划线、连字符和点
  const fileExt = originalName.includes('.') ? '.' + originalName.split('.').pop().toLowerCase() : '';
  const cleanName = originalName
    .split('.')[0] // 获取不带扩展名的文件名
    .replace(/[^\w.-]/g, '') // 移除所有非单词字符（保留字母、数字、下划线、连字符和点）
    .replace(/[\u4e00-\u9fa5]/g, '') // 移除中文字符
    .substring(0, 50); // 限制文件名长度
  
  // 确保文件名不为空，如果清空后为空，使用默认名称
  const safeName = cleanName || 'file';
  const storagePath = `${userId || 'public'}/${Date.now()}_${safeName}${fileExt}`;

  console.log('原始文件名:', originalName);
  console.log('清理后文件名:', safeName + fileExt);
  console.log('存储路径:', storagePath);

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`,
      filePath,
      name: 'file',
      header: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({
            path: storagePath,
            publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`,
            originalName: originalName // 保留原始文件名供显示使用
          });
        } else {
          console.error('上传失败，响应:', res);
          reject(res);
        }
      },
      fail(err) {
        console.error('上传失败，错误:', err);
        reject(err);
      }
    });
  });
}

module.exports = {
  request,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  DEMO_USER_ID,
  normalizeGradeInput,
  wechatLoginWithCode,
  emailPasswordLogin,
  emailPasswordSignUp,
  refreshToken,
  checkAuthStatus,
  fetchWeekSchedule,
  fetchCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  createCourseSchedules,
  fetchTasks,
  fetchAllTasks,
  createTask,
  updateTask,
  deleteTask,
  fetchFocusStats,
  fetchFocusHeatmapRemote,
  fetchFocusDistributionRemote,
  fetchRemoteAchievementsSnapshot,
  fetchProfile,
  updateProfile,
  fetchResources,
  createResource,
  updateResource,
  deleteResource,
  deleteFromStorage,
  summarizeFile,
  parseImageWithAI,
  uploadToStorage
};
