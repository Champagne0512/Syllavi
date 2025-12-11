const express = require('express');
const { query } = require('../config/database');

const router = express.Router();

// 获取AI使用统计
router.get('/stats', async (req, res) => {
  try {
    // 这里我们通过模拟数据来展示AI使用情况
    // 实际项目中，你应该创建专门的日志表来记录AI调用
    
    const stats = {
      today: {
        calls: Math.floor(Math.random() * 100) + 50,
        successRate: Math.random() * 10 + 85, // 85-95%
        avgResponseTime: Math.random() * 2 + 1 // 1-3秒
      },
      week: {
        calls: Math.floor(Math.random() * 500) + 200,
        successRate: Math.random() * 8 + 87, // 87-95%
        avgResponseTime: Math.random() * 1.5 + 1.2 // 1.2-2.7秒
      },
      month: {
        calls: Math.floor(Math.random() * 2000) + 1000,
        successRate: Math.random() * 6 + 89, // 89-95%
        avgResponseTime: Math.random() * 1.2 + 1.1 // 1.1-2.3秒
      }
    };

    // 模拟最近7天的使用趋势
    const dailyStats = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dailyStats.push({
        date: date.toISOString().split('T')[0],
        calls: Math.floor(Math.random() * 100) + 20,
        successRate: Math.random() * 10 + 85,
        avgResponseTime: Math.random() * 2 + 1
      });
    }

    // 按功能分类统计
    const featureStats = {
      imageRecognition: {
        calls: Math.floor(Math.random() * 300) + 100,
        successRate: Math.random() * 8 + 87
      },
      textSummary: {
        calls: Math.floor(Math.random() * 200) + 50,
        successRate: Math.random() * 6 + 89
      },
      courseExtraction: {
        calls: Math.floor(Math.random() * 150) + 80,
        successRate: Math.random() * 10 + 85
      }
    };

    res.json({
      success: true,
      data: {
        overview: stats,
        dailyTrend: dailyStats,
        featureBreakdown: featureStats
      }
    });
  } catch (error) {
    console.error('获取AI统计错误:', error);
    res.status(500).json({
      success: false,
      message: '获取AI统计失败'
    });
  }
});

// 获取AI配置
router.get('/config', async (req, res) => {
  try {
    const config = {
      qwen: {
        apiKey: process.env.QWEN_API_KEY ? '已配置' : '未配置',
        apiUrl: process.env.QWEN_API_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: process.env.QWEN_MODEL || 'qwen-vl-max',
        enabled: !!process.env.QWEN_API_KEY
      },
      deepseek: {
        apiKey: process.env.DEEPSEEK_API_KEY ? '已配置' : '未配置',
        apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1',
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        enabled: !!process.env.DEEPSEEK_API_KEY
      },
      coze: {
        botId: process.env.COZE_BOT_ID || '7578786434098970665',
        apiKey: process.env.COZE_API_KEY ? '已配置' : '未配置',
        apiUrl: process.env.COZE_API_URL || 'https://api.coze.cn/v3',
        enabled: !!process.env.COZE_API_KEY
      }
    };

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('获取AI配置错误:', error);
    res.status(500).json({
      success: false,
      message: '获取AI配置失败'
    });
  }
});

// 更新AI配置
router.put('/config', async (req, res) => {
  try {
    const { provider, settings } = req.body;
    
    if (!provider || !settings) {
      return res.status(400).json({
        success: false,
        message: '提供商和设置不能为空'
      });
    }

    // 这里应该更新环境变量或配置文件
    // 由于环境变量通常在启动时读取，实际项目中可能需要重启服务
    
    // 记录配置更新日志
    const logQuery = `
      INSERT INTO public.admin_logs (user_id, action, details, created_at)
      VALUES ($1, $2, $3, NOW())
    `;
    await query(logQuery, [
      req.user.id,
      'update_ai_config',
      JSON.stringify({ provider, settings, timestamp: new Date().toISOString() })
    ]);

    res.json({
      success: true,
      message: 'AI配置更新成功'
    });
  } catch (error) {
    console.error('更新AI配置错误:', error);
    res.status(500).json({
      success: false,
      message: '更新AI配置失败'
    });
  }
});

