// cloudfunctions/analyzeImage/index.js
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// === 配置区域 ===
const BOT_ID = '7578786434098970665'; // 你的 Bot ID
const PAT = 'pat_8DOeTDQ0iUmtqI6HNcSlYGwddblDGbYsruX52bVaxiGMXmliNFvdZa1x3qrdLdn6'; // 你的访问令牌

exports.main = async (event, context) => {
  const { imageUrl, userId } = event;

  console.log('开始调用 Coze, 图片:', imageUrl);

  try {
    // 第一步：调用 Coze V3 Chat API 发起请求
    const initResponse = await axios.post(
      'https://api.coze.cn/v3/chat',
      {
        bot_id: BOT_ID,
        user_id: userId || 'weixin_user_001', // 必须有 user_id
        stream: false, // 关闭流式，一次性返回
        auto_save_history: true,
        additional_messages: [
          {
            role: 'user',
            content_type: 'object_string', // 关键：指定混合内容
            content: JSON.stringify([
              { type: 'text', text: '请帮我解析这张图片中的信息，严格按照JSON格式返回。' },
              { type: 'image_url', image_url: { url: imageUrl } } // 图片地址
            ])
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${PAT}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Coze 初始化响应:', JSON.stringify(initResponse.data, null, 2));
    
    const chatId = initResponse.data.data?.id;
    const conversationId = initResponse.data.data?.conversation_id;
    
    if (!chatId) {
      return { success: false, error: '无法获取聊天 ID' };
    }

    // 第二步：轮询获取结果
    let attempts = 0;
    const maxAttempts = 6; // 最多尝试6次
    const pollInterval = 500; // 每0.5秒轮询一次

    while (attempts < maxAttempts) {
      attempts++;
      console.log(`轮询第 ${attempts} 次...`);
      
      // 等待一段时间再查询
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      const pollResponse = await axios.get(
        `https://api.coze.cn/v3/chat/retrieve?chat_id=${chatId}&conversation_id=${conversationId}`,
        {
          headers: {
            'Authorization': `Bearer ${PAT}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`第 ${attempts} 次轮询结果:`, JSON.stringify(pollResponse.data, null, 2));

      const status = pollResponse.data.data?.status;
      
      if (status === 'completed') {
        // 处理完成，获取结果
        const messages = pollResponse.data.data?.messages;
        
        if (!messages || !Array.isArray(messages)) {
          return { success: false, error: 'Coze 返回的数据格式异常' };
        }
        
        // 找到 type 为 'answer' 的那条消息
        const answerMsg = messages.find(msg => msg.type === 'answer');
        
        if (!answerMsg) {
          return { success: false, error: 'Coze 没有返回答案' };
        }

        const rawContent = answerMsg.content;
        console.log('Coze 原始返回:', rawContent);

        // === 清洗数据 (核心步骤) ===
        // AI 有时候会输出 ```json ... ```，我们需要把这些 markdown 符号去掉
        let jsonStr = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
        
        // 尝试解析为对象
        let resultData;
        try {
          resultData = JSON.parse(jsonStr);
        } catch (e) {
          console.error('JSON解析失败，返回原始文本');
          // 如果解析失败，可能是 AI 说了一堆废话，这里可以做一个容错，或者直接报错
          return { success: false, error: 'AI 返回的不是标准 JSON', raw: rawContent };
        }

        return { success: true, data: resultData };
        
      } else if (status === 'failed') {
        return { success: false, error: 'Coze 处理失败' };
      }
      
      // 如果还是 in_progress，继续轮询
    }

    // 超时
    return { success: false, error: 'Coze 处理超时，请重试' };

  } catch (error) {
    console.error('API 调用错误:', error.response ? error.response.data : error);
    return { success: false, error: error.message };
  }
};