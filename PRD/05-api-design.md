# 05 - API设计

## 5.1 API概览

### 基础信息

| 项目 | 值 |
|------|-----|
| Base URL | `https://nqixahasfhwofusuwsal.supabase.co` |
| REST API | `/rest/v1/{table}` |
| Edge Functions | `/functions/v1/{function}` |
| 认证方式 | Bearer Token (JWT) |
| 数据格式 | JSON |

### 通用请求头

```javascript
headers: {
  'apikey': 'SUPABASE_ANON_KEY',
  'Authorization': 'Bearer {JWT_TOKEN}',
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'  // POST/PATCH时返回数据
}
```

### 通用响应格式

**成功响应**:
```json
// GET 单条
{ "id": "...", "name": "..." }

// GET 列表
[{ "id": "...", "name": "..." }, ...]

// POST/PATCH
{ "id": "...", "name": "..." }

// DELETE
{}
```

**错误响应**:
```json
{
  "code": "PGRST301",
  "details": null,
  "hint": null,
  "message": "JWT expired"
}
```

---

## 5.2 认证相关 API

### 5.2.1 微信登录

**Edge Function**: `wechat-login`

**请求**:
```
POST /functions/v1/wechat-login
```

```json
{
  "code": "033aXX000xxxxx"
}
```

**响应**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "xxx",
  "expires_in": 604800,
  "user": {
    "id": "00000000-0000-0000-0000-000000000001",
    "wechat_openid": "oXXXX",
    "nickname": "同学",
    "created_at": "2025-01-01T00:00:00Z"
  }
}
```

**小程序调用示例**:
```javascript
async function wechatLogin() {
  const { code } = await wx.login();

  const res = await wx.request({
    url: `${SUPABASE_URL}/functions/v1/wechat-login`,
    method: 'POST',
    data: { code },
    header: { 'apikey': SUPABASE_ANON_KEY }
  });

  if (res.statusCode === 200) {
    wx.setStorageSync('access_token', res.data.access_token);
    wx.setStorageSync('user_id', res.data.user.id);
    return res.data.user;
  } else {
    throw new Error(res.data.error || '登录失败');
  }
}
```

### 5.2.2 刷新Token

**Edge Function**: `refresh-token`

**请求**:
```
POST /functions/v1/refresh-token
```

```json
{
  "refresh_token": "xxx"
}
```

**响应**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "xxx",
  "expires_in": 604800
}
```

---

## 5.3 用户相关 API

### 5.3.1 获取用户信息

**请求**:
```
GET /rest/v1/profiles?id=eq.{user_id}&select=*
```

**响应**:
```json
[{
  "id": "00000000-0000-0000-0000-000000000001",
  "wechat_openid": "oXXXX",
  "nickname": "小明",
  "avatar_url": "https://...",
  "school_name": "北京大学",
  "grade": "大三",
  "section_times": [...],
  "theme_preference": {},
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-01-01T00:00:00Z"
}]
```

### 5.3.2 更新用户信息

**请求**:
```
PATCH /rest/v1/profiles?id=eq.{user_id}
```

```json
{
  "nickname": "小红",
  "school_name": "清华大学",
  "grade": "大四"
}
```

**响应**: 更新后的完整用户对象

---

## 5.4 课程相关 API

### 5.4.1 获取所有课程

**请求**:
```
GET /rest/v1/courses?user_id=eq.{user_id}&select=*&order=name.asc
```

**响应**:
```json
[
  {
    "id": "10000000-0000-0000-0000-000000000001",
    "user_id": "00000000-0000-0000-0000-000000000001",
    "name": "高等数学",
    "color": "#9BB5CE",
    "location": "A3-302",
    "teacher": "张教授",
    "credits": 4.0,
    "created_at": "2025-01-01T00:00:00Z"
  }
]
```

### 5.4.2 创建课程

**请求**:
```
POST /rest/v1/courses
```

```json
{
  "user_id": "00000000-0000-0000-0000-000000000001",
  "name": "数据结构",
  "color": "#C9A5A0",
  "location": "B2-201",
  "teacher": "李教授",
  "credits": 3.0
}
```

**响应**: 创建的课程对象

### 5.4.3 更新课程

**请求**:
```
PATCH /rest/v1/courses?id=eq.{course_id}
```

```json
{
  "name": "数据结构与算法",
  "location": "B2-202"
}
```

### 5.4.4 删除课程

**请求**:
```
DELETE /rest/v1/courses?id=eq.{course_id}
```

**注意**: 会级联删除关联的 course_schedules

---

## 5.5 课程表相关 API

### 5.5.1 获取周课程表

**请求**:
```
GET /rest/v1/course_schedules
  ?user_id=eq.{user_id}
  &select=id,day_of_week,start_section,length,weeks,location,course:courses(id,name,color,location)
  &order=day_of_week.asc,start_section.asc
```

