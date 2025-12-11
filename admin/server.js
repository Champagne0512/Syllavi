const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 安全中间件
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// 请求限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100 // 限制每个IP 15分钟内最多100个请求
});
app.use('/api', limiter);

// 基础中间件
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 设置视图引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 导入路由
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const coursesRouter = require('./routes/courses');
const aiRouter = require('./routes/ai');
const statsRouter = require('./routes/stats');
const settingsRouter = require('./routes/settings');

// 中间件：会话验证
const { authenticateToken, authenticatePage } = require('./middleware/auth');

// 根路径 - 显示简化登录页面
app.get('/', (req, res) => {
  res.render('login-simple', { title: 'Syllaby 后台管理系统 - 登录' });
});

// 专门的路由
app.get('/login', (req, res) => {
  res.render('login-simple', { title: 'Syllaby 后台管理系统 - 登录' });
});

// 需要认证的页面
app.get('/dashboard', authenticatePage, (req, res) => {
  res.render('dashboard', { 
    title: 'Syllaby 后台管理系统',
    user: req.user,
    currentPage: 'dashboard'
  });
});

app.get('/users', authenticatePage, (req, res) => {
  res.render('users', { 
    title: '用户管理 - Syllaby 后台',
    user: req.user,
    currentPage: 'users'
  });
});

app.get('/courses', authenticatePage, (req, res) => {
  res.render('courses', { 
    title: '课程管理 - Syllaby 后台',
    user: req.user,
    currentPage: 'courses'
  });
});

app.get('/ai', authenticatePage, (req, res) => {
  res.render('ai', { 
    title: 'AI管理 - Syllaby 后台',
    user: req.user,
    currentPage: 'ai'
  });
});

app.get('/stats', authenticatePage, (req, res) => {
  res.render('stats', { 
    title: '数据统计 - Syllaby 后台',
    user: req.user,
    currentPage: 'stats'
  });
});

app.get('/settings', authenticatePage, (req, res) => {
  res.render('settings', { 
    title: '系统设置 - Syllaby 后台',
    user: req.user,
    currentPage: 'settings'
  });
});

// API路由
app.use('/api/auth', authRouter);
app.use('/api/users', authenticateToken, usersRouter);
app.use('/api/courses', authenticateToken, coursesRouter);
app.use('/api/ai', authenticateToken, aiRouter);
app.use('/api/stats', authenticateToken, statsRouter);
app.use('/api/settings', authenticateToken, settingsRouter);

// 404处理
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ success: false, message: 'API端点不存在' });
  } else {
    res.status(404).render('404', { title: '页面不存在' });
  }
});

// 启动服务器
app.listen(PORT, async () => {
  console.log(`🚀 Syllaby 后台管理系统启动成功！`);
  console.log(`📱 服务地址: http://localhost:${PORT}`);
  console.log(`🌍 环境: ${process.env.NODE_ENV || 'development'}`);
  
  // 测试数据库连接
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase.from('profiles').select('count').limit(1);
      if (error) {
        console.log('❌ 数据库连接失败:', error.message);
        console.log('🔄 启用演示模式');
        global.demoMode = true;
      } else {
        console.log('✅ 数据库连接成功');
        global.demoMode = false;
      }
    } else {
      console.log('❌ 数据库配置缺失');
      console.log('🔄 启用演示模式');
      global.demoMode = true;
    }
  } catch (err) {
    console.log('❌ 数据库连接失败:', err.message);
    console.log('🔄 启用演示模式');
    global.demoMode = true;
  }
});

module.exports = app;