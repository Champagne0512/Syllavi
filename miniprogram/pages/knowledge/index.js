const { MORANDI_COLORS } = require('../../utils/colors');
const {
  createResource,
  deleteFromStorage,
  deleteResource,
  fetchResources,
  summarizeFile,
  uploadToStorage,
  updateResource,
  request
} = require('../../utils/supabase');

const MOCK_FOLDERS = [
  { id: 1, name: '高数', count: 12, tone: '#9BB5CE' },
  { id: 2, name: 'AI 工程', count: 8, tone: '#C9A5A0' },
  { id: 3, name: '文学', count: 5, tone: '#A3B18A' }
];

const MOCK_FILES = [
  { id: 11, name: 'Chapter_05.pdf', type: 'pdf', subject: '高数', previewable: true },
  { id: 12, name: 'Lab-Guideline.pptx', type: 'ppt', subject: 'AI 工程', previewable: true }
];

Page({
  data: {
    folders: [],
    files: [],
    filteredFiles: [],
    activeFolder: '全部',
    loading: true,
    // 艺术设计新增状态
    showQuote: false,
    currentQuote: { text: '', author: '' },
    zenMode: false,
    sortOrder: 'asc',
    quotes: [
      { text: "Knowledge is the only treasure that increases when shared.", author: "Unknown" },
      { text: "The beautiful thing about learning is that no one can take it away from you.", author: "B.B. King" },
      { text: "Education is the most powerful weapon which you can use to change the world.", author: "Nelson Mandela" },
      { text: "Live as if you were to die tomorrow. Learn as if you were to live forever.", author: "Mahatma Gandhi" },
      { text: "The capacity to learn is a gift; the ability to learn is a skill; the willingness to learn is a choice.", author: "Brian Herbert" }
    ],
    zenQuotes: [
      "宁静致远，智慧沉淀",
      "心无杂念，学有所成", 
      "专注当下，收获永恒",
      "静水流深，厚积薄发"
    ]
  },
  onLoad() {
    this.loadResources();
  },
  onShow() {
    if (this.getTabBar && this.getTabBar()) {
      this.getTabBar().setSelected(1);
    }
  },
  async loadResources() {
    this.setData({ loading: true });
    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      const rows = await fetchResources(userId);
      if (!rows || !rows.length) throw new Error('empty resources');

      const folderMap = {};
      rows.forEach((file) => {
        const name = file.subject || '未分类';
        folderMap[name] = (folderMap[name] || 0) + 1;
      });

      const folders = Object.keys(folderMap).map((name, idx) => ({
        id: idx,
        name,
        count: folderMap[name],
        tone: MORANDI_COLORS[idx % MORANDI_COLORS.length]
      }));

      const activeFolder = folders[0]?.name || '全部';
      this.setData(
        {
          folders,
          files: rows.map((file) => ({
            id: file.id,
            name: file.file_name,
            type: file.file_type,
            subject: file.subject || '未分类',
            url: file.file_url,
            size: file.file_size,
            aiSummary: file.ai_summary || ''
          })),
          activeFolder,
          loading: false
        },
        () => this.updateFilteredFiles()
      );
      wx.setStorageSync('resources_cache', {
        folders,
        files: this.data.files
      });
    } catch (err) {
      console.warn('Supabase resources fallback', err);
      const cached = wx.getStorageSync('resources_cache');
      if (cached && cached.files && cached.files.length) {
        this.setData(
          {
            folders: cached.folders || MOCK_FOLDERS,
            files: cached.files,
            activeFolder:
              (cached.folders && cached.folders[0] && cached.folders[0].name) ||
              '全部',
            loading: false
          },
          () => this.updateFilteredFiles()
        );
      } else {
        this.setData(
          {
            folders: MOCK_FOLDERS,
            files: MOCK_FILES,
            activeFolder: MOCK_FOLDERS[0].name,
            loading: false
          },
          () => this.updateFilteredFiles()
        );
      }
    }
  },
  updateFilteredFiles() {
    const { files, activeFolder } = this.data;
    const filtered =
      activeFolder === '全部'
        ? files
        : files.filter((file) => file.subject === activeFolder);
    this.setData({ filteredFiles: filtered });
  },
  handleFolderLongPress(e) {
    const { name } = e.currentTarget.dataset;
    if (!name) return;
    // "全部" 为聚合视图，不提供长按操作
    if (name === '全部') return;

    const relatedFiles = this.data.files.filter((file) => file.subject === name);
    if (!relatedFiles.length) return;

    wx.showActionSheet({
      itemList: ['重命名', '删除（移入"未分类"）'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 重命名
          wx.showModal({
            title: '重命名文件夹',
            editable: true,
            placeholderText: '输入新的科目名称',
            success: async (modalRes) => {
              const newName = (modalRes.content || '').trim();
              if (!modalRes.confirm || !newName || newName === name) return;
              wx.showLoading({ title: '重命名中...' });
              try {
                await Promise.all(
                  relatedFiles.map((file) =>
                    updateResource(file.id, { subject: newName })
                  )
                );
                const files = this.data.files.map((file) =>
                  file.subject === name
                    ? { ...file, subject: newName }
                    : file
                );
                this.setData(
                  {
                    files,
                    activeFolder: newName
                  },
                  () => this.loadResources()
                );
              } catch (err) {
                console.warn('rename folder failed', err);
                wx.showToast({ title: '重命名失败', icon: 'none' });
              } finally {
                wx.hideLoading();
              }
            }
          });
        } else if (res.tapIndex === 1) {
          // 删除：将文件移动到"未分类"
          wx.showModal({
            title: '删除文件夹',
            content: '仅删除分类，不会删除文件，文件将移动到"未分类"。确认继续？',
            success: async (modalRes) => {
              if (!modalRes.confirm) return;
              wx.showLoading({ title: '处理中...' });
              try {
                await Promise.all(
                  relatedFiles.map((file) =>
                    updateResource(file.id, { subject: '未分类' })
                  )
                );
                const files = this.data.files.map((file) =>
                  file.subject === name
                    ? { ...file, subject: '未分类' }
                    : file
                );
                this.setData({ files, activeFolder: '全部' }, () =>
                  this.updateFilteredFiles()
                );
              } catch (err) {
                console.warn('delete folder failed', err);
                wx.showToast({ title: '操作失败', icon: 'none' });
              } finally {
                wx.hideLoading();
              }
            }
          });
        }
      }
    });
  },
  selectFolder(e) {
    const { name } = e.currentTarget.dataset;
    this.setData({ activeFolder: name }, () => this.updateFilteredFiles());
    wx.vibrateShort({ type: 'light' });
  },

  // 使用浏览器打开文件的替代方案
  openFileInBrowser(publicUrl, originalName) {
    try {
      // 1. 复制 Supabase 公网链接到剪贴板
      wx.setClipboardData({
        data: publicUrl,
        success: () => {
          // 显示复制成功提示
          wx.showToast({
            title: '链接已复制到剪贴板 ✅',
            icon: 'none',
            duration: 2000
          });
          
          // 2. 弹出引导弹窗，提示用户打开浏览器
          setTimeout(() => {
            wx.showModal({
              title: '文件查看指引',
              content: `1. 链接已复制到剪贴板\n2. 打开手机浏览器（如微信/Chrome）\n3. 粘贴链接并访问，即可下载/查看「${originalName}」`,
              confirmText: '打开浏览器',
              cancelText: '知道了',
              success: (res) => {
                if (res.confirm) {
                  // 3. 尝试唤起微信内置浏览器
                  wx.navigateTo({
                    url: `/pages/web-view/web-view?url=${encodeURIComponent(publicUrl)}`,
                    fail: () => {
                      // 唤起失败则提示手动打开
                      wx.showToast({
                        title: '请手动打开浏览器粘贴链接',
                        icon: 'none',
                        duration: 4000
                      });
                    }
                  });
                }
              }
            });
          }, 2000); // 延迟2秒显示弹窗，让用户先看到复制成功提示
        },
        fail: (err) => {
          console.error('复制链接失败:', err);
          wx.showToast({
            title: '链接复制失败，请手动复制：' + publicUrl,
            icon: 'none',
            duration: 5000
          });
        }
      });
    } catch (err) {
      console.error('唤起浏览器失败:', err);
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    }
  },
  previewFile(e) {
    const { id } = e.currentTarget.dataset;
    const file = this.data.files.find((f) => f.id === id);
    if (!file || !file.url) {
      wx.showToast({ title: '暂无文件 URL', icon: 'none' });
      return;
    }
    
    console.log('预览文件:', file.url, '文件名:', file.name, '文件类型:', file.type);
    
    // 直接使用浏览器打开方案，避免400错误
    this.openFileInBrowser(file.url, file.name);
  },

  async uploadResource() {
    // 防止重复上传
    if (this._uploading) {
      console.log('上传进行中，请勿重复操作');
      return;
    }
    
    try {
      this._uploading = true;
      
      const { tempFiles } = await wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['pdf', 'ppt', 'pptx', 'doc', 'docx', 'jpg', 'png']
      });
      if (!tempFiles || !tempFiles.length) {
        this._uploading = false;
        return;
      }
      const file = tempFiles[0];
      
      // 调试日志：检查文件对象结构
      console.log('选择的文件对象:', file);
      
      wx.showLoading({ title: '上传中...' });

      const { publicUrl } = await uploadToStorage(
        'resources',
        file.path || file.tempFilePath || file.url,
        file.name
      );

      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;

      const [row] = await createResource({
        user_id: userId,
        file_name: file.name,
        file_url: publicUrl,
        file_type: this.getFileType(file.name),
        file_size: file.size,
        subject: this.data.activeFolder === '全部' ? '未分类' : this.data.activeFolder
      });

      wx.hideLoading();
      wx.showToast({ title: '已上传', icon: 'success' });

      // 使用setTimeout避免立即触发页面重渲染
      setTimeout(() => {
        this.setData(
          {
            files: [
              {
                id: row.id,
                name: row.file_name,
                type: row.file_type,
                subject: row.subject || '未分类',
                url: row.file_url,
                size: row.file_size,
                aiSummary: row.ai_summary || ''
              },
              ...this.data.files
            ]
          },
          () => {
            this.updateFilteredFiles();
            this._uploading = false;
          }
        );
      }, 100);
    } catch (err) {
      console.warn('upload failed', err);
      wx.hideLoading();
      wx.showToast({ title: '上传失败', icon: 'none' });
      this._uploading = false;
    }
  },

  getFileType(name = '') {
    const lower = name.toLowerCase();
    if (lower.endsWith('.pdf')) return 'pdf';
    if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) return 'pptx';
    if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'docx';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpg';
    if (lower.endsWith('.png')) return 'png';
    return 'other';
  },

  handleFileLongPress(e) {
    const { id } = e.currentTarget.dataset;
    const file = this.data.files.find((f) => f.id === id);
    if (!file) return;
    
    wx.showActionSheet({
      itemList: ['AI 划重点', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.runSummary(file);
        } else if (res.tapIndex === 1) {
          this.removeFile(file);
        }
      }
    });
  },

  async runSummary(file) {
    if (!file.url) {
      wx.showToast({ title: '缺少文件地址', icon: 'none' });
      return;
    }

    // 若已存在摘要，优先展示缓存，并提供重新生成选项
    if (file.aiSummary) {
      wx.showModal({
        title: 'AI 划重点',
        content: file.aiSummary.slice(0, 800),
        confirmText: '重新生成',
        cancelText: '关闭',
        success: (res) => {
          if (res.confirm) {
            this.generateSummary(file);
          }
        }
      });
      return;
    }

    this.generateSummary(file);
  },

  async generateSummary(file) {
    wx.showLoading({ title: 'AI 划重点中...' });
    try {
      const summary = await summarizeFile(file.url, file.type);
      await updateResource(file.id, { ai_summary: summary });
      // 同步更新本地缓存
      const files = this.data.files.map((f) =>
        f.id === file.id ? { ...f, aiSummary: summary } : f
      );
      this.setData({ files }, () => this.updateFilteredFiles());
      wx.hideLoading();
      wx.showModal({
        title: 'AI 划重点',
        content: summary.slice(0, 800),
        showCancel: false
      });
    } catch (err) {
      console.warn('summary failed', err);
      wx.hideLoading();
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  },

  async removeFile(file) {
    wx.showModal({
      title: '删除文件',
      content: '删除后无法恢复，确认删除？',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...' });
        try {
          // 删除记录
          await deleteResource(file.id);
          // 尝试删除存储对象
          if (file.url) {
            const parts = file.url.split('/resources/');
            if (parts[1]) {
              await deleteFromStorage('resources', parts[1]);
            }
          }
          const files = this.data.files.filter((f) => f.id !== file.id);
          this.setData({ files }, () => this.updateFilteredFiles());
          wx.hideLoading();
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch (err) {
          console.warn('delete resource failed', err);
          wx.hideLoading();
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  },

  // 艺术设计新增方法
  showMoodQuote() {
    const randomIndex = Math.floor(Math.random() * this.data.quotes.length);
    this.setData({
      showQuote: true,
      currentQuote: this.data.quotes[randomIndex]
    });
    
    // 震动反馈
    wx.vibrateShort({ type: 'light' });
    
    // 5秒后自动隐藏
    setTimeout(() => {
      this.setData({ showQuote: false });
    }, 5000);
  },

  toggleZenMode() {
    const zenMode = !this.data.zenMode;
    const randomIndex = Math.floor(Math.random() * this.data.zenQuotes.length);
    
    this.setData({
      zenMode,
      zenQuote: this.data.zenQuotes[randomIndex]
    });

    // 震动反馈
    wx.vibrateShort({ type: 'light' });
    
    if (zenMode) {
      // 进入专注模式
      wx.showToast({
        title: '进入专注模式',
        icon: 'none',
        duration: 1000
      });
    }
  },

  toggleSort() {
    const sortOrder = this.data.sortOrder === 'asc' ? 'desc' : 'asc';
    this.setData({ sortOrder }, () => {
      this.sortFiles();
    });
    
    // 震动反馈
    wx.vibrateShort({ type: 'light' });
  },

  sortFiles() {
    const { filteredFiles, sortOrder } = this.data;
    const sortedFiles = [...filteredFiles].sort((a, b) => {
      if (sortOrder === 'asc') {
        return a.name.localeCompare(b.name);
      } else {
        return b.name.localeCompare(a.name);
      }
    });
    
    this.setData({ filteredFiles: sortedFiles });
  },

  playAmbientSound() {
    wx.showToast({
      title: '环境音效功能开发中',
      icon: 'none',
      duration: 2000
    });
  },

  formatSize(bytes) {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  },

  // 基础文件管理功能已简化，移除分享相关代码
});
