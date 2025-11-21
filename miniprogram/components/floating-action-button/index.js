Component({
  properties: {
    pattern: {
      type: String,
      value: 'accent'
    }
  },
  data: {
    expanded: false,
    actions: [
      { id: 'focus', label: '开始专注', page: '/pages/focus/index', color: '#1148C4' },
      { id: 'ai', label: 'AI 导入', page: '/pages/ai-import/index', color: '#FF5C00' }
    ]
  },
  methods: {
    toggle() {
      const expanded = !this.data.expanded;
      this.setData({ expanded });
      wx.vibrateShort({ type: 'light' });
    },
    handleAction(e) {
      const { page } = e.currentTarget.dataset;
      this.setData({ expanded: false });
      wx.vibrateShort({ type: 'light' });
      wx.navigateTo({ url: page });
    }
  }
});
