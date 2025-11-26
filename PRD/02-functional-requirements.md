# 02 - 功能需求

## 2.1 用户认证系统

### 功能概述
提供微信一键登录能力，管理用户身份和个人设置。

### 用户故事
- 作为新用户，我希望用微信一键登录，无需注册账号
- 作为用户，我希望设置学校信息，获得定制化服务
- 作为用户，我希望我的数据在不同设备间同步

### 功能详情

#### 2.1.1 微信登录

**触发条件**: 首次打开小程序或登录态过期

**流程**:
1. 小程序调用 `wx.login()` 获取 code
2. 发送 code 到后端 Edge Function
3. 后端换取 openid 和 session_key
4. 创建或更新用户记录
5. 返回 JWT token
6. 小程序存储 token，后续请求携带

**界面元素**:
- 欢迎页面（品牌Logo + Slogan）
- 微信登录按钮
- 用户协议和隐私政策链接

**技术实现**:
```javascript
// pages/login/index.js
async function handleLogin() {
  wx.showLoading({ title: '登录中...' });

  const { code } = await wx.login();
  const { data } = await wx.request({
    url: `${SUPABASE_URL}/functions/v1/wechat-login`,
    method: 'POST',
    data: { code }
  });

  wx.setStorageSync('access_token', data.access_token);
  wx.setStorageSync('user_id', data.user.id);

  wx.hideLoading();
  wx.switchTab({ url: '/pages/hub/index' });
}
```

#### 2.1.2 用户信息设置

**触发条件**: 首次登录后引导 / 设置页面

**可设置项**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 昵称 | string | 否 | 默认"同学" |
| 学校 | string | 否 | 用于未来校园功能 |
| 年级 | string | 否 | 大一/大二/大三/大四/研究生 |
| 节次时间 | array | 否 | 自定义上课时间表 |

**界面元素**:
- 头像显示（微信头像）
- 表单输入项
- 保存按钮

#### 2.1.3 登录态管理

**Token刷新机制**:
- JWT有效期: 7天
- 每次打开小程序检查有效期
- 过期前1天自动刷新
- 过期后重新登录

**退出登录**:
- 清除本地存储
- 跳转到登录页

---

## 2.2 智能日程总览 (Hub)

### 功能概述
首页，展示课程表、今日提要、月度热力图，支持周/日/月视图切换。

### 用户故事
- 作为学生，我希望一眼看到今天有哪些课
- 作为学生，我希望看到即将到来的考试和deadline
- 作为学生，我希望快速切换查看不同时间范围的安排

### 功能详情

#### 2.2.1 周视图（默认）

**布局**:
- 顶部：自定义导航栏（日期、周几、AI Ready标签）
- 视图切换：周/日/月 三个按钮
- 课程列表：垂直排列的课程卡片
- 实时时间线：显示当前时间位置

**课程卡片信息**:
- 课程名称
- 上课时间（如 08:00 - 09:40）
- 教室位置
- 背景色（课程颜色）

**交互**:
- 点击课程卡片 → 跳转专注模式
- 长按课程卡片 → 高亮显示（pin功能）
- 左右滑动 → 切换周次

**技术实现**:
```javascript
// 获取本周课程
async function loadWeekSchedule() {
  const userId = getApp().globalData.userId;
  const schedules = await fetchWeekSchedule(userId);

  // 转换为显示格式
  const courses = schedules.map(s => ({
    id: s.id,
    name: s.course.name,
    time: sectionsToTime(s.start_section, s.length),
    location: s.course.location,
    color: s.course.color,
    dayOfWeek: s.day_of_week
  }));

  // 筛选今天的课程
  const today = new Date().getDay() || 7;
  const todayCourses = courses.filter(c => c.dayOfWeek === today);

  this.setData({ courses: todayCourses });
}
```

#### 2.2.2 日视图

**布局**:
- 24小时时间轴（06:00 - 23:00）
- 课程块按时间定位
- 待办事项穿插显示
- 当前时间指示线

**特点**:
- 更精确的时间感知
- 课程与待办统一视图
- 空闲时段一目了然

**技术实现**:
```javascript
// 计算课程在时间轴上的位置
function calculatePosition(startTime, endTime) {
  const dayStart = 6 * 60; // 06:00
  const dayEnd = 23 * 60;  // 23:00
  const totalMinutes = dayEnd - dayStart;

  const start = timeToMinutes(startTime) - dayStart;
  const end = timeToMinutes(endTime) - dayStart;

  return {
    top: `${(start / totalMinutes) * 100}%`,
    height: `${((end - start) / totalMinutes) * 100}%`
  };
}
```

