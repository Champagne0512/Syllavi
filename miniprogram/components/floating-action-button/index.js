Component({
  data: {
    showMenu: false
  },
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
      this.showMenu();
    },

    preventTouch() {
      return;
    },

    showMenu() {
      this.setData({ showMenu: true });
    },

    hideMenu() {
      this.setData({ showMenu: false });
    },

    goCourseRecognition() {
      this.hideMenu();
      wx.vibrateShort({ type: 'light' });
      
      // 直接跳转到课程表识别页面
      wx.navigateTo({
        url: '/pages/ai-import/index?mode=course',
        fail: (err) => {
          console.error('导航到课程表识别页失败', err);
          wx.showToast({ title: '跳转失败', icon: 'none' });
        }
      });
    },

    goTaskRecognition() {
      this.hideMenu();
      wx.vibrateShort({ type: 'light' });
      
      // 直接跳转到待办识别页面
      wx.navigateTo({
        url: '/pages/ai-import/index?mode=task',
        fail: (err) => {
          console.error('导航到待办识别页失败', err);
          wx.showToast({ title: '跳转失败', icon: 'none' });
        }
      });
    }
  }
});