**响应**:
```json
[
  {
    "id": "20000000-0000-0000-0000-000000000001",
    "day_of_week": 1,
    "start_section": 1,
    "length": 2,
    "weeks": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
    "location": null,
    "course": {
      "id": "10000000-0000-0000-0000-000000000001",
      "name": "高等数学",
      "color": "#9BB5CE",
      "location": "A3-302"
    }
  }
]
```

**小程序调用示例**:
```javascript
export function fetchWeekSchedule(userId) {
  const query = [
    `user_id=eq.${userId}`,
    'select=id,day_of_week,start_section,length,weeks,location,course:courses(id,name,color,location)',
    'order=day_of_week.asc,start_section.asc'
  ].join('&');

  return request('course_schedules', { query });
}
```

### 5.5.2 创建排课

**请求**:
```
POST /rest/v1/course_schedules
```

```json
{
  "user_id": "00000000-0000-0000-0000-000000000001",
  "course_id": "10000000-0000-0000-0000-000000000001",
  "day_of_week": 3,
  "start_section": 3,
  "length": 2,
  "weeks": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
  "location": "C1-101"
}
```

### 5.5.3 批量创建排课（AI导入用）

**请求**:
```
POST /rest/v1/course_schedules
```

```json
[
  {
    "user_id": "...",
    "course_id": "...",
    "day_of_week": 1,
    "start_section": 1,
    "length": 2,
    "weeks": [...]
  },
  {
    "user_id": "...",
    "course_id": "...",
    "day_of_week": 2,
    "start_section": 3,
    "length": 2,
    "weeks": [...]
  }
]
```

---

## 5.6 任务相关 API

### 5.6.1 获取任务列表

**请求**:
```
GET /rest/v1/tasks
  ?user_id=eq.{user_id}
  &select=id,type,title,description,deadline,is_completed,progress,related_course_id
  &order=deadline.asc
```

**可选筛选**:
- `&type=eq.homework` - 仅作业
- `&type=eq.exam` - 仅考试
- `&is_completed=eq.false` - 仅未完成

**响应**:
```json
[
  {
    "id": "30000000-0000-0000-0000-000000000001",
    "type": "homework",
    "title": "操作系统实验报告",
    "description": "完成进程调度实验",
    "deadline": "2025-11-28T23:59:00Z",
    "is_completed": false,
    "progress": 45,
    "related_course_id": "10000000-0000-0000-0000-000000000002"
  }
]
```

### 5.6.2 创建任务

**请求**:
```
POST /rest/v1/tasks
```

```json
{
  "user_id": "00000000-0000-0000-0000-000000000001",
  "type": "homework",
  "title": "数据库设计作业",
  "description": "ER图设计",
  "deadline": "2025-12-01T23:59:00Z",
  "related_course_id": "10000000-0000-0000-0000-000000000003"
}
```

### 5.6.3 更新任务完成状态

**请求**:
```
PATCH /rest/v1/tasks?id=eq.{task_id}
```

```json
{
  "is_completed": true
}
```

**小程序调用示例**:
```javascript
export function updateTaskCompletion(id, isCompleted) {
  return request('tasks', {
    query: `id=eq.${id}`,
    method: 'PATCH',
    headers: { 'Prefer': 'return=representation' },
    data: { is_completed: isCompleted }
  });
}
```

### 5.6.4 更新任务进度

**请求**:
```
PATCH /rest/v1/tasks?id=eq.{task_id}
```

```json
{
  "progress": 75
}
```

### 5.6.5 删除任务

**请求**:
```
DELETE /rest/v1/tasks?id=eq.{task_id}
```

---

## 5.7 资料相关 API

### 5.7.1 获取资料列表

**请求**:
```
GET /rest/v1/resources
  ?user_id=eq.{user_id}
  &select=id,file_name,file_url,file_type,file_size,subject,ai_summary,created_at
  &order=created_at.desc
```

**按科目筛选**:
```
&subject=eq.高数
```

**响应**:
```json
[
  {
    "id": "40000000-0000-0000-0000-000000000001",
    "file_name": "Chapter_05.pdf",
    "file_url": "https://xxx.supabase.co/storage/v1/object/public/resources/...",
    "file_type": "pdf",
    "file_size": 1048576,
    "subject": "高数",
    "ai_summary": null,
    "created_at": "2025-01-01T00:00:00Z"
  }
]
```

### 5.7.2 创建资料记录

**请求**:
```
POST /rest/v1/resources
```

```json
{
  "user_id": "00000000-0000-0000-0000-000000000001",
  "file_name": "Lecture_01.pptx",
  "file_url": "https://xxx.supabase.co/storage/v1/object/public/resources/...",
  "file_type": "pptx",
  "file_size": 2097152,
  "subject": "AI工程"
}
```

### 5.7.3 更新AI摘要

**请求**:
```
PATCH /rest/v1/resources?id=eq.{resource_id}
```

```json
{
  "ai_summary": "## 核心概念\n- 机器学习基础\n- 神经网络结构\n\n## 重点公式\n- 损失函数\n- 反向传播"
}
```

