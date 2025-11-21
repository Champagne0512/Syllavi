# 03 - 技术架构

## 3.1 整体架构

### 架构图

```
┌─────────────────────────────────────────────────────────┐
│                    微信小程序 (前端)                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
│  │   Hub   │  │  Tasks  │  │Knowledge│  │  Focus  │    │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘    │
│       │            │            │            │          │
│  ┌────┴────────────┴────────────┴────────────┴────┐    │
│  │              Utils / Services                   │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐      │    │
│  │  │ supabase │  │  colors  │  │   auth   │      │    │
│  │  └────┬─────┘  └──────────┘  └────┬─────┘      │    │
│  └───────┼───────────────────────────┼────────────┘    │
└──────────┼───────────────────────────┼─────────────────┘
           │                           │
           ▼                           ▼
┌─────────────────────────────────────────────────────────┐
│                   Supabase (后端)                        │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  REST API   │  │   Auth      │  │   Storage   │     │
│  │ (PostgREST) │  │ (GoTrue)    │  │   (S3)      │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │             │
│  ┌──────┴────────────────┴────────────────┴──────┐     │
│  │              PostgreSQL Database              │     │
│  └───────────────────────────────────────────────┘     │
│                                                         │
│  ┌─────────────────────────────────────────────┐       │
│  │           Edge Functions (Deno)              │       │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐   │       │
│  │  │  wechat  │  │  parse   │  │summarize │   │       │
│  │  │  login   │  │ schedule │  │  file    │   │       │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘   │       │
│  └───────┼─────────────┼─────────────┼─────────┘       │
└──────────┼─────────────┼─────────────┼─────────────────┘
           │             │             │
           ▼             ▼             ▼
┌─────────────────────────────────────────────────────────┐
│                   第三方服务                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  微信开放    │  │  腾讯云     │  │  DeepSeek   │     │
│  │  平台       │  │  OCR        │  │  LLM        │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────┘
```

### 技术选型说明

| 层级 | 技术 | 版本 | 理由 |
|------|------|------|------|
| 前端 | 微信小程序 | 基础库 3.5.3 | 用户基数大、无需安装 |
| 后端 | Supabase | - | 开源BaaS、PostgreSQL、实时订阅 |
| 数据库 | PostgreSQL | 15+ | 强类型、JSONB支持、RLS |
| 认证 | Supabase Auth | - | JWT、支持自定义OAuth |
| 存储 | Supabase Storage | - | S3兼容、CDN |
| 函数 | Edge Functions | Deno | 边缘部署、低延迟 |
| OCR | 腾讯云OCR | - | 国内快、中文准 |
| LLM | DeepSeek | - | 性价比高、中文优化 |

---

## 3.2 前端架构

### 目录结构

```
miniprogram/
├── app.js                 # 小程序入口
├── app.json               # 全局配置
├── app.wxss               # 全局样式
├── sitemap.json           # 搜索配置
│
├── pages/                 # 页面
│   ├── hub/               # 首页-日程总览
│   │   ├── index.js
│   │   ├── index.json
│   │   ├── index.wxml
│   │   └── index.wxss
│   ├── tasks/             # 待办管理
│   ├── knowledge/         # 资料库
│   ├── focus/             # 专注模式
│   ├── ai-import/         # AI导入
│   ├── login/             # 登录页（待创建）
│   ├── course-edit/       # 课程编辑（待创建）
│   └── task-edit/         # 任务编辑（待创建）
│
├── components/            # 自定义组件
│   ├── custom-navbar/     # 自定义导航栏
│   ├── schedule-card/     # 课程卡片
│   ├── floating-action-button/  # 悬浮按钮
│   └── task-card/         # 任务卡片（待创建）
│
├── custom-tab-bar/        # 自定义底部导航
│   ├── index.js
│   ├── index.json
│   ├── index.wxml
│   └── index.wxss
│
├── utils/                 # 工具函数
│   ├── supabase.js        # Supabase API封装
│   ├── colors.js          # 颜色常量
│   ├── auth.js            # 认证相关（待创建）
│   ├── date.js            # 日期处理（待创建）
│   └── storage.js         # 本地存储（待创建）
│
├── styles/                # 公共样式
│   └── typography.wxss    # 字体样式
│
└── static/                # 静态资源
    └── tab/               # TabBar图标
```

