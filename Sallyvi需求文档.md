这份需求文档将完全贴合您的**“高颜值、Supabase后端、AI驱动、解决痛点”**的要求。我们首先定一个符合“智能、学术、极简”气质的英文名。

英文名称建议： Syllaby
（结合了 Syllabus [大纲/课程表] + Lullaby [轻松/安抚] 或 Ability，寓意让繁重的学业变得轻松掌控）

🎓 Syllaby 微信小程序产品需求文档 (PRD)
属性	内容
项目名称	Syllaby (中文名可选：智课流 / 阅课)
产品定位	拒绝花哨广告、基于 AI 视觉识别的“极简主义”学业助理
核心价值	极致的审美体验 + AI 自动化录入（把“懒”做到极致）
技术核心	前端：微信小程序 (Skyline 渲染引擎推荐) <br> 后端：Supabase (Postgres, Storage, Edge Functions) <br> AI：LLM API (用于语义分析)
1. 设计美学：什么是“学术高级感”？ (Visual DNA)

为了区别于市面上色彩饱和度过高、广告满天飞的课程表，我们采用 “Academic Zen (学术禅意)” 风格。

色彩体系：

背景： 并非死白，而是像高级纸张一样的暖灰白 (#F7F7F5)，暗黑模式下为深空灰 (#1C1C1E)。

功能色： 使用莫兰迪色系（Morandi Colors）区分课程。例如：雾霾蓝、脏粉、橄榄绿。拒绝纯红纯绿。

强调色： 荧光橙或克莱因蓝（仅用于 AI 按钮和 FAB 悬浮按钮）。

材质与光影：

卡片： 微投影 + 只有 1px 的极淡边框，营造“悬浮纸片”感。

玻璃态： 底部 Tabbar 和弹窗背景使用高斯模糊（backdrop-filter），透出底层的课程色块。

排版：

数字： 时间、倒计时使用等宽的工业风字体（如 DIN 或 JetBrains Mono）。

留白： 课程表格子之间要有呼吸感，不要填得满满当当。

2. 核心业务功能详解 (The 85% Foundation)
2.1 首页：智能日程 (The Hub)

多视图切换：

周视图 (默认)： 经典的课程格子。

交互高级感： 左右滑动切换周次时，格子不是生硬位移，而是带有弹性阻尼的效果。

当前时刻： 一条随着时间移动的“现在线”，经过课程块时，该课程块高亮，其余变暗（Focus Mode）。

日视图： 时间轴形式，穿插展示课程 + 待办 Deadline。

月视图： 缩小版日历，用不同颜色的圆点标记“考试日”和“作业截止日”，一目了然看到哪周最忙（考试周预警）。

空教室查询 (众包版)：

在首页顶部提供“自习去哪”入口。

逻辑： 既然拿不到教务系统数据，我们做**“用户标记”**。用户如果在某个教室自习发现没人，点击“标记为空闲”，该状态维持 2 小时。地图上显示绿色的热力点。

2.2 待办与提醒 (Tasks & Widgets)

融合列表： 作业（Homework）和 考试（Exam）与课程表数据打通。

倒计时设计：

不要简单的文字列表。每个待办是一个横向卡片，右侧有一个动态饼图或进度条显示剩余时间（例如：7天剩3天，进度条走一半，颜色从绿渐变到黄）。

桌面小组件 (Widget)：

提供 2x2 和 4x2 两种尺寸。风格极简，仅展示“下一节课”和“最近的一个 Deadline”。

2.3 专注模式 (Focus Flow)

入口： 首页右下角悬浮按钮 -> 这是一个多功能按钮（Action Button），展开后选择“开始专注”。

UI 设计：

全屏沉浸。背景色随计时时长缓慢变化（如从清晨的蓝变为黄昏的橙）。

中间是一个巨大的、极细字体的倒计时。

统计图表： 结束后生成一张极具设计感的“专注卡片”（类似 Apple Fitness 圆环），鼓励用户分享到朋友圈。

2.4 校园资料库 (Knowledge Base)

架构： 基于 Supabase Storage。

功能： 这里的 UI 要像“文件管理器”一样清爽。

支持用户建立文件夹（按科目）。

文件预览：点击 PDF，直接在小程序内打开，支持双指缩放。

高级感： 文件夹图标不要用默认的，使用 3D 渲染的极简文件夹图标。

3. AI 核心功能详解 (The 15% Magic)

这是产品的杀手锏，前端交互必须做得非常有“未来感”。

3.1 场景一：截图一键导入 (Screenshot to Schedule)

痛点解决： 班群发的《第12周考试安排.png》或《调课通知.jpg》。

交互流程：

用户点击“+”号 -> 选择“图片识别导入”。

动画： 图片上传时，界面上出现一条激光扫描线从上扫到下（模拟 OCR 过程）。

后台逻辑 (Supabase Edge Function)：

调用 OCR 接口提取文字。

将文字 + 当前日期 发送给 LLM (如 DeepSeek/OpenAI)。

Prompt: "分析这段文字，提取出课程名称、时间、地点、是考试还是作业。返回 JSON 格式。"

确认 UI： 扫描完成后，弹出一个半浮层，列出 AI 识别到的日程：

[考试] Java程序设计 | 周三 14:00 | 302教室

[作业] 提交实验报告 | 下周五 23:59

用户点击“一键添加”，卡片像飞入动画一样落入日历格子中。

3.2 场景二：复习重点提取 (Smart Summary)

痛点解决： 考前没时间看 50 页 PPT。

交互流程：

在“资料库”中长按某个 PDF/PPT 文件 -> 选择“AI 划重点”。

Loading 状态： 显示“AI 正在阅读课件...”，伴随神经元连接的动态图标。

结果展示：

生成一份**“极简备忘录”**。

包含：核心概念 (Key Concepts)、必考公式、预测简答题 (3道)。

用户可以将这份备忘录直接保存为“复习笔记”。

4. Supabase 数据库设计 (Schema)

为前端的高级交互提供坚实的数据支撑。

4.1 Tables 结构

profiles (用户表)

id: uuid (FK auth.users)

school_name: text

theme_preference: jsonb (存储用户喜欢的主题色配置)

courses (课程元数据表)

id: uuid

user_id: uuid

name: text (如 "高等数学")

color: text (Hex Code)

location: text

teacher: text

course_schedules (具体排课表)

id: uuid

course_id: uuid (FK courses)

day_of_week: int (1-7)

start_section: int (第几节开始)

length: int (持续节数)

weeks: array (上课周数，如 [1,2,3,5,6])

tasks (作业与考试)

id: uuid

user_id: uuid

type: text ('homework' | 'exam')

title: text

deadline: timestamptz

is_completed: boolean

related_course_id: uuid (可选，关联课程)

resources (资料库)

id: uuid

user_id: uuid

file_name: text

file_url: text (Supabase Storage URL)

file_type: text (pdf, ppt, etc.)

ai_summary: text (存储 AI 生成的重点总结，避免重复消耗 Token)

5. 前端开发特别要求 (Frontend Requirements)

为了实现“设计非常高级”，请开发遵循以下准则：

自定义导航栏 (Custom Navbar)：

隐藏微信原生导航栏。页面内容直接延伸到状态栏。

左上角展示日期：“9月24日 · 第4周”。

触觉反馈 (Haptics)：

在用户长按课程、点击完成作业、AI 识别成功时，必须调用 wx.vibrateShort({ type: 'light' })，提供物理质感。

动效曲线 (Animation Curves)：

所有弹窗不要直接 display: block。要用 spring (弹簧) 动画。

打开课程详情时，利用 Shared Element (共享元素) 动画，让课程色块直接放大展开成详情页背景。

骨架屏与预加载：

Supabase 请求数据时，展示与格子布局一致的灰色脉冲骨架屏。

6. AI 接入逻辑简述 (Technical)

API 选择： 推荐使用支持长文本和图像理解的模型。对于国内小程序，可以使用 Minimax 或 智谱 GLM-4V (具备视觉能力)。

Edge Function (Supabase) 伪代码：

code
TypeScript
download
content_copy
expand_less
// parse-schedule.ts
import { serve } from "https://deno.land/std/http/server.ts"

serve(async (req) => {
  // 1. 接收小程序传来的 Base64 图片
  const { imageBase64 } = await req.json()

  // 2. 调用 LLM 视觉模型
  const aiResponse = await fetch('https://api.llm-provider.com/v1/chat/completions', {
     messages: [
       {
         role: "user",
         content: [
           { type: "text", text: "提取图中的课程表或考试安排，返回标准JSON数组..." },
           { type: "image_url", image_url: { url: imageBase64 } }
         ]
       }
     ]
  })

  // 3. 清洗 JSON 并返回给小程序确认
  return new Response(JSON.stringify(cleanedData), { ... })
})

总结：
Syllaby 不仅仅是一个记录工具，它是学生的**“外脑”**。通过 AI 减少 90% 的输入成本，通过高级的 UI 增加用户的情感粘性。