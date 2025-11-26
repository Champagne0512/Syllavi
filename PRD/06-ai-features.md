# 06 - AI功能实现

## 6.1 AI功能概览

### 核心AI功能

| 功能 | 输入 | 输出 | 技术 |
|------|------|------|------|
| 课程表识别 | 课表图片 | 结构化课程数据 | OCR + LLM |
| 任务识别 | 通知截图 | 结构化任务数据 | OCR + LLM |
| 文件摘要 | PDF/PPT文件 | 重点摘要 | 文本提取 + LLM |

### 技术选型

| 组件 | 服务商 | 理由 |
|------|--------|------|
| OCR | 腾讯云通用印刷体识别 | 国内访问快、中文识别准确率高 |
| LLM | DeepSeek Chat | 性价比高、中文理解能力强 |
| 备选LLM | Minimax / 通义千问 | 备用方案 |

### 数据流

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  小程序  │────>│ Storage │────>│  Edge   │────>│  OCR    │
│ 上传图片 │     │ 存储    │     │Function │     │  API    │
└─────────┘     └─────────┘     └────┬────┘     └────┬────┘
                                     │               │
                                     │    文字       │
                                     │<──────────────┘
                                     │
                                     ▼
                               ┌─────────┐     ┌─────────┐
                               │   LLM   │────>│  返回   │
                               │   API   │     │ JSON    │
                               └─────────┘     └─────────┘
```

---

## 6.2 课程表OCR识别

### 6.2.1 技术方案

**流程**:
1. 用户拍照/选择课表图片
2. 上传图片到 Supabase Storage（temp bucket）
3. 调用 Edge Function `parse-schedule`
4. Edge Function 调用腾讯云 OCR
5. OCR 返回识别文字
6. 调用 LLM 解析结构化数据
7. 返回课程数组

### 6.2.2 OCR API调用

**腾讯云通用印刷体识别**:

```typescript
// supabase/functions/parse-schedule/ocr.ts

interface OCRResult {
  TextDetections: Array<{
    DetectedText: string;
    Confidence: number;
    Polygon: Array<{ X: number; Y: number }>;
  }>;
}

async function callTencentOCR(imageBase64: string): Promise<string> {
  const secretId = Deno.env.get('TENCENT_SECRET_ID');
  const secretKey = Deno.env.get('TENCENT_SECRET_KEY');

  // 生成签名（腾讯云API签名算法）
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = generateSignature(secretId, secretKey, timestamp);

  const response = await fetch('https://ocr.tencentcloudapi.com', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TC-Action': 'GeneralBasicOCR',
      'X-TC-Version': '2018-11-19',
      'X-TC-Timestamp': timestamp.toString(),
      'Authorization': signature
    },
    body: JSON.stringify({
      ImageBase64: imageBase64,
      LanguageType: 'zh'
    })
  });

  const result: OCRResult = await response.json();

  // 合并所有识别文字
  const text = result.TextDetections
    .sort((a, b) => {
      // 按Y坐标排序（从上到下）
      const aY = a.Polygon[0].Y;
      const bY = b.Polygon[0].Y;
      if (Math.abs(aY - bY) < 20) {
        // 同一行按X坐标排序
        return a.Polygon[0].X - b.Polygon[0].X;
      }
      return aY - bY;
    })
    .map(item => item.DetectedText)
    .join(' ');

  return text;
}
```

### 6.2.3 LLM解析

**Prompt设计**:

```typescript
// supabase/functions/parse-schedule/llm.ts

const PARSE_SCHEDULE_PROMPT = `你是一个专业的课程表解析助手。请分析以下OCR识别的课程表文字，提取所有课程信息。

输入文字:
{OCR_TEXT}

请提取每门课程的以下信息:
- name: 课程名称
- day_of_week: 星期几（1=周一，7=周日）
- start_section: 起始节次（1-12）
- length: 持续节数（通常是2）
- location: 教室位置
- teacher: 教师姓名（如果有）
- weeks: 上课周数数组（如 [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]）

注意事项:
1. 如果是"1-16周"这样的格式，转换为数组 [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]
2. 如果是"1-8周,10-16周"，转换为 [1,2,3,4,5,6,7,8,10,11,12,13,14,15,16]
3. 如果是"单周"，生成 [1,3,5,7,9,11,13,15]
4. 如果是"双周"，生成 [2,4,6,8,10,12,14,16]
5. 节次通常表示为"1-2节"、"第3,4节"等，需要转换为start_section和length

请直接返回JSON数组，不要有任何其他文字:
[
  {
    "name": "高等数学",
    "day_of_week": 1,
    "start_section": 1,
    "length": 2,
    "location": "A3-302",
    "teacher": "张教授",
    "weeks": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]
  }
]`;

