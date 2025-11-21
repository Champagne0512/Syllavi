export const SUPABASE_URL = 'https://nqixahasfhwofusuwsal.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xaXhhaGFzZmh3b2Z1c3V3c2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2NjE1MjcsImV4cCI6MjA3OTIzNzUyN30.o0MpDV0Q_84iv2xY2TSNBwyaJh0BP8n8pLaIxS1ott4';

const DEFAULT_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json'
};

export const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

function request(path, { method = 'GET', data = null, query = '', headers = {} } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}${query ? `?${query}` : ''}`;

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data,
      header: {
        ...DEFAULT_HEADERS,
        ...headers
      },
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

export function fetchWeekSchedule(userId = DEMO_USER_ID) {
  const query = `select=id,day_of_week,start_section,length,weeks,course:courses(name,color,location)&user_id=eq.${userId}&order=day_of_week.asc`;
  return request('course_schedules', { query });
}

export function fetchTasks(userId = DEMO_USER_ID) {
  const query = `select=id,type,title,deadline,is_completed,related_course_id&user_id=eq.${userId}&order=deadline.asc`;
  return request('tasks', { query });
}

export function updateTaskCompletion(id, isCompleted) {
  const query = `id=eq.${id}`;
  return request('tasks', {
    query,
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation'
    },
    data: { is_completed: isCompleted }
  });
}

export function fetchResources(userId = DEMO_USER_ID) {
  return request('resources', {
    query: `select=id,file_name,file_type,file_url,subject&user_id=eq.${userId}`
  });
}
