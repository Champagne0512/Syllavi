const express = require('express');
const { query } = require('../config/database');

const router = express.Router();

// 获取系统配置
router.get('/config', async (req, res) => {
  try {
    // 从环境变量获取系统配置
    const config = {
      database: {
        host: process.env.DB_HOST ? '已配置' : '未配置',
        port: process.env.DB_PORT || 5432,
        name: process.env.DB_NAME || 'postgres'
      },
      supabase: {
        url: process.env.SUPABASE_URL || '',
        hasAnonKey: !!process.env.SUPABASE_ANON_KEY,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_KEY
      },
      ai: {
        qwen: {
          configured: !!process.env.QWEN_API_KEY,
          apiUrl: process.env.QWEN_API_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          model: process.env.QWEN_MODEL || 'qwen-vl-max'
        },
        deepseek: {
          configured: !!process.env.DEEPSEEK_API_KEY,
          apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1',
          model: process.env.DEEPSEEK_MODEL || 'deepseek-chat'
        },
        coze: {
          configured: !!process.env.COZE_API_KEY,
          botId: process.env.COZE_BOT_ID || '7578786434098970665',
          apiUrl: process.env.COZE_API_URL || 'https://api.coze.cn/v3'
        }
      },
      server: {
        port: process.env.PORT || 3000,
        nodeEnv: process.env.NODE_ENV || 'development',
        jwtSecret: !!process.env.JWT_SECRET
      },
      admin: {
        username: process.env.ADMIN_USERNAME || 'admin',
        passwordSet: !!process.env.ADMIN_PASSWORD
      }
    };

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('获取系统配置错误:', error);
    res.status(500).json({
      success: false,
      message: '获取系统配置失败'
    });
  }
});

// 更新系统配置
router.put('/config', async (req, res) => {
  try {
    const { category, settings } = req.body;

    if (!category || !settings) {
      return res.status(400).json({
        success: false,
        message: '配置类别和设置不能为空'
      });
    }

    // 这里应该更新环境变量或配置文件
    // 实际项目中可能需要更新配置文件并重启服务
    
    // 记录配置更新日志
    const logQuery = `
      INSERT INTO public.admin_logs (user_id, action, details, created_at)
      VALUES ($1, $2, $3, NOW())
    `;
    await query(logQuery, [
      req.user.id,
      'update_system_config',
      JSON.stringify({ category, settings, timestamp: new Date().toISOString() })
    ]);

    res.json({
      success: true,
      message: '系统配置更新成功'
    });
  } catch (error) {
    console.error('更新系统配置错误:', error);
    res.status(500).json({
      success: false,
      message: '更新系统配置失败'
    });
  }
});

// 获取公告列表
router.get('/announcements', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status || 'all';
    const offset = (page - 1) * limit;

    let whereClause = '';
    let queryParams = [];
    let paramIndex = 1;

    if (status === 'active') {
      whereClause = `WHERE is_active = true AND (expires_at IS NULL OR expires_at > NOW())`;
    } else if (status === 'inactive') {
      whereClause = `WHERE is_active = false OR expires_at <= NOW()`;
    }

    // 模拟公告数据（实际项目中应该创建announcements表）
    const mockAnnouncements = [
      {
        id: '1',
        title: '系统维护通知',
        content: '今晚22:00-24:00将进行系统维护，期间服务可能暂时无法使用。',
        type: 'maintenance',
        priority: 'high',
        is_active: true,
        created_at: '2024-01-10T10:00:00Z',
        updated_at: '2024-01-10T10:00:00Z',
        expires_at: '2024-01-15T22:00:00Z',
        created_by: req.user.id
      },
      {
        id: '2',
        title: '新功能上线：AI智能识别',
        content: '我们很高兴地宣布，AI智能识别功能已经正式上线！现在您可以拍照识别课程表和待办事项了。',
        type: 'feature',
        priority: 'medium',
        is_active: true,
        created_at: '2024-01-08T14:30:00Z',
        updated_at: '2024-01-08T14:30:00Z',
        expires_at: null,
        created_by: req.user.id
      },
      {
        id: '3',
        title: '春节期间服务安排',
        content: '春节期间（2月9日-2月17日）客服服务时间调整为每日9:00-18:00。',
        type: 'holiday',
        priority: 'low',
        is_active: false,
        created_at: '2024-01-05T09:00:00Z',
        updated_at: '2024-01-20T09:00:00Z',
        expires_at: '2024-02-17T23:59:59Z',
        created_by: req.user.id
      }
    ];

    // 应用筛选
    let filteredAnnouncements = mockAnnouncements;
    if (status === 'active') {
      filteredAnnouncements = mockAnnouncements.filter(a => 
        a.is_active && (!a.expires_at || new Date(a.expires_at) > new Date())
      );
    } else if (status === 'inactive') {
      filteredAnnouncements = mockAnnouncements.filter(a => 
        !a.is_active || (a.expires_at && new Date(a.expires_at) <= new Date())
      );
    }

    // 分页
    const startIndex = offset;
    const endIndex = offset + limit;
    const paginatedData = filteredAnnouncements.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        announcements: paginatedData,
        pagination: {
          page,
          limit,
          total: filteredAnnouncements.length,
          totalPages: Math.ceil(filteredAnnouncements.length / limit)
        }
      }
    });
  } catch (error) {
    console.error('获取公告列表错误:', error);
    res.status(500).json({
      success: false,
      message: '获取公告列表失败'
    });
  }
});