#### 2.2.3 月视图

**布局**:
- 日历网格（6周 × 7天）
- 每天显示小圆点标记（考试/作业）
- 底部热力图统计

**热力图**:
- 展示每周的任务密度
- 柱状高度表示任务数量
- 颜色渐变表示紧急程度

**交互**:
- 点击某天 → 切换到日视图
- 滑动 → 切换月份

#### 2.2.4 今日提要

**显示内容**:
- 今日考试（红色标记）
- 今日deadline（橙色标记）
- 明日重要事项预告

**数据来源**: tasks表，筛选 deadline 在今天的记录

#### 2.2.5 空教室众包（P2功能）

**功能**:
- 显示用户标记的空闲教室
- 标签显示特点（静音区、有插座）
- 显示空闲剩余时长

**交互**:
- 点击"标记空教室"按钮
- 选择教学楼和教室号
- 选择预计空闲时长
- 提交标记

---

## 2.3 待办与考试管理 (Tasks)

### 功能概述
管理作业deadline和考试安排，支持进度追踪和完成标记。

### 用户故事
- 作为学生，我希望集中管理所有作业和考试
- 作为学生，我希望看到每个任务的剩余时间
- 作为学生，我希望标记任务完成状态

### 功能详情

#### 2.3.1 任务列表

**Tab分类**:
- Homework（作业）
- Exam（考试）

**任务卡片信息**:
- 任务标题
- 关联课程（标签形式）
- 截止时间
- 进度百分比（圆环图）
- 完成按钮

**排序规则**: 按deadline升序，最紧急的在最前

