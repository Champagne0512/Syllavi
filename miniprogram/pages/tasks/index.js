Page({
  data: {
    activeTab: 'homework',
    tasks: [
      {
        id: 1,
        type: 'homework',
        title: '操作系统实验报告',
        deadline: '11.24 23:59',
        progress: 0.45,
        progressPct: 45,
        course: 'OS',
        accent: '#9BB5CE'
      },
      {
        id: 2,
        type: 'exam',
        title: '线性代数小测',
        deadline: '11.26 08:00',
        progress: 0.2,
        progressPct: 20,
        course: 'Linear',
        accent: '#C9A5A0'
      },
      {
        id: 3,
        type: 'homework',
        title: 'AI 项目 Demo',
        deadline: '11.30 17:00',
        progress: 0.7,
        progressPct: 70,
        course: 'AI',
        accent: '#A3B18A'
      }
    ]
  },
  onShow() {
    if (this.getTabBar && this.getTabBar()) {
      this.getTabBar().setSelected(1);
    }
  },
  switchTab(e) {
    const { tab } = e.currentTarget.dataset;
    if (tab === this.data.activeTab) return;
    wx.vibrateShort({ type: 'light' });
    this.setData({ activeTab: tab });
  },
  markDone(e) {
    const { id } = e.currentTarget.dataset;
    const tasks = this.data.tasks.map((task) =>
      task.id === id
        ? { ...task, progress: 1, progressPct: 100, completed: true }
        : task
    );
    this.setData({ tasks });
    wx.vibrateShort({ type: 'light' });
    wx.showToast({ title: 'Nice Focus', icon: 'success' });
  }
});