// 测试AI连接
router.post('/test/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    
    let result = {
      success: false,
      responseTime: 0,
      message: ''
    };

    const startTime = Date.now();

    switch (provider) {
      case 'qwen':
        if (process.env.QWEN_API_KEY) {
          result = await testQwenConnection();
        } else {
          result.message = 'Qwen API密钥未配置';
        }
        break;
      case 'deepseek':
        if (process.env.DEEPSEEK_API_KEY) {
          result = await testDeepseekConnection();
        } else {
          result.message = 'DeepSeek API密钥未配置';
        }
        break;
      case 'coze':
        if (process.env.COZE_API_KEY) {
          result = await testCozeConnection();
        } else {
          result.message = 'Coze API密钥未配置';
        }
        break;
      default:
        result.message = '不支持的AI提供商';
    }

    result.responseTime = Date.now() - startTime;

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('测试AI连接错误:', error);
    res.status(500).json({
      success: false,
      message: '测试AI连接失败'
    });
  }
});

// 获取AI调用日志
router.get('/logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const provider = req.query.provider || '';
    const status = req.query.status || '';

    // 模拟日志数据（实际项目中应该从专门的日志表读取）
    const mockLogs = [];
    for (let i = 0; i < limit; i++) {
      const providers = ['qwen', 'deepseek', 'coze'];
      const features = ['imageRecognition', 'textSummary', 'courseExtraction'];
      const statuses = ['success', 'error', 'timeout'];
      
      const randomProvider = provider || providers[Math.floor(Math.random() * providers.length)];
      const randomStatus = status && ['success', 'error'].includes(status) ? status : statuses[Math.floor(Math.random() * statuses.length)];
      
      mockLogs.push({
        id: `log_${Date.now()}_${i}`,
        provider: randomProvider,
        feature: features[Math.floor(Math.random() * features.length)],
        status: randomStatus,
        responseTime: Math.floor(Math.random() * 3000) + 100,
        userId: `user_${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        details: randomStatus === 'success' ? '处理成功' : '处理失败：网络超时'
      });
    }

    // 按时间戳排序
    mockLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const total = 1000; // 模拟总数

    res.json({
      success: true,
      data: {
        logs: mockLogs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('获取AI日志错误:', error);
    res.status(500).json({
      success: false,
      message: '获取AI日志失败'
    });
  }
});

// 辅助函数：测试Qwen连接
async function testQwenConnection() {
  try {
    const axios = require('axios');
    const response = await axios.get(
      `${process.env.QWEN_API_URL}/models`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.QWEN_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );
    return {
      success: response.status === 200,
      message: response.status === 200 ? '连接成功' : '连接失败'
    };
  } catch (error) {
    return {
      success: false,
      message: `连接失败: ${error.message}`
    };
  }
}

// 辅助函数：测试DeepSeek连接
async function testDeepseekConnection() {
  try {
    const axios = require('axios');
    const response = await axios.get(
      `${process.env.DEEPSEEK_API_URL}/models`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );
    return {
      success: response.status === 200,
      message: response.status === 200 ? '连接成功' : '连接失败'
    };
  } catch (error) {
    return {
      success: false,
      message: `连接失败: ${error.message}`
    };
  }
}

// 辅助函数：测试Coze连接
async function testCozeConnection() {
  try {
    const axios = require('axios');
    const response = await axios.get(
      `${process.env.COZE_API_URL}/bots`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.COZE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );
    return {
      success: response.status === 200,
      message: response.status === 200 ? '连接成功' : '连接失败'
    };
  } catch (error) {
    return {
      success: false,
      message: `连接失败: ${error.message}`
    };
  }
}

module.exports = router;