Component({
  data: {
    selected: 0,
    list: [
      { pagePath: 'pages/hub/index', text: '课程与待办' },
      { pagePath: 'pages/knowledge/index', text: '资料' },
      { pagePath: 'pages/tools/index', text: '工具' },
      { pagePath: 'pages/profile/index', text: '个人' }
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
      this.syncSelected();
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
    },
    syncSelected() {
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      if (!current || !current.route) return;
      const route = current.route.startsWith('/') ? current.route.slice(1) : current.route;
      const matchedIndex = this.data.list.findIndex((item) => item.pagePath === route);
      if (matchedIndex >= 0 && matchedIndex !== this.data.selected) {
        this.setData({ selected: matchedIndex });
      }
    }
  }
});