### 5.7.4 删除资料

**请求**:
```
DELETE /rest/v1/resources?id=eq.{resource_id}
```

**注意**: 同时需要删除 Storage 中的文件

---

## 5.8 专注记录 API

### 5.8.1 获取专注记录

**请求**:
```
GET /rest/v1/focus_sessions
  ?user_id=eq.{user_id}
  &select=*
  &order=started_at.desc
  &limit=50
```

### 5.8.2 创建专注记录

**请求**:
```
POST /rest/v1/focus_sessions
```

```json
{
  "user_id": "00000000-0000-0000-0000-000000000001",
  "duration": 45,
  "started_at": "2025-01-01T10:00:00Z",
  "ended_at": "2025-01-01T10:45:00Z",
  "related_course_id": null,
  "completed": true
}
```

### 5.8.3 获取专注统计

**请求** (调用数据库函数):
```
POST /rest/v1/rpc/get_focus_stats
```

```json
{
  "p_user_id": "00000000-0000-0000-0000-000000000001"
}
```

**响应**:
```json
{
  "total_minutes": 1250,
  "session_count": 35,
  "streak_days": 7,
  "today_minutes": 90,
  "week_minutes": 420
}
```

---

## 5.9 Edge Functions API

### 5.9.1 AI解析课程表

**Edge Function**: `parse-schedule`

**请求**:
```
POST /functions/v1/parse-schedule
Authorization: Bearer {JWT_TOKEN}
```

```json
{
  "image_url": "https://xxx.supabase.co/storage/v1/object/public/temp/..."
}
```

**响应**:
```json
{
  "success": true,
  "type": "course",
  "data": [
    {
      "name": "高等数学",
      "day_of_week": 1,
      "start_section": 1,
      "length": 2,
      "location": "A3-302",
      "teacher": "张教授",
      "weeks": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]
    },
    {
      "name": "大学英语",
      "day_of_week": 2,
      "start_section": 3,
      "length": 2,
      "location": "B2-101",
      "teacher": "王老师",
      "weeks": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]
    }
  ]
}
```

### 5.9.2 AI解析任务通知

**Edge Function**: `parse-task`

**请求**:
```
POST /functions/v1/parse-task
Authorization: Bearer {JWT_TOKEN}
```

```json
{
  "image_url": "https://xxx.supabase.co/storage/v1/object/public/temp/..."
}
```

**响应**:
```json
{
  "success": true,
  "type": "task",
  "data": [
    {
      "type": "homework",
      "title": "提交实验报告",
      "deadline": "2025-11-28T23:59:00Z",
      "course": "操作系统"
    },
    {
      "type": "exam",
      "title": "期中考试",
      "deadline": "2025-12-05T14:00:00Z",
      "course": "数据结构"
    }
  ]
}
```

### 5.9.3 AI文件摘要

**Edge Function**: `summarize-file`

**请求**:
```
POST /functions/v1/summarize-file
Authorization: Bearer {JWT_TOKEN}
```

```json
{
  "file_url": "https://xxx.supabase.co/storage/v1/object/public/resources/...",
  "file_type": "pdf"
}
```

**响应**:
```json
{
  "success": true,
  "summary": "## 核心概念\n- 概念1: 解释\n- 概念2: 解释\n\n## 重要公式\n- 公式1\n- 公式2\n\n## 考点预测\n- 考点1\n- 考点2"
}
```

---

## 5.10 Storage API

### 5.10.1 上传文件

**请求**:
```
POST /storage/v1/object/{bucket}/{path}
Authorization: Bearer {JWT_TOKEN}
Content-Type: {mime-type}
```

**小程序调用示例**:
```javascript
async function uploadToStorage(bucket, filePath, fileName) {
  const token = wx.getStorageSync('access_token');
  const userId = wx.getStorageSync('user_id');
  const storagePath = `${userId}/${Date.now()}_${fileName}`;

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`,
      filePath: filePath,
      name: 'file',
      header: {
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY
      },
      success: (res) => {
        if (res.statusCode === 200) {
          const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;
          resolve(publicUrl);
        } else {
          reject(new Error('Upload failed'));
        }
      },
      fail: reject
    });
  });
}
```

### 5.10.2 获取公开URL

```javascript
function getPublicUrl(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}
```

### 5.10.3 删除文件

**请求**:
```
DELETE /storage/v1/object/{bucket}/{path}
Authorization: Bearer {JWT_TOKEN}
```

---

## 5.11 错误码参考

### HTTP状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 204 | 删除成功 |
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 409 | 冲突（如唯一约束） |
| 500 | 服务器错误 |

### PostgREST错误码

| 错误码 | 说明 |
|--------|------|
| PGRST000 | 连接失败 |
| PGRST100 | 权限不足 |
| PGRST200 | 查询错误 |
| PGRST300 | JWT相关 |
| PGRST301 | JWT过期 |
| PGRST302 | JWT格式错误 |

---

*下一章: [06 - AI功能实现](./06-ai-features.md)*
