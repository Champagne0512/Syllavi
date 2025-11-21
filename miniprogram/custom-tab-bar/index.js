Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/hub/index', text: '总览' },
      { pagePath: '/pages/tasks/index', text: '待办' },
      { pagePath: '/pages/knowledge/index', text: '资料' }
    ],
    safeBottom: 0
  },
  lifetimes: {
    attached() {
      const systemInfo = wx.getSystemInfoSync();
      this.setData({ safeBottom: systemInfo.safeAreaInsets?.bottom || 0 });
    }
  },
  methods: {
    switchTab(e) {
      const { index, path } = e.currentTarget.dataset;
      this.setData({ selected: index });
      wx.vibrateShort({ type: 'light' });
      wx.switchTab({ url: path });
    },
    setSelected(index) {
      this.setData({ selected: index });
    }
  }
});
