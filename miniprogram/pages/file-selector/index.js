const {
  fetchResources
} = require('../../utils/supabase');

Page({
  data: {
    files: [],
    loading: true,
    searchQuery: ''
  },

  onLoad() {
    this.loadFiles();
  },

  async loadFiles() {
    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      const rows = await fetchResources(userId);

      if (!rows || !rows.length) {
        this.setData({
          files: [],
          loading: false
        });
        return;
      }

      const files = rows.map((file) => ({
        id: file.id,
        name: file.file_name,
        type: file.file_type,
        uiType: this.getFileTypeClass(file.file_type),
        subject: file.subject || '未分类',
        url: file.file_url,
        size: file.file_size,
        aiSummary: file.ai_summary || '',
        createdAt: file.created_at
      }));

      this.setData({
        files,
        loading: false
      });
    } catch (error) {
      console.error('加载文件列表失败:', error);
      this.setData({
        files: [],
        loading: false
      });
      wx.showToast({
        title: '加载文件失败',
        icon: 'none'
      });
    }
  },

  getFileTypeClass(type) {
    const map = {
      'pdf': 'pdf',
      'ppt': 'ppt', 'pptx': 'ppt',
      'doc': 'doc', 'docx': 'doc',
      'jpg': 'img', 'png': 'img', 'jpeg': 'img',
      'txt': 'txt'
    };
    return map[type] || 'other';
  },

  formatSize(bytes) {
    if (!bytes) return '未知大小';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  },

  // 选择文件进行AI分析
  selectFile(e) {
    const fileId = e.currentTarget.dataset.id;
    const file = this.data.files.find(f => f.id === fileId);

    if (file) {
      wx.navigateTo({
        url: `/pages/ai-summary/index?id=${fileId}`,
        success: (res) => {
          console.log('成功跳转到AI摘要页面', fileId);
        },
        fail: (err) => {
          console.error('跳转到AI摘要页面失败:', err);
          wx.showToast({
            title: '页面跳转失败',
            icon: 'none'
          });
        }
      });
    } else {
      wx.showToast({
        title: '文件不存在',
        icon: 'none'
      });
    }
  },

  // 搜索功能
  onSearchInput(e) {
    this.setData({
      searchQuery: e.detail.value
    });
  },

  onSearch() {
    // 可以添加搜索逻辑
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  }
});