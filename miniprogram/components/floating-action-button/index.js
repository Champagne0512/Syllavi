Component({
  properties: {
    pattern: {
      type: String,
      value: 'accent'
    }
  },
  data: {
    expanded: false,
    docked: false,
    actions: [
      { id: 'focus', label: '开始专注', page: '/pages/focus/index', color: '#1148C4' },
      { id: 'ai', label: 'AI 导入', page: '/pages/ai-import/index', color: '#FF5C00' }
    ]
  },
  methods: {
    toggleExpanded() {
      if (this.data.docked) {
        // 如果已吸附，先恢复正常状态
        this.toggleDocked();
        return;
      }
      const expanded = !this.data.expanded;
      this.setData({ expanded });
      wx.vibrateShort({ type: 'light' });
    },
    toggleDocked() {
      const docked = !this.data.docked;
      this.setData({ 
        docked,
        expanded: false 
      });
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
