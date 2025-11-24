Component({
  data: {
    selected: 0,
    list: [
      { pagePath: 'pages/hub/index', text: '总览' },
      { pagePath: 'pages/tasks/index', text: '待办' },
      { pagePath: 'pages/knowledge/index', text: '资料' },
      { pagePath: 'pages/profile/index', text: '主页' }
    ],
    safeBottom: 0
  },
  lifetimes: {
    attached() {
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const safeBottom = windowInfo.safeArea?.bottom
        ? windowInfo.screenHeight - windowInfo.safeArea.bottom
        : windowInfo.safeArea?.bottomInset || 0;
      this.setData({ safeBottom });
    }
  },
  methods: {
    switchTab(e) {
      const { index, path } = e.currentTarget.dataset;
      this.setData({ selected: index });
      wx.vibrateShort({ type: 'light' });
      const target = path?.startsWith('/') ? path : `/${path}`;
      wx.switchTab({
        url: target,
        fail(err) {
          console.error('switchTab failed', err);
        }
      });
    },
    setSelected(index) {
      this.setData({ selected: index });
    }
  }
});
