Page({
  data: {
    fileUrl: ''
  },

  onLoad(options) {
    const { url } = options;
    if (url) {
      this.setData({ 
        fileUrl: decodeURIComponent(url) 
      });
    }
  },

  // web-view加载错误处理
  onWebError(e) {
    console.error('web-view加载失败:', e.detail);
    wx.showModal({
      title: '打开失败',
      content: '无法在微信内置浏览器中打开此文件，请复制链接到手机浏览器（如Chrome/Edge）打开',
      showCancel: true,
      confirmText: '复制链接',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          wx.setClipboardData({
            data: this.data.fileUrl,
            success: () => {
              wx.showToast({
                title: '链接已复制',
                icon: 'success'
              });
            }
          });
        } else {
          wx.navigateBack();
        }
      }
    });
  }
});