**技术实现**:
```javascript
// 格式化剩余时间
function formatDeadline(deadline) {
  const now = new Date();
  const target = new Date(deadline);
  const diff = target - now;

  if (diff < 0) return '已过期';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}天${hours}小时`;
  if (hours > 0) return `${hours}小时`;
  return '即将到期';
}
```

#### 2.3.2 添加任务

**触发**: 点击悬浮"+"按钮

**表单字段**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 类型 | select | 是 | homework / exam |
| 标题 | string | 是 | 最多50字 |
| 截止时间 | datetime | 是 | 日期选择器 |
| 关联课程 | select | 否 | 从已有课程选择 |
| 备注 | string | 否 | 最多200字 |

**交互流程**:
1. 点击"+"按钮
2. 弹出底部表单
3. 填写信息
4. 点击保存
5. 写入数据库
6. 刷新列表

#### 2.3.3 编辑任务

**触发**: 左滑任务卡片 或 点击卡片

**可编辑项**: 同添加任务

**删除**: 左滑显示删除按钮，确认后删除

#### 2.3.4 标记完成

**触发**: 点击任务卡片上的完成按钮

**效果**:
- 本地立即更新UI
- 异步同步到数据库
- 完成动画（打勾 + 触觉反馈）
- Toast提示"已完成"

**技术实现**:
```javascript
async function toggleComplete(taskId, currentStatus) {
  // 乐观更新
  const tasks = this.data.tasks.map(t =>
    t.id === taskId ? { ...t, is_completed: !currentStatus } : t
  );
  this.setData({ tasks });

  // 异步同步
  try {
    await updateTaskCompletion(taskId, !currentStatus);
    wx.showToast({ title: '已完成', icon: 'success' });
  } catch (err) {
    // 回滚
    this.setData({ tasks: this.data.tasks });
    wx.showToast({ title: '操作失败', icon: 'error' });
  }
}
```

#### 2.3.5 任务提醒

**提醒时机**:
- deadline前1天
- deadline前2小时
- 考试前1天早上

**实现方式**: 微信订阅消息

**用户授权**: 首次添加任务时请求授权

---

## 2.4 校园资料库 (Knowledge)

### 功能概述
管理学习资料，支持按科目分类、文件预览、AI划重点。

### 用户故事
- 作为学生，我希望集中存放所有课件和资料
- 作为学生，我希望按科目分类查找资料
- 作为学生，我希望AI帮我提取资料重点

### 功能详情

#### 2.4.1 文件夹视图

**布局**: 2列网格

**文件夹卡片信息**:
- 科目名称
- 文件数量
- 主题色（莫兰迪色）
- 拟物化夹子装饰

**交互**:
- 点击文件夹 → 筛选该科目文件
- 长按文件夹 → 重命名/删除

#### 2.4.2 文件列表

**文件卡片信息**:
- 文件名
- 文件类型图标（PDF/PPT/Word/图片）
- 所属科目
- 上传时间

**排序**: 按上传时间倒序

**交互**:
- 点击文件 → 预览
- 长按文件 → 操作菜单（AI摘要/下载/删除）

#### 2.4.3 文件上传

**触发**: 点击"+"按钮

**支持格式**:
- PDF (.pdf)
- PPT (.pptx, .ppt)
- Word (.docx, .doc)
- 图片 (.jpg, .png)

**上传流程**:
1. 选择文件（`wx.chooseMessageFile`）
2. 选择科目分类
3. 上传到Supabase Storage
4. 写入resources表
5. 刷新列表

**技术实现**:
```javascript
async function uploadFile() {
  // 1. 选择文件
  const { tempFiles } = await wx.chooseMessageFile({
    count: 1,
    type: 'file',
    extension: ['pdf', 'pptx', 'ppt', 'docx', 'doc', 'jpg', 'png']
  });

  const file = tempFiles[0];

  // 2. 上传到Storage
  const fileName = `${Date.now()}_${file.name}`;
  const { data: uploadData } = await supabase.storage
    .from('resources')
    .upload(`${userId}/${fileName}`, file);

  // 3. 获取公开URL
  const { data: urlData } = supabase.storage
    .from('resources')
    .getPublicUrl(`${userId}/${fileName}`);

  // 4. 写入数据库
  await supabase.from('resources').insert({
    user_id: userId,
    file_name: file.name,
    file_url: urlData.publicUrl,
    file_type: getFileType(file.name),
    subject: selectedSubject
  });
}
```

#### 2.4.4 文件预览

**实现方式**: `wx.openDocument`

**支持预览**:
- PDF ✅
- PPT ✅
- Word ✅
- 图片 ✅

**流程**:
1. 点击文件
2. 下载到临时目录
3. 调用文档预览
4. 显示微信内置阅读器

**技术实现**:
```javascript
async function previewFile(fileUrl, fileName) {
  wx.showLoading({ title: '加载中...' });

  const { tempFilePath } = await wx.downloadFile({ url: fileUrl });

  wx.hideLoading();

  wx.openDocument({
    filePath: tempFilePath,
    fileType: getFileType(fileName),
    showMenu: true
  });
}
```

#### 2.4.5 AI划重点

**触发**: 长按文件 → 选择"AI划重点"

**功能**: 调用LLM生成文件内容摘要

**流程**:
1. 下载文件
2. 提取文本内容
3. 调用Edge Function
4. LLM生成摘要
5. 保存到resources.ai_summary
6. 弹窗展示摘要

**摘要格式**:
```markdown
## 核心概念
- 概念1: 解释
- 概念2: 解释

## 重要公式/定理
- 公式1
- 公式2

## 考点预测
- 考点1
- 考点2
```

**技术实现详见**: [06-ai-features.md](./06-ai-features.md)

---

## 2.5 专注模式 (Focus)

### 功能概述
番茄钟专注计时，动态背景，专注统计和分享卡片。

### 用户故事
- 作为学生，我希望有一个计时器帮我保持专注
- 作为学生，我希望看到我的专注数据统计
- 作为学生，我希望分享我的专注成就

### 功能详情

#### 2.5.1 倒计时器

**默认时长**: 45分钟

**显示**:
- 大字号倒计时（等宽字体）
- 格式: MM:SS
- 居中显示

**控制按钮**:
- 开始专注
- 结束专注（专注中显示）

**时长调整**: Slider组件，15-90分钟，步进5分钟

#### 2.5.2 动态背景

**渐变方案**:
```javascript
gradients = [
  ['#92B4EC', '#F7F7F5'],  // 蓝白
  ['#F4C095', '#1C1C1E'],  // 橙黑
  ['#1148C4', '#FF5C00']   // 蓝橙
]
```

**切换机制**: 每15秒自动切换渐变

**效果**: 缓慢过渡，营造氛围

#### 2.5.3 专注流程

**开始专注**:
1. 点击"开始专注"
2. 触觉反馈（轻）
3. 隐藏时长调整器
4. 开始倒计时
5. 每秒更新显示

**结束专注**:
- 正常结束: 倒计时归零
- 手动结束: 点击"结束专注"

**结束后**:
1. 触觉反馈（中）
2. 显示专注统计卡片
3. 记录到数据库

#### 2.5.4 专注统计

**统计卡片内容**:
- 本次专注时长
- 连续专注天数
- 圆环进度图

**数据来源**: focus_sessions表

**技术实现**:
```javascript
async function recordFocusSession(duration) {
  const userId = getApp().globalData.userId;

  await supabase.from('focus_sessions').insert({
    user_id: userId,
    duration: duration,
    started_at: new Date(Date.now() - duration * 60000).toISOString(),
    ended_at: new Date().toISOString()
  });
}

