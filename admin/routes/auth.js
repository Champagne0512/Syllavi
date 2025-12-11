const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// 登录接口
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空'
      });
    }

    // 验证管理员账号
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    console.log('登录尝试:', { 
      输入用户名: username, 
      配置用户名: adminUsername,
      密码匹配: password === adminPassword 
    });

    if (username === adminUsername && password === adminPassword) {
      console.log('登录成功，生成token');
      // 简单密码验证（生产环境应该使用bcrypt）
      const token = generateToken({
        id: 'admin',
        username: adminUsername,
        role: 'admin'
      });

      return res.json({
        success: true,
        message: '登录成功',
        data: {
          token,
          user: {
            id: 'admin',
            username: adminUsername,
            role: 'admin',
            nickname: '系统管理员'
          }
        }
      });
    }

    console.log('登录失败: 用户名或密码错误');
    res.status(401).json({
      success: false,
      message: '用户名或密码错误'
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

// 验证令牌
router.get('/verify', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      success: false,
      message: '令牌缺失'
    });
  }

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    res.json({
      success: true,
      data: {
        user: decoded
      }
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: '令牌无效'
    });
  }
});

// 登出（客户端处理，服务端记录日志）
router.post('/logout', (req, res) => {
  res.json({
    success: true,
    message: '登出成功'
  });
});

module.exports = router;