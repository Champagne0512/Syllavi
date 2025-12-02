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
  const refreshToken = wx.getStorageSync('refresh_token');
  
  // 检查token是否过期
  const expiresAt = wx.getStorageSync('token_expires_at');
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
async function wechatLoginWithCode(code) {
  try {
    const response = await wx.request({
      url: `${SUPABASE_URL}/auth/v1/token?grant_type=authorization_code`,
      method: 'POST',
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
      wx.setStorageSync('access_token', access_token);
      wx.setStorageSync('refresh_token', refresh_token);
      wx.setStorageSync('user_id', user.id);
      return { success: true, user };
    } else {
      console.error('微信登录失败:', response);
      return { success: false, error: response };
    }
  } catch (error) {
    console.error('微信登录请求失败:', error);
    return { success: false, error };
  }
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
          // 处理登录成功，存储token
          if (res.data && res.data.access_token) {
            wx.setStorageSync('access_token', res.data.access_token);
            wx.setStorageSync('refresh_token', res.data.refresh_token);
            wx.setStorageSync('user_id', res.data.user.id);
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
          // 处理注册成功，存储token
          if (res.data && res.data.access_token) {
            wx.setStorageSync('access_token', res.data.access_token);
            wx.setStorageSync('refresh_token', res.data.refresh_token);
            wx.setStorageSync('user_id', res.data.user.id);
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
          // 处理注册成功，存储token
          if (res.data && res.data.access_token) {
            wx.setStorageSync('access_token', res.data.access_token);
            wx.setStorageSync('refresh_token', res.data.refresh_token);
            wx.setStorageSync('user_id', res.data.user.id);
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
    const refresh_token = wx.getStorageSync('refresh_token');
    if (!refresh_token) {
      console.log('没有refresh token，清除过期的access token');
      wx.removeStorageSync('access_token');
      wx.removeStorageSync('token_expires_at');
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
      wx.setStorageSync('access_token', access_token);
      wx.setStorageSync('refresh_token', new_refresh_token || refresh_token);
      
      // 设置新的过期时间
      if (expires_in) {
        const expiresAt = Date.now() + expires_in * 1000;
        wx.setStorageSync('token_expires_at', expiresAt);
      }
      
      console.log('Token刷新成功');
      return { success: true };
    } else {
      console.warn('Token刷新失败:', response);
      // 清除无效的token
      wx.removeStorageSync('access_token');
      wx.removeStorageSync('refresh_token');
      wx.removeStorageSync('token_expires_at');
      return { success: false, error: response };
    }
  } catch (error) {
    console.error('刷新令牌失败:', error);
    // 清除无效的token
    wx.removeStorageSync('access_token');
    wx.removeStorageSync('refresh_token');
    wx.removeStorageSync('token_expires_at');
    return { success: false, error };
  }
}

// 检查用户认证状态
function checkAuthStatus() {
  const token = wx.getStorageSync('access_token');
  const refreshToken = wx.getStorageSync('refresh_token');
  const expiresAt = wx.getStorageSync('token_expires_at');
  const userId = wx.getStorageSync('user_id');
  
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
  const { data, error } = await request('courses', {
    method: 'POST',
    data: courseData
  });
  return { data, error };
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
  const query = [
    `user_id=eq.${userId}`,
    `start_date=gte.${startDate}`,
    `end_date=lte.${endDate}`,
    'order=start_time.asc'
  ].join('&');
  return request('week_schedules', { query });
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

// 上传文件到存储
async function uploadToStorage(bucket, filePath, fileName, options = {}) {
  try {
    const { userId, token } = options;
    const formData = new FormData();
    
    // 读取文件
    const fileData = await new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath,
        success: resolve,
        fail: reject
      });
    });
    
    // 构建FormData
    formData.append('file', new Blob([fileData]), fileName);
    
    const response = await wx.request({
      url: `${SUPABASE_URL}/storage/v1/object/${bucket}/${fileName}`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      },
      data: formData
    });
    
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return {
        publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${fileName}`
      };
    } else {
      throw new Error('上传失败');
    }
  } catch (error) {
    console.error('文件上传失败:', error);
    throw error;
  }
}

module.exports = {
  request,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  DEMO_USER_ID,
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
  uploadToStorage
};