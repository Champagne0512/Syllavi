const jwt = require('jsonwebtoken');

// JWT验证中间件（适用于API请求）
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: '访问令牌缺失' 
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ 
        success: false, 
        message: '令牌无效或已过期' 
      });
    }
    req.user = user;
    next();
  });
}

// 页面访问认证中间件（从cookie获取token）
function authenticatePage(req, res, next) {
  // 从cookie获取token
  const token = req.cookies?.adminToken || req.headers.cookie?.match(/adminToken=([^;]+)/)?.[1];
  
  if (!token) {
    // 没有token，重定向到登录页
    return res.redirect('/');
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      // token无效，重定向到登录页
      return res.redirect('/');
    }
    req.user = user;
    next();
  });
}

// 生成JWT令牌
function generateToken(user) {
  return jwt.sign(
    { 
      id: user.id, 
      username: user.username,
      role: user.role || 'admin'
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
}

// 验证管理员权限
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: '权限不足，需要管理员权限' 
    });
  }
  next();
}

module.exports = {
  authenticateToken,
  authenticatePage,
  generateToken,
  requireAdmin
};