async function getStreakDays() {
  // 查询连续专注天数
  const { data } = await supabase
    .from('focus_sessions')
    .select('started_at')
    .eq('user_id', userId)
    .order('started_at', { ascending: false });

  let streak = 0;
  let currentDate = new Date();

  for (const session of data) {
    const sessionDate = new Date(session.started_at).toDateString();
    if (sessionDate === currentDate.toDateString()) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}
```

#### 2.5.5 保存分享

**功能**: 将专注卡片保存为图片

**实现**: Canvas绘制 + `wx.canvasToTempFilePath`

**分享**: 保存到相册后可分享到朋友圈

---

## 2.6 AI图片导入 (AI Import)

### 功能概述
拍照上传课程表或通知，AI自动识别并结构化。

### 用户故事
- 作为新生，我希望拍照导入课程表，不用手动输入
- 作为学生，我希望截图识别作业通知，自动创建待办

### 功能详情

#### 2.6.1 图片选择

**来源**:
- 拍照（`wx.chooseMedia` camera）
- 相册选择（`wx.chooseMedia` album）

**支持格式**: JPG, PNG

**图片要求**:
- 清晰可辨
- 文字水平
- 光线充足

#### 2.6.2 识别流程

**步骤**:
1. 选择/拍照图片
2. 显示图片预览
3. 点击"开始识别"
4. 上传图片到Storage
5. 调用Edge Function
6. OCR提取文字
7. LLM解析结构
8. 返回识别结果
9. 展示确认界面

**加载动画**:
- 激光扫描线
- 进度条
- 提示文字"AI正在识别..."

#### 2.6.3 识别结果

**展示形式**: 卡片列表

**课程表识别结果**:
```json
{
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
    }
  ]
}
```

**作业通知识别结果**:
```json
{
  "type": "task",
  "data": [
    {
      "type": "homework",
      "title": "提交实验报告",
      "deadline": "2025-11-28T23:59:00",
      "course": "操作系统"
    }
  ]
}
```

#### 2.6.4 确认导入

**交互**:
- 每个卡片有独立确认按钮
- 一键全部导入按钮
- 可编辑修正识别错误

**导入后**:
- 写入对应数据表
- 提示导入成功
- 返回首页

#### 2.6.5 错误处理

**识别失败**:
- 提示"识别失败，请重试"
- 提供手动输入入口

**部分识别**:
- 显示已识别内容
- 标注未识别部分
- 支持手动补充

---

## 2.7 通用组件

### 2.7.1 自定义导航栏 (custom-navbar)

**属性**:
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| title | String | 'Syllaby' | 主标题 |
| subtitle | String | 'Academic Zen' | 副标题 |

**显示**:
- 状态栏占位
- 日期（月·日）
- 周几
- 标题
- AI Ready徽章

### 2.7.2 悬浮操作按钮 (floating-action-button)

**展开菜单**:
- 开始专注（蓝色）
- AI导入（橙色）

**样式**: 圆形按钮，展开时显示子菜单

### 2.7.3 课程卡片 (schedule-card)

**属性**:
| 属性 | 类型 | 说明 |
|------|------|------|
| course | Object | 课程对象 |
| focused | Boolean | 是否高亮 |

**事件**:
- `open`: 点击事件
- `pin`: 长按事件

### 2.7.4 自定义TabBar (custom-tab-bar)

**Tab项**:
- 总览 (hub)
- 待办 (tasks)
- 资料 (knowledge)

**样式**: 玻璃态背景，选中项显示橙色圆点

---

## 2.8 设置页面（P2）

### 功能
- 个人信息编辑
- 节次时间自定义
- 主题切换（暗黑模式）
- 数据导出
- 关于我们
- 退出登录

---

*下一章: [03 - 技术架构](./03-technical-architecture.md)*
