Page({
  data: {
    folders: [
      { id: 1, name: '高数', count: 12, tone: '#9BB5CE' },
      { id: 2, name: 'AI 工程', count: 8, tone: '#C9A5A0' },
      { id: 3, name: '文学', count: 5, tone: '#A3B18A' }
    ],
    files: [
      { id: 11, name: 'Chapter_05.pdf', type: 'pdf', subject: '高数', previewable: true },
      { id: 12, name: 'Lab-Guideline.pptx', type: 'ppt', subject: 'AI 工程', previewable: true }
    ],
    activeFolder: '全部'
  },
  onShow() {
    if (this.getTabBar && this.getTabBar()) {
      this.getTabBar().setSelected(2);
    }
  },
  selectFolder(e) {
    const { name } = e.currentTarget.dataset;
    this.setData({ activeFolder: name });
    wx.vibrateShort({ type: 'light' });
  },
  previewFile(e) {
    const { name } = e.currentTarget.dataset;
    wx.showToast({
      title: `预览 ${name}`,
      icon: 'none'
    });
  }
});
