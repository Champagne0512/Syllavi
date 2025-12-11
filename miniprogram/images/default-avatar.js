// 默认头像Base64数据
// 可以直接在代码中引用，避免图片加载失败

module.exports = {
  // 默认用户头像 (64x64 像素)
  userAvatar: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  
  // 默认小组图片 (64x64 像素)
  groupAvatar: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  
  // 通用占位图 (64x64 像素)
  placeholder: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
};

// 使用示例：
// const { userAvatar } = require('./images/default-avatar.js');
// 在WXML中：{{userAvatar}}