async function parseScheduleWithLLM(ocrText: string): Promise<any[]> {
  const apiKey = Deno.env.get('DEEPSEEK_API_KEY');

  const prompt = PARSE_SCHEDULE_PROMPT.replace('{OCR_TEXT}', ocrText);

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: '你是一个JSON解析器，只返回有效的JSON，不要有任何其他文字。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,  // 低温度保证输出稳定
      max_tokens: 4000
    })
  });

  const result = await response.json();
  const content = result.choices[0].message.content;

  // 提取JSON
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Invalid LLM response');
  }

  return JSON.parse(jsonMatch[0]);
}
```

### 6.2.4 完整Edge Function

```typescript
// supabase/functions/parse-schedule/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { image_url } = await req.json()

    // 1. 下载图片
    const imageResponse = await fetch(image_url)
    const imageBuffer = await imageResponse.arrayBuffer()
    const imageBase64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)))

    // 2. OCR识别
    const ocrText = await callTencentOCR(imageBase64)
    console.log('OCR Result:', ocrText)

    // 3. LLM解析
    const courses = await parseScheduleWithLLM(ocrText)
    console.log('Parsed Courses:', courses)

    // 4. 数据验证
    const validatedCourses = courses.map(course => ({
      name: String(course.name || '未命名课程').slice(0, 50),
      day_of_week: Math.min(Math.max(Number(course.day_of_week) || 1, 1), 7),
      start_section: Math.min(Math.max(Number(course.start_section) || 1, 1), 12),
      length: Math.min(Math.max(Number(course.length) || 2, 1), 4),
      location: String(course.location || '').slice(0, 100),
      teacher: String(course.teacher || '').slice(0, 50),
      weeks: Array.isArray(course.weeks) ? course.weeks : [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]
    }))

    return new Response(
      JSON.stringify({
        success: true,
        type: 'course',
        data: validatedCourses
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

---

## 6.3 任务通知识别

### 6.3.1 技术方案

与课程表识别类似，但Prompt不同。

### 6.3.2 LLM Prompt

```typescript
const PARSE_TASK_PROMPT = `你是一个专业的任务解析助手。请分析以下OCR识别的通知/消息文字，提取所有作业和考试信息。

输入文字:
{OCR_TEXT}

请提取每个任务的以下信息:
- type: 类型（"homework" 或 "exam"）
- title: 任务标题
- deadline: 截止时间（ISO 8601格式，如 "2025-11-28T23:59:00"）
- course: 相关课程名称（如果有）

判断规则:
1. 包含"考试"、"期中"、"期末"、"测验"的是exam
2. 包含"作业"、"报告"、"提交"、"deadline"的是homework
3. 时间格式转换示例:
   - "11月28日23:59" -> "2025-11-28T23:59:00"
   - "下周三14:00" -> 根据当前日期计算
   - "本周五" -> 根据当前日期计算

当前日期: {CURRENT_DATE}

请直接返回JSON数组:
[
  {
    "type": "homework",
    "title": "操作系统实验报告",
    "deadline": "2025-11-28T23:59:00",
    "course": "操作系统"
  }
]`;
```

### 6.3.3 Edge Function

```typescript
// supabase/functions/parse-task/index.ts

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { image_url } = await req.json()

    // 1. OCR识别
    const imageBase64 = await downloadAndEncode(image_url)
    const ocrText = await callTencentOCR(imageBase64)

    // 2. LLM解析
    const currentDate = new Date().toISOString().split('T')[0]
    const tasks = await parseTaskWithLLM(ocrText, currentDate)

    // 3. 数据验证
    const validatedTasks = tasks.map(task => ({
      type: ['homework', 'exam'].includes(task.type) ? task.type : 'homework',
      title: String(task.title || '未命名任务').slice(0, 100),
      deadline: task.deadline || new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      course: String(task.course || '').slice(0, 50)
    }))

    return new Response(
      JSON.stringify({
        success: true,
        type: 'task',
        data: validatedTasks
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

---

## 6.4 文件AI摘要

### 6.4.1 技术方案

**流程**:
1. 下载文件
2. 提取文本内容
   - PDF: 使用 pdf-parse 库
   - PPT: 转换为文本
3. 文本分块（避免超过Token限制）
4. 调用LLM生成摘要
5. 返回摘要并缓存

### 6.4.2 文本提取

```typescript
// supabase/functions/summarize-file/extract.ts

import { PDFDocument } from 'https://esm.sh/pdf-lib'

async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  // 使用 pdf-parse 或类似库
  // 这里简化处理，实际需要更复杂的库

  const pdfDoc = await PDFDocument.load(pdfBuffer)
  const pages = pdfDoc.getPages()

  // 注意: pdf-lib 不直接支持文本提取
  // 实际项目中建议使用:
  // - pdf-parse (Node.js)
  // - pdf.js (浏览器/Deno)
  // - 或调用第三方API

  // 这里返回模拟数据
  return `PDF文档内容...共${pages.length}页`
}

async function extractText(fileUrl: string, fileType: string): Promise<string> {
  const response = await fetch(fileUrl)
  const buffer = await response.arrayBuffer()

  switch (fileType) {
    case 'pdf':
      return extractTextFromPDF(buffer)
    case 'pptx':
    case 'ppt':
      // PPT提取需要专门的库
      return extractTextFromPPT(buffer)
    case 'docx':
    case 'doc':
      return extractTextFromWord(buffer)
    default:
      throw new Error(`Unsupported file type: ${fileType}`)
  }
}
```

### 6.4.3 文本分块

```typescript
function chunkText(text: string, maxChunkSize: number = 8000): string[] {
  const chunks: string[] = []
  const paragraphs = text.split(/\n\n+/)

  let currentChunk = ''

  for (const paragraph of paragraphs) {
    if ((currentChunk + paragraph).length > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim())
      }
      currentChunk = paragraph
    } else {
      currentChunk += '\n\n' + paragraph
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  return chunks
}
```

### 6.4.4 LLM摘要生成

```typescript
const SUMMARIZE_PROMPT = `你是一个专业的学习资料摘要助手。请阅读以下学习资料内容，生成一份重点摘要。

资料内容:
{CONTENT}

请按以下格式输出摘要:

## 核心概念
- 列出3-5个核心概念，每个简要解释

## 重要公式/定理
- 如果有数学公式或重要定理，列出来

## 关键知识点
- 列出5-10个重要知识点

## 考点预测
- 基于内容预测3-5个可能的考点

要求:
1. 语言简洁明了
2. 使用Markdown格式
3. 突出重点，便于复习
4. 总字数控制在500-1000字`;

async function generateSummary(text: string): Promise<string> {
  const apiKey = Deno.env.get('DEEPSEEK_API_KEY')

  // 如果文本太长，先分块总结再合并
  const chunks = chunkText(text)

  if (chunks.length === 1) {
    // 直接总结
    return await summarizeChunk(chunks[0], apiKey)
  }

  // 分块总结
  const chunkSummaries = await Promise.all(
    chunks.map(chunk => summarizeChunk(chunk, apiKey))
  )

  // 合并总结
  const combinedPrompt = `请将以下多个摘要合并为一份完整摘要:\n\n${chunkSummaries.join('\n\n---\n\n')}`

  return await callLLM(combinedPrompt, apiKey)
}

async function summarizeChunk(content: string, apiKey: string): Promise<string> {
  const prompt = SUMMARIZE_PROMPT.replace('{CONTENT}', content)
  return await callLLM(prompt, apiKey)
}

async function callLLM(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000
    })
  })

  const result = await response.json()
  return result.choices[0].message.content
}
```

### 6.4.5 完整Edge Function

```typescript
// supabase/functions/summarize-file/index.ts

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { file_url, file_type } = await req.json()

    // 1. 提取文本
    const text = await extractText(file_url, file_type)

    if (text.length < 100) {
      throw new Error('文件内容太少，无法生成摘要')
    }

    // 2. 生成摘要
    const summary = await generateSummary(text)

    return new Response(
      JSON.stringify({
        success: true,
        summary: summary
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

---

## 6.5 小程序端调用

### 6.5.1 AI导入页面

```javascript
// pages/ai-import/index.js

Page({
  data: {
    imagePath: '',
    scanning: false,
    progress: 0,
    results: []
  },

  async chooseImage() {
    const res = await wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera']
    });

    this.setData({
      imagePath: res.tempFiles[0].tempFilePath
    });
  },

  async startScan() {
    if (!this.data.imagePath) return;

    this.setData({ scanning: true, progress: 0 });
    wx.vibrateShort({ type: 'light' });

    try {
      // 1. 上传图片
      this.setData({ progress: 20 });
      const imageUrl = await this.uploadImage();

      // 2. 调用AI识别
      this.setData({ progress: 50 });
      const results = await this.parseImage(imageUrl);

      // 3. 显示结果
      this.setData({
        scanning: false,
        progress: 100,
        results: results
      });

      wx.vibrateShort({ type: 'medium' });

    } catch (err) {
      console.error('Scan failed:', err);
      this.setData({ scanning: false });
      wx.showToast({ title: '识别失败', icon: 'error' });
    }
  },

  async uploadImage() {
    const token = wx.getStorageSync('access_token');
    const userId = wx.getStorageSync('user_id');
    const fileName = `${Date.now()}.jpg`;

    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${SUPABASE_URL}/storage/v1/object/temp/${userId}/${fileName}`,
        filePath: this.data.imagePath,
        name: 'file',
        header: {
          'Authorization': `Bearer ${token}`,
          'apikey': SUPABASE_ANON_KEY
        },
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(`${SUPABASE_URL}/storage/v1/object/public/temp/${userId}/${fileName}`);
          } else {
            reject(new Error('Upload failed'));
          }
        },
        fail: reject
      });
    });
  },

  async parseImage(imageUrl) {
    const token = wx.getStorageSync('access_token');

    const res = await new Promise((resolve, reject) => {
      wx.request({
        url: `${SUPABASE_URL}/functions/v1/parse-schedule`,
        method: 'POST',
        header: {
          'Authorization': `Bearer ${token}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        data: { image_url: imageUrl },
        success: resolve,
        fail: reject
      });
    });

    if (res.statusCode === 200 && res.data.success) {
      return res.data.data;
    } else {
      throw new Error(res.data.error || '解析失败');
    }
  },

  async confirmImport(e) {
    const { index } = e.currentTarget.dataset;
    const item = this.data.results[index];

    // 导入到数据库
    // ... 实现导入逻辑

    wx.showToast({ title: '已添加', icon: 'success' });
  },

  async importAll() {
    // 批量导入所有识别结果
    // ... 实现批量导入逻辑
  }
});
```

### 6.5.2 AI摘要调用

```javascript
// pages/knowledge/index.js

async extractSummary(e) {
  const { id, url, type } = e.currentTarget.dataset;

  wx.showLoading({ title: 'AI正在阅读...' });

  try {
    const token = wx.getStorageSync('access_token');

    const res = await new Promise((resolve, reject) => {
      wx.request({
        url: `${SUPABASE_URL}/functions/v1/summarize-file`,
        method: 'POST',
        header: {
          'Authorization': `Bearer ${token}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        data: {
          file_url: url,
          file_type: type
        },
        success: resolve,
        fail: reject
      });
    });

    wx.hideLoading();

    if (res.statusCode === 200 && res.data.success) {
      // 保存摘要到数据库
      await this.saveSummary(id, res.data.summary);

      // 显示摘要
      wx.showModal({
        title: 'AI摘要',
        content: res.data.summary,
        showCancel: false
      });
    } else {
      throw new Error(res.data.error);
    }

  } catch (err) {
    wx.hideLoading();
    wx.showToast({ title: '摘要失败', icon: 'error' });
  }
}
```

---

## 6.6 成本估算

### 6.6.1 OCR成本

**腾讯云通用印刷体识别**:
- 免费额度: 1000次/月
- 超出后: 0.15元/次

**预估用量**:
- 每用户每学期: ~5次（课表+通知）
- 1000用户/月: 5000次
- 月成本: (5000 - 1000) × 0.15 = 600元

### 6.6.2 LLM成本

**DeepSeek Chat**:
- 输入: 0.001元/1K tokens
- 输出: 0.002元/1K tokens

**预估用量**:
- 课表解析: ~2K input + 1K output = 0.004元
- 任务解析: ~1K input + 0.5K output = 0.002元
- 文件摘要: ~10K input + 2K output = 0.014元

**月成本**（1000用户）:
- 课表: 1000 × 0.004 = 4元
- 任务: 2000 × 0.002 = 4元
- 摘要: 500 × 0.014 = 7元
- 合计: ~15元

### 6.6.3 总成本

| 项目 | 月成本（1000用户） |
|------|-------------------|
| OCR | ~600元 |
| LLM | ~15元 |
| Supabase | 免费（在额度内） |
| **合计** | **~615元** |

---

## 6.7 优化策略

### 6.7.1 成本优化

1. **OCR缓存**: 相同图片不重复识别
2. **LLM缓存**: 相似内容复用结果
3. **文本压缩**: 去除无关内容再调用LLM
4. **批量处理**: 合并多个请求

### 6.7.2 性能优化

1. **预处理图片**: 压缩、裁剪、增强对比度
2. **流式返回**: LLM结果流式传输
3. **异步处理**: 大文件摘要后台处理

### 6.7.3 准确率优化

1. **多模型投票**: 对比多个LLM结果
2. **人工纠错**: 用户反馈优化Prompt
3. **领域微调**: 针对课程表格式优化

---

## 6.8 环境变量配置

```bash
# Supabase Edge Functions 环境变量

# 腾讯云OCR
TENCENT_SECRET_ID=xxx
TENCENT_SECRET_KEY=xxx

# DeepSeek LLM
DEEPSEEK_API_KEY=xxx

# 备选LLM
MINIMAX_API_KEY=xxx
QIANWEN_API_KEY=xxx
```

**设置命令**:
```bash
supabase secrets set TENCENT_SECRET_ID=xxx
supabase secrets set TENCENT_SECRET_KEY=xxx
supabase secrets set DEEPSEEK_API_KEY=xxx
```

---

*下一章: [07 - 开发计划](./07-development-plan.md)*