### 页面生命周期

```javascript
Page({
  data: {
    // 响应式数据
  },

  // 生命周期
  onLoad(options) {
    // 页面加载，获取参数
  },
  onShow() {
    // 页面显示，刷新数据
    this.loadData();
    // 设置TabBar选中状态
    if (this.getTabBar()) {
      this.getTabBar().setSelected(index);
    }
  },
  onReady() {
    // 页面渲染完成
  },
  onHide() {
    // 页面隐藏，清理定时器
  },
  onUnload() {
    // 页面销毁
  },

  // 自定义方法
  async loadData() {
    this.setData({ loading: true });
    try {
      const data = await fetchData();
      this.setData({ data, loading: false });
    } catch (err) {
      this.handleError(err);
    }
  }
});
```

### 组件通信

```javascript
// 父组件 -> 子组件: Properties
Component({
  properties: {
    title: { type: String, value: '' }
  }
});

// 子组件 -> 父组件: Events
this.triggerEvent('change', { value: newValue });

// 全局状态: globalData
const app = getApp();
app.globalData.userId = 'xxx';
```

### 数据流

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Page      │────>│   Utils     │────>│  Supabase   │
│   Data      │<────│   Request   │<────│   REST API  │
└─────────────┘     └─────────────┘     └─────────────┘
      │
      ▼
┌─────────────┐
│   WXML      │
│   Render    │
└─────────────┘
```

---

## 3.3 后端架构

### Supabase 项目结构

```
supabase/
├── config.toml            # 本地开发配置
├── seed.sql               # 种子数据
│
├── migrations/            # 数据库迁移
│   ├── 20250101000000_init.sql
│   ├── 20250102000000_add_focus_sessions.sql
│   └── ...
│
└── functions/             # Edge Functions
    ├── wechat-login/
    │   └── index.ts
    ├── parse-schedule/
    │   └── index.ts
    └── summarize-file/
        └── index.ts
```

### 认证流程

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ 小程序    │     │  Edge    │     │  微信    │     │ Supabase │
│          │     │ Function │     │  服务器   │     │  Auth    │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │  wx.login()    │                │                │
     │ ─────────────> │                │                │
     │    code        │                │                │
     │                │  code2session  │                │
     │                │ ─────────────> │                │
     │                │    openid      │                │
     │                │ <───────────── │                │
     │                │                │                │
     │                │        signUp/signIn            │
     │                │ ──────────────────────────────> │
     │                │           JWT Token             │
     │                │ <────────────────────────────── │
     │                │                │                │
     │   JWT Token    │                │                │
     │ <───────────── │                │                │
     │                │                │                │
```

### API请求封装

```javascript
// utils/supabase.js

export const SUPABASE_URL = 'https://xxx.supabase.co';
export const SUPABASE_ANON_KEY = 'xxx';

const DEFAULT_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  'Content-Type': 'application/json'
};

function getAuthHeaders() {
  const token = wx.getStorageSync('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function request(path, options = {}) {
  const { method = 'GET', data = null, query = '' } = options;
  const url = `${SUPABASE_URL}/rest/v1/${path}${query ? `?${query}` : ''}`;

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data,
      header: {
        ...DEFAULT_HEADERS,
        ...getAuthHeaders()
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      },
      fail: reject
    });
  });
}
```

### Row Level Security (RLS)

```sql
-- 确保用户只能访问自己的数据
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own courses"
  ON courses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own courses"
  ON courses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own courses"
  ON courses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own courses"
  ON courses FOR DELETE
  USING (auth.uid() = user_id);
```

---

## 3.4 Edge Functions

### 函数结构

```typescript
// supabase/functions/function-name/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 获取请求数据
    const { param1, param2 } = await req.json()

    // 初始化 Supabase 客户端
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // 业务逻辑
    const result = await processData(param1, param2)

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

### 部署命令

```bash
# 部署单个函数
supabase functions deploy function-name

# 部署所有函数
supabase functions deploy

# 本地测试
supabase functions serve function-name
```

---

## 3.5 状态管理

### 本地存储策略

```javascript
// utils/storage.js

const CACHE_PREFIX = 'syllaby_';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24小时

export function setCache(key, data) {
  wx.setStorageSync(`${CACHE_PREFIX}${key}`, {
    data,
    timestamp: Date.now()
  });
}