// 创建公告
router.post('/announcements', async (req, res) => {
  try {
    const { title, content, type, priority, expires_at } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: '标题和内容不能为空'
      });
    }

    // 模拟创建公告（实际项目中应该插入数据库）
    const newAnnouncement = {
      id: Date.now().toString(),
      title,
      content,
      type: type || 'general',
      priority: priority || 'medium',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: expires_at || null,
      created_by: req.user.id
    };

    // 记录操作日志
    const logQuery = `
      INSERT INTO public.admin_logs (user_id, action, details, created_at)
      VALUES ($1, $2, $3, NOW())
    `;
    await query(logQuery, [
      req.user.id,
      'create_announcement',
      JSON.stringify(newAnnouncement)
    ]);

    res.json({
      success: true,
      message: '公告创建成功',
      data: newAnnouncement
    });
  } catch (error) {
    console.error('创建公告错误:', error);
    res.status(500).json({
      success: false,
      message: '创建公告失败'
    });
  }
});

// 更新公告
router.put('/announcements/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, type, priority, is_active, expires_at } = req.body;

    // 模拟更新公告
    const updatedAnnouncement = {
      id,
      title,
      content,
      type: type || 'general',
      priority: priority || 'medium',
      is_active: is_active !== undefined ? is_active : true,
      updated_at: new Date().toISOString(),
      expires_at: expires_at || null,
      updated_by: req.user.id
    };

    // 记录操作日志
    const logQuery = `
      INSERT INTO public.admin_logs (user_id, action, details, created_at)
      VALUES ($1, $2, $3, NOW())
    `;
    await query(logQuery, [
      req.user.id,
      'update_announcement',
      JSON.stringify(updatedAnnouncement)
    ]);

    res.json({
      success: true,
      message: '公告更新成功',
      data: updatedAnnouncement
    });
  } catch (error) {
    console.error('更新公告错误:', error);
    res.status(500).json({
      success: false,
      message: '更新公告失败'
    });
  }
});

// 删除公告
router.delete('/announcements/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 记录操作日志
    const logQuery = `
      INSERT INTO public.admin_logs (user_id, action, details, created_at)
      VALUES ($1, $2, $3, NOW())
    `;
    await query(logQuery, [
      req.user.id,
      'delete_announcement',
      JSON.stringify({ announcementId: id })
    ]);

    res.json({
      success: true,
      message: '公告删除成功'
    });
  } catch (error) {
    console.error('删除公告错误:', error);
    res.status(500).json({
      success: false,
      message: '删除公告失败'
    });
  }
});

// 获取操作日志
router.get('/logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const action = req.query.action || '';
    const startDate = req.query.startDate || '';
    const endDate = req.query.endDate || '';
    const offset = (page - 1) * limit;

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (action) {
      whereConditions.push(`action = $${paramIndex++}`);
      queryParams.push(action);
    }

    if (startDate) {
      whereConditions.push(`created_at >= $${paramIndex++}`);
      queryParams.push(startDate);
    }

    if (endDate) {
      whereConditions.push(`created_at <= $${paramIndex++}`);
      queryParams.push(endDate);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // 模拟日志数据（实际项目中应该从admin_logs表读取）
    const mockLogs = [];
    const actions = ['create_announcement', 'update_system_config', 'update_ai_config', 'delete_announcement'];
    
    for (let i = 0; i < limit; i++) {
      const randomAction = action || actions[Math.floor(Math.random() * actions.length)];
      const randomDate = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);
      
      mockLogs.push({
        id: `log_${Date.now()}_${i}`,
        user_id: req.user.id,
        username: req.user.username,
        action: randomAction,
        details: `操作详情 ${i + 1}`,
        created_at: randomDate.toISOString()
      });
    }

    mockLogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

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
    console.error('获取操作日志错误:', error);
    res.status(500).json({
      success: false,
      message: '获取操作日志失败'
    });
  }
});

// 系统健康检查
router.get('/health', async (req, res) => {
  try {
    const health = {
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version
      },
      database: {
        status: 'connected', // 实际项目中应该测试数据库连接
        lastCheck: new Date().toISOString()
      },
      services: {
        qwen: process.env.QWEN_API_KEY ? 'configured' : 'not_configured',
        deepseek: process.env.DEEPSEEK_API_KEY ? 'configured' : 'not_configured',
        coze: process.env.COZE_API_KEY ? 'configured' : 'not_configured'
      }
    };

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    console.error('系统健康检查错误:', error);
    res.status(500).json({
      success: false,
      message: '系统健康检查失败'
    });
  }
});

module.exports = router;