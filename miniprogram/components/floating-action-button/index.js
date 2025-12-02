Component({
  properties: {
    pattern: {
      type: String,
      value: 'accent'
    }
  },
  lifetimes: {
    attached() {
      console.log('悬浮按钮组件已加载');
    }
  },
  methods: {
    handleTap() {
      wx.vibrateShort({ type: 'light' });
      this.goAiUpload();
    },

    preventTouch() {
      return;
    },

    goAiUpload() {
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];

      if (currentPage && typeof currentPage.handleScanImage === 'function') {
        currentPage.handleScanImage();
        return;
      }

      wx.navigateTo({
        url: '/pages/ai-import/index',
        fail: (err) => {
          console.error('导航到 AI 导入页失败', err);
          wx.showToast({ title: '跳转失败', icon: 'none' });
        }
      });
    }
  }
});