export function getCache(key) {
  const cached = wx.getStorageSync(`${CACHE_PREFIX}${key}`);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > CACHE_EXPIRY) {
    wx.removeStorageSync(`${CACHE_PREFIX}${key}`);
    return null;
  }

  return cached.data;
}

export function clearCache() {
  const keys = wx.getStorageInfoSync().keys;
  keys.filter(k => k.startsWith(CACHE_PREFIX))
      .forEach(k => wx.removeStorageSync(k));
}
```

### 离线队列

```javascript
// utils/offline.js

const QUEUE_KEY = 'syllaby_pending_queue';

export function addToQueue(action) {
  const queue = wx.getStorageSync(QUEUE_KEY) || [];
  queue.push({
    ...action,
    id: Date.now(),
    createdAt: new Date().toISOString()
  });
  wx.setStorageSync(QUEUE_KEY, queue);
}

export async function syncQueue() {
  const queue = wx.getStorageSync(QUEUE_KEY) || [];
  if (queue.length === 0) return;

  const results = await Promise.allSettled(
    queue.map(action => executeAction(action))
  );

  // 保留失败的操作
  const failed = queue.filter((_, i) => results[i].status === 'rejected');
  wx.setStorageSync(QUEUE_KEY, failed);
}

// 监听网络恢复
wx.onNetworkStatusChange(({ isConnected }) => {
  if (isConnected) {
    syncQueue();
  }
});
```

---

## 3.6 错误处理

### 统一错误处理

```javascript
// utils/error.js

export class AppError extends Error {
  constructor(message, code, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function handleError(error) {
  console.error('Error:', error);

  if (error.code === 'NETWORK_ERROR') {
    wx.showToast({ title: '网络错误，请重试', icon: 'none' });
    return;
  }

  if (error.code === 'AUTH_ERROR') {
    wx.showToast({ title: '登录已过期', icon: 'none' });
    wx.navigateTo({ url: '/pages/login/index' });
    return;
  }

  wx.showToast({ title: error.message || '操作失败', icon: 'none' });
}
```

### 降级策略

```javascript
async function fetchWithFallback(fetchFn, mockData) {
  try {
    return await fetchFn();
  } catch (error) {
    console.warn('Fetch failed, using mock data:', error);
    return mockData;
  }
}
```

---

## 3.7 性能优化

### 图片优化

```javascript
// 使用 CDN 压缩
function getOptimizedImageUrl(url, width = 300) {
  // Supabase Storage 支持图片转换
  return `${url}?width=${width}&quality=80`;
}
```

### 请求优化

```javascript
// 请求去重
const pendingRequests = new Map();

async function deduplicatedRequest(key, fetchFn) {
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }

  const promise = fetchFn();
  pendingRequests.set(key, promise);

  try {
    return await promise;
  } finally {
    pendingRequests.delete(key);
  }
}
```

### 数据预加载

```javascript
// app.js
App({
  onLaunch() {
    // 预加载常用数据
    this.preloadData();
  },

  async preloadData() {
    const userId = wx.getStorageSync('user_id');
    if (!userId) return;

    // 并行预加载
    const [schedule, tasks] = await Promise.all([
      fetchWeekSchedule(userId),
      fetchTasks(userId)
    ]);

    this.globalData.schedule = schedule;
    this.globalData.tasks = tasks;
  }
});
```

---

## 3.8 安全措施

### API Key 保护

1. **使用 RLS**: 数据库层面限制访问
2. **验证 JWT**: Edge Function 验证用户身份
3. **不存敏感数据**: Anon Key 本身权限有限

### 输入验证

```javascript
// 服务端验证示例
function validateCourse(data) {
  const schema = {
    name: { type: 'string', maxLength: 50, required: true },
    day_of_week: { type: 'number', min: 1, max: 7, required: true },
    start_section: { type: 'number', min: 1, max: 12, required: true },
    length: { type: 'number', min: 1, max: 4, required: true }
  };

  // 验证逻辑
  for (const [field, rules] of Object.entries(schema)) {
    if (rules.required && !data[field]) {
      throw new Error(`${field} is required`);
    }
    // ... 更多验证
  }
}
```

### XSS 防护

```javascript
// 转义用户输入
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

---

*下一章: [04 - 数据库设计](./04-database-design.md)*
