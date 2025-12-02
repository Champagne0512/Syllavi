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

async function refreshToken() {
  try {
    const refresh_token = wx.getStorageSync('refresh_token');
    if (!refresh_token) {
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
      const { access_token, refresh_token: new_refresh_token } = response.data;
      wx.setStorageSync('access_token', access_token);
      wx.setStorageSync('refresh_token', new_refresh_token);
      return { success: true };
    } else {
      return { success: false, error: response };
    }
  } catch (error) {
    console.error('刷新令牌失败:', error);
    return { success: false, error };
  }
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

module.exports = {
  request,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  DEMO_USER_ID,
  wechatLoginWithCode,
  refreshToken,
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
  deleteTask
};