const { MORANDI_COLORS } = require('../../utils/colors');
const {
  createCourse,
  createCourseSchedules,
  createResource,
  createTask,
  deleteFromStorage,
  deleteResource,
  DEMO_USER_ID,
  fetchResources,
  summarizeFile,
  uploadToStorage,
  updateResource
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

const CONTINUUM_STORAGE_KEY = 'knowledge_last_open';

Page({
  data: {
    folders: [],
    files: [],
    filteredFiles: [],
    activeFolder: '全部',
    loading: true,
    sortOrder: 'asc',
    // 批量操作相关状态
    selectionMode: false,
    selectedFiles: [],
    lastOpenedFile: null,
    actionableInsight: null
  },

  // 增加一个辅助函数用于 CSS 类名映射
  getFileTypeClass(type) {
    // 文档类型映射到CSS类名
    const map = {
      // 文档类型
      'pdf': 'pdf',
      'doc': 'doc', 'docx': 'doc',
      'ppt': 'ppt', 'pptx': 'ppt',
      'xlsx': 'xls', 'xls': 'xls',
      'txt': 'txt',
      'rtf': 'doc',
      'csv': 'xls',
      'md': 'txt',
      'html': 'doc', 'htm': 'doc',
      
      // 图片类型
      'jpg': 'img', 'jpeg': 'img', 'png': 'img',
      'gif': 'img', 'bmp': 'img', 'webp': 'img',
      
      // 其他类型
      'other': 'other'
    };
    return map[type] || 'other';
  },
  onLoad() {
    // 检查登录状态
    this.checkAuthStatus();
    this.hydrateLastOpenedFile();
    this.refreshActionableInsight([]);
    this.loadResources();
  },

  // 检查登录状态
  checkAuthStatus() {
    // 优先使用新的存储键名，兼容旧的键名
    const token = wx.getStorageSync('syllaby_access_token') || wx.getStorageSync('access_token');
    const refreshToken = wx.getStorageSync('syllaby_refresh_token') || wx.getStorageSync('refresh_token');
    const userId = wx.getStorageSync('syllaby_user_id') || wx.getStorageSync('user_id');
    const expiresAt = wx.getStorageSync('syllaby_token_expires_at') || wx.getStorageSync('token_expires_at');
    
    console.log('知识库页面检查登录状态:', {
      userId,
      hasToken: !!token,
      hasRefreshToken: !!refreshToken,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null
    });
    
    // 如果没有用户信息或演示模式，允许继续使用但显示提示
    if (!userId || userId === DEMO_USER_ID) {
      console.log('未登录或演示模式，允许使用知识库功能');
      return;
    }
    
    // 检查 token 状态
    if (token) {
      const now = Date.now();
      const tokenExpired = expiresAt ? now >= expiresAt : false;
      const oneHour = 60 * 60 * 1000;
      const willExpireSoon = expiresAt ? (expiresAt - now) < oneHour : false;
      
      console.log('知识库页面Token状态检查:', {
        expired: tokenExpired,
        willExpireSoon: willExpireSoon,
        timeLeft: expiresAt ? Math.floor((expiresAt - now) / 1000 / 60) + '分钟' : '未知'
      });
      
      // 如果 token 已过期且无法刷新，提示重新登录
      if (tokenExpired && !refreshToken) {
        console.log('Token已过期且无法刷新，提示重新登录');
        wx.showToast({
          title: '登录已过期，部分功能受限',
          icon: 'none',
          duration: 3000
        });
        
        // 清除过期的token信息
        wx.removeStorageSync('syllaby_access_token');
        wx.removeStorageSync('access_token');
        wx.removeStorageSync('syllaby_token_expires_at');
        wx.removeStorageSync('token_expires_at');
      }
    } else {
      // 没有token但有用户ID，可能是异常状态，清除数据并显示提示
      console.log('没有token但有用户ID，清除异常状态');
      wx.showToast({
        title: '登录状态异常，使用演示模式',
        icon: 'none',
        duration: 3000
      });
      
      // 清除所有用户数据
      wx.removeStorageSync('syllaby_access_token');
      wx.removeStorageSync('access_token');
      wx.removeStorageSync('syllaby_refresh_token');
      wx.removeStorageSync('refresh_token');
      wx.removeStorageSync('syllaby_token_expires_at');
      wx.removeStorageSync('token_expires_at');
      wx.removeStorageSync('syllaby_user_id');
      wx.removeStorageSync('user_id');
      
      // 设置演示用户ID
      wx.setStorageSync('user_id', DEMO_USER_ID);
      wx.setStorageSync('syllaby_user_id', DEMO_USER_ID);
    }
  },
  onShow() {
    // 每次显示页面时检查登录状态
    this.checkAuthStatus();
    const app = getApp();
    app.syncTabBar(); // 使用全局同步方法
    this.setData({ showUploadModal: false });
  },
  onUnload() {
    this.clearAiPolling();
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

      const baseFiles = rows.map((file) => ({
        id: file.id,
        name: file.file_name,
        type: file.file_type,
        uiType: this.getFileTypeClass(file.file_type),
        subject: file.subject || '未分类',
        url: file.file_url,
        size: file.file_size,
        aiSummary: file.ai_summary || '',
        isSelected: false
      }));

      const activeFolder = folders[0]?.name || '全部';
      const decoratedFiles = this.decorateFilesWithSelection(baseFiles, this.data.selectedFiles);
      this.setData(
        {
          folders,
          files: decoratedFiles,
          activeFolder,
          loading: false
        },
        () => {
          this.updateFilteredFiles();
          this.refreshActionableInsight();
          this.hydrateLastOpenedFile();
        }
      );
      wx.setStorageSync('resources_cache', {
        folders,
        files: this.data.files
      });
    } catch (err) {
      console.warn('Supabase resources fallback', err);
      const cached = wx.getStorageSync('resources_cache');
      if (cached && cached.files && cached.files.length) {
        const cachedFiles = cached.files.map((file) => ({
          ...file,
          uiType: file.uiType || this.getFileTypeClass(file.type || file.file_type || ''),
          isSelected: false
        }));
        const decoratedCached = this.decorateFilesWithSelection(cachedFiles, this.data.selectedFiles);
        this.setData(
          {
            folders: cached.folders || MOCK_FOLDERS,
            files: decoratedCached,
            activeFolder:
              (cached.folders && cached.folders[0] && cached.folders[0].name) ||
              '全部',
            loading: false
          },
          () => {
            this.updateFilteredFiles();
            this.refreshActionableInsight();
            this.hydrateLastOpenedFile();
          }
        );
      } else {
        const mockFiles = MOCK_FILES.map((file) => ({
          ...file,
          uiType: this.getFileTypeClass(file.type || ''),
          isSelected: false
        }));
        const decoratedMocks = this.decorateFilesWithSelection(mockFiles, this.data.selectedFiles);
        this.setData(
          {
            folders: MOCK_FOLDERS,
            files: decoratedMocks,
            activeFolder: MOCK_FOLDERS[0].name,
            loading: false
          },
          () => {
            this.updateFilteredFiles();
            this.refreshActionableInsight();
            this.hydrateLastOpenedFile();
          }
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
    if(this.data.activeFolder === name) return;
    
    this.setData({ activeFolder: name }, () => this.updateFilteredFiles());
    wx.vibrateShort({ type: 'light' }); // 加上震动
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
  async openPdfInline(file) {
    if (!file || !file.url) return false;
    wx.showLoading({ title: '打开 PDF...' });
    try {
      const tempFilePath = await this.downloadRemoteFile(file.url);
      await this.openDocumentWithWx(tempFilePath, 'pdf');
      return true;
    } catch (err) {
      console.warn('inline pdf failed', err);
      return false;
    } finally {
      wx.hideLoading();
    }
  },
  downloadRemoteFile(url) {
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url,
        success: (res) => {
          if (res.statusCode === 200 && res.tempFilePath) {
            resolve(res.tempFilePath);
          } else {
            reject(new Error('download failed'));
          }
        },
        fail: reject
      });
    });
  },
  openDocumentWithWx(filePath, fileType = 'pdf') {
    return new Promise((resolve, reject) => {
      wx.openDocument({
        filePath,
        fileType,
        showMenu: true,
        success: resolve,
        fail: reject
      });
    });
  },
  async previewFile(e) {
    const { id } = e.currentTarget.dataset;
    const file = this.data.files.find((f) => f.id === id);
    if (!file || !file.url) {
      wx.showToast({ title: '暂无文件 URL', icon: 'none' });
      return;
    }

    this.persistLastOpenedFile(file);

    if ((file.type || '').toLowerCase() === 'pdf') {
      const opened = await this.openPdfInline(file);
      if (opened) return;
    }

    // 直接使用浏览器打开方案，避免400错误
    this.openFileInBrowser(file.url, file.name);
  },

  async uploadResource() {
    // 防止重复上传
    if (this._uploading) {
      return;
    }
    
    try {
      this._uploading = true;
      
      const { tempFiles } = await wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: [
          // 文档类型
          'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt',
          // 图片类型
          'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp',
          // 其他常见格式
          'rtf', 'csv', 'md', 'html', 'htm'
        ]
      });
      if (!tempFiles || !tempFiles.length) {
        this._uploading = false;
        return;
      }
      const file = tempFiles[0];
      
      wx.showLoading({ title: '上传中...' });

      const uploadResult = await uploadToStorage(
        'resources',
        file.path || file.tempFilePath || file.url,
        file.name
      );

      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      const publicUrl = uploadResult.publicUrl;
      const originalName = uploadResult.originalName || file.name;

      const [row] = await createResource({
        user_id: userId,
        file_name: originalName, // 使用原始文件名，包含中文字符
        file_url: publicUrl,
        file_type: this.getFileType(originalName),
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
                uiType: this.getFileTypeClass(row.file_type), // 添加UI类型映射
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
            this.refreshActionableInsight();
            this._uploading = false;
            wx.vibrateShort({ type: 'medium' }); // 成功后震动
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
    
    // 文档类型
    if (lower.endsWith('.pdf')) return 'pdf';
    if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'docx';
    if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) return 'pptx';
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx';
    if (lower.endsWith('.txt')) return 'txt';
    if (lower.endsWith('.rtf')) return 'rtf';
    if (lower.endsWith('.csv')) return 'csv';
    if (lower.endsWith('.md')) return 'md';
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
    
    // 图片类型
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpg';
    if (lower.endsWith('.png')) return 'png';
    if (lower.endsWith('.gif')) return 'gif';
    if (lower.endsWith('.bmp')) return 'bmp';
    if (lower.endsWith('.webp')) return 'webp';
    
    // 其他类型
    return 'other';
  },

  handleFileLongPress(e) {
    const { id } = e.currentTarget.dataset;
    const file = this.data.files.find((f) => f.id === id);
    if (!file) return;
    
    wx.showActionSheet({
      itemList: ['重命名', '更改分类', 'AI 划重点', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.renameFile(file);
        } else if (res.tapIndex === 1) {
          this.changeFileCategory(file);
        } else if (res.tapIndex === 2) {
          this.runSummary(file);
        } else if (res.tapIndex === 3) {
          this.removeFile(file);
        }
      }
    });
  },

  runSummary(file) {
    // 导航到AI摘要页面，并传入文件ID
    wx.navigateTo({
      url: `/pages/ai-summary/index?id=${file.id}`
    });
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
          this.setData({ files }, () => {
            this.updateFilteredFiles();
            this.refreshActionableInsight();
          });
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

  

  toggleSort() {
    const sortOrder = this.data.sortOrder === 'asc' ? 'desc' : 'asc';
    this.setData({ sortOrder }, () => {
      this.sortFiles();
      wx.vibrateShort({ type: 'light' }); // 震动反馈
    });
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

  

  formatSize(bytes) {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  },

  // 重命名文件功能
  async renameFile(file) {
    wx.showModal({
      title: '重命名文件',
      editable: true,
      placeholderText: file.name,
      success: async (res) => {
        if (!res.confirm) return;
        const newName = (res.content || '').trim();
        if (!newName || newName === file.name) {
          wx.showToast({ title: '名称未更改', icon: 'none' });
          return;
        }
        
        wx.showLoading({ title: '重命名中...' });
        try {
          // 更新数据库中的文件名
          await updateResource(file.id, { file_name: newName });
          
          // 更新本地数据
          const files = this.data.files.map((f) =>
            f.id === file.id ? { ...f, name: newName } : f
          );
          const filteredFiles = this.data.filteredFiles.map((f) =>
            f.id === file.id ? { ...f, name: newName } : f
          );
          
          this.setData({ files, filteredFiles }, () => {
            wx.hideLoading();
            wx.showToast({ title: '重命名成功', icon: 'success' });
          });
        } catch (err) {
          console.error('重命名文件失败:', err);
          wx.hideLoading();
          wx.showToast({ title: '重命名失败', icon: 'none' });
        }
      }
    });
  },
  
  // 更改文件分类功能
  async changeFileCategory(file) {
    const { folders } = this.data;
    const folderNames = folders.map(f => f.name);
    
    // 添加"新建分类"选项
    const options = [...folderNames, '新建分类'];
    
    wx.showActionSheet({
      itemList: options,
      success: async (res) => {
        const selectedOption = options[res.tapIndex];
        
        // 如果选择了"新建分类"
        if (selectedOption === '新建分类') {
          this.createNewCategory(file);
          return;
        }
        
        // 如果选择了和当前相同的分类，不做任何操作
        if (selectedOption === file.subject) {
          wx.showToast({ title: '分类未更改', icon: 'none' });
          return;
        }
        
        wx.showLoading({ title: '更新分类中...' });
        try {
          // 更新数据库中的文件分类
          await updateResource(file.id, { subject: selectedOption });
          
          // 更新本地数据
          const files = this.data.files.map((f) =>
            f.id === file.id ? { ...f, subject: selectedOption } : f
          );
          const filteredFiles = this.data.filteredFiles.map((f) =>
            f.id === file.id ? { ...f, subject: selectedOption } : f
          );
          
          this.setData({ files, filteredFiles }, () => {
            // 重新加载资源以更新文件夹计数
            this.loadResources();
            wx.hideLoading();
            wx.showToast({ title: '分类更新成功', icon: 'success' });
          });
        } catch (err) {
          console.error('更新文件分类失败:', err);
          wx.hideLoading();
          wx.showToast({ title: '更新失败', icon: 'none' });
        }
      }
    });
  },
  
  // 创建新分类功能
  createNewCategory(file) {
    wx.showModal({
      title: '新建分类',
      editable: true,
      placeholderText: '输入新分类名称',
      success: async (res) => {
        if (!res.confirm) return;
        const newCategory = (res.content || '').trim();
        if (!newCategory) {
          wx.showToast({ title: '分类名称不能为空', icon: 'none' });
          return;
        }
        
        wx.showLoading({ title: '创建分类中...' });
        try {
          // 更新数据库中的文件分类
          await updateResource(file.id, { subject: newCategory });
          
          // 更新本地数据
          const files = this.data.files.map((f) =>
            f.id === file.id ? { ...f, subject: newCategory } : f
          );
          const filteredFiles = this.data.filteredFiles.map((f) =>
            f.id === file.id ? { ...f, subject: newCategory } : f
          );
          
          this.setData({ files, filteredFiles }, () => {
            // 重新加载资源以更新文件夹计数和添加新文件夹
            this.loadResources();
            wx.hideLoading();
            wx.showToast({ title: '新分类创建成功', icon: 'success' });
          });
        } catch (err) {
          console.error('创建新分类失败:', err);
          wx.hideLoading();
          wx.showToast({ title: '创建失败', icon: 'none' });
        }
      }
    });
  },

  // 进入选择模式
  enterSelectionMode() {
    wx.showToast({ title: '进入批量操作模式', icon: 'none', duration: 1000 });
    wx.vibrateShort({ type: 'light' });
    this.setData({ selectionMode: true }, () => {
      this.applySelectionState([]);
    });
  },
  
  // 退出选择模式
  exitSelectionMode() {
    wx.vibrateShort({ type: 'light' });
    this.setData({ selectionMode: false }, () => {
      this.applySelectionState([]);
    });
  },
  
  // 切换文件选择状态
  toggleFileSelection(e) {
    const fileId = String(e.currentTarget.dataset.id || '');
    if (!fileId) return;
    const selectedFiles = this.data.selectedFiles || [];
    const index = selectedFiles.indexOf(fileId);
    const newSelectedFiles = index === -1
      ? [...selectedFiles, fileId]
      : selectedFiles.filter((item) => item !== fileId);
    this.applySelectionState(newSelectedFiles);
    wx.vibrateShort({ type: 'light' });
  },
  
  // 批量重命名
  batchRename() {
    const { selectedFiles, files } = this.data;
    if (selectedFiles.length !== 1) {
      wx.showToast({ title: '请选择一个文件进行重命名', icon: 'none' });
      return;
    }
    
    const file = files.find((f) => f.id === selectedFiles[0]);
    if (!file) return;
    
    this.exitSelectionMode();
    setTimeout(() => {
      this.renameFile(file);
    }, 300);
  },
  
  // 批量更改分类
  batchChangeCategory() {
    const { selectedFiles, files, folders } = this.data;
    if (selectedFiles.length === 0) {
      wx.showToast({ title: '请先选择文件', icon: 'none' });
      return;
    }
    
    const folderNames = folders.map(f => f.name);
    const options = [...folderNames, '新建分类'];
    
    wx.showActionSheet({
      itemList: options,
      success: async (res) => {
        const selectedOption = options[res.tapIndex];
        
        // 如果选择了"新建分类"
        if (selectedOption === '新建分类') {
          this.createNewCategoryForBatch();
          return;
        }
        
        wx.showModal({
          title: '批量更改分类',
          content: `确认将选中的 ${selectedFiles.length} 个文件分类更改为「${selectedOption}」吗？`,
          success: async (modalRes) => {
            if (!modalRes.confirm) return;
            
            wx.showLoading({ title: '更新分类中...' });
            try {
              // 批量更新数据库中的文件分类
              await Promise.all(
                selectedFiles.map(fileId => 
                  updateResource(fileId, { subject: selectedOption })
                )
              );
              
              // 更新本地数据
              const updatedFiles = files.map((f) =>
                selectedFiles.includes(f.id) ? { ...f, subject: selectedOption } : f
              );
              const updatedFilteredFiles = this.data.filteredFiles.map((f) =>
                selectedFiles.includes(f.id) ? { ...f, subject: selectedOption } : f
              );
              
              this.setData(
                { 
                  files: updatedFiles, 
                  filteredFiles: updatedFilteredFiles 
                }, () => {
                  // 重新加载资源以更新文件夹计数
                  this.loadResources();
                  this.exitSelectionMode();
                  wx.hideLoading();
                  wx.showToast({ title: '批量更新成功', icon: 'success' });
                }
              );
            } catch (err) {
              console.error('批量更新文件分类失败:', err);
              wx.hideLoading();
              wx.showToast({ title: '批量更新失败', icon: 'none' });
            }
          }
        });
      }
    });
  },
  
  // 批量创建新文件夹
  batchCreateFolder() {
    wx.showModal({
      title: '新建文件夹',
      editable: true,
      placeholderText: '输入文件夹名称',
      success: async (res) => {
        if (!res.confirm) return;
        const folderName = (res.content || '').trim();
        if (!folderName) {
          wx.showToast({ title: '文件夹名称不能为空', icon: 'none' });
          return;
        }
        
        // 检查文件夹是否已存在
        const { folders } = this.data;
        if (folders.some(f => f.name === folderName)) {
          wx.showToast({ title: '文件夹已存在', icon: 'none' });
          return;
        }
        
        // 如果没有选中文件，只创建空文件夹
        if (this.data.selectedFiles.length === 0) {
          wx.showToast({ title: '文件夹创建成功', icon: 'success' });
          // 刷新文件夹列表
          this.loadResources();
          return;
        }
        
        // 如果有选中文件，询问是否移动到新文件夹
        wx.showModal({
          title: '移动文件',
          content: `是否将选中的 ${this.data.selectedFiles.length} 个文件移动到新创建的「${folderName}」文件夹？`,
          success: async (modalRes) => {
            if (!modalRes.confirm) {
              // 只创建文件夹，不移动文件
              wx.showToast({ title: '文件夹创建成功', icon: 'success' });
              this.loadResources();
              return;
            }
            
            // 移动文件到新文件夹
            await this.moveFilesToNewFolder(folderName);
          }
        });
      }
    });
  },

  // 移动文件到新文件夹
  async moveFilesToNewFolder(folderName) {
    wx.showLoading({ title: '移动文件中...' });
    try {
      const { selectedFiles } = this.data;
      const updatePromises = selectedFiles.map(file => 
        updateResource(file.id, { subject: folderName })
      );
      
      await Promise.all(updatePromises);
      
      // 退出选择模式并刷新数据
      this.exitSelectionMode();
      this.loadResources();
      
      wx.hideLoading();
      wx.showToast({ 
        title: `成功移动 ${selectedFiles.length} 个文件`, 
        icon: 'success' 
      });
    } catch (err) {
      console.error('move files to new folder failed', err);
      wx.hideLoading();
      wx.showToast({ 
        title: '移动失败，请重试', 
        icon: 'none' 
      });
    }
  },

  // 为批量操作创建新分类
  createNewCategoryForBatch() {
    wx.showModal({
      title: '新建分类',
      editable: true,
      placeholderText: '输入新分类名称',
      success: async (res) => {
        if (!res.confirm) return;
        const newCategory = (res.content || '').trim();
        if (!newCategory) {
          wx.showToast({ title: '分类名称不能为空', icon: 'none' });
          return;
        }
        
        wx.showModal({
          title: '批量更改分类',
          content: `确认将选中的 ${this.data.selectedFiles.length} 个文件分类更改为「${newCategory}」吗？`,
          success: async (modalRes) => {
            if (!modalRes.confirm) return;
            
            wx.showLoading({ title: '创建分类中...' });
            try {
              // 批量更新数据库中的文件分类
              await Promise.all(
                this.data.selectedFiles.map(fileId => 
                  updateResource(fileId, { subject: newCategory })
                )
              );
              
              // 更新本地数据
              const updatedFiles = this.data.files.map((f) =>
                this.data.selectedFiles.includes(f.id) ? { ...f, subject: newCategory } : f
              );
              const updatedFilteredFiles = this.data.filteredFiles.map((f) =>
                this.data.selectedFiles.includes(f.id) ? { ...f, subject: newCategory } : f
              );
              
              this.setData(
                { 
                  files: updatedFiles, 
                  filteredFiles: updatedFilteredFiles 
                }, () => {
                  // 重新加载资源以更新文件夹计数和添加新文件夹
                  this.loadResources();
                  this.exitSelectionMode();
                  wx.hideLoading();
                  wx.showToast({ title: '新分类创建成功', icon: 'success' });
                }
              );
            } catch (err) {
              console.error('创建新分类失败:', err);
              wx.hideLoading();
              wx.showToast({ title: '创建失败', icon: 'none' });
            }
          }
        });
      }
    });
  },

  decorateFilesWithSelection(files = [], selectedList = []) {
    const normalized = (selectedList || []).map((id) => String(id));
    const selectedSet = new Set(normalized);
    return files.map((file) => ({
      ...file,
      isSelected: selectedSet.has(String(file.id))
    }));
  },

  applySelectionState(nextSelected = []) {
    const normalized = (nextSelected || []).map((id) => String(id));
    const currentFiles = Array.isArray(this.data.files) ? this.data.files : [];
    const files = this.decorateFilesWithSelection(currentFiles, normalized);
    this.setData(
      {
        selectedFiles: normalized,
        files
      },
      () => this.updateFilteredFiles()
    );
  },

  persistLastOpenedFile(file) {
    if (!file) return;
    const entry = {
      id: file.id,
      name: file.name,
      subject: file.subject,
      url: file.url,
      type: file.type,
      updatedAt: Date.now()
    };
    try {
      wx.setStorageSync(CONTINUUM_STORAGE_KEY, entry);
    } catch (err) {
      console.warn('persist last opened failed', err);
    }
    this.setData({
      lastOpenedFile: entry
    });
  },

  hydrateLastOpenedFile() {
    try {
      const cached = wx.getStorageSync(CONTINUUM_STORAGE_KEY);
      if (!cached || !cached.updatedAt) {
        this.setData({ lastOpenedFile: null });
        return;
      }
      this.setData({ lastOpenedFile: cached });
    } catch (err) {
      console.warn('hydrate last opened failed', err);
    }
  },

  buildActionableInsight(files = []) {
    if (!files.length) {
      return {
        type: 'upload',
        headline: '创建你的第一份资料库',
        description: '2 分钟内即可完成一次上传',
        cta: '立即上传'
      };
    }

    const unsummarized = files.filter((file) => !file.aiSummary);
    if (unsummarized.length) {
      const target = unsummarized[0];
      return {
        type: 'aiSummary',
        fileId: target.id,
        headline: `${unsummarized.length} 个文件等待划重点`,
        description: `从「${target.name}」开始，帮你提炼重点`,
        cta: 'AI 划重点'
      };
    }

    const uncategorized = files.filter((file) => (file.subject || '未分类') === '未分类');
    if (uncategorized.length) {
      return {
        type: 'organize',
        targetFolder: '未分类',
        headline: `${uncategorized.length} 个文件待整理`,
        description: '集中清空「未分类」分组',
        cta: '去整理'
      };
    }

    return {
      type: 'celebrate',
      headline: '所有文件都井井有条',
      description: '随时添加新的灵感或上传资料',
      cta: '继续保持'
    };
  },

  refreshActionableInsight(nextFiles) {
    const files = Array.isArray(nextFiles) ? nextFiles : this.data.files;
    const normalizedFiles = Array.isArray(files) ? files : [];
    const insight = this.buildActionableInsight(normalizedFiles);
    this.setData({ actionableInsight: insight });
  },

  openLastFile() {
    const entry = this.data.lastOpenedFile;
    if (!entry || !entry.url) {
      wx.showToast({ title: '先打开任意文件', icon: 'none' });
      return;
    }
    this.openFileInBrowser(entry.url, entry.name);
  },

  enterAiMode() {
    // 导航到文件选择页面，让用户选择要分析的文件
    wx.navigateTo({
      url: '/pages/file-selector/index',
      success: (res) => {
        console.log('成功跳转到文件选择页面');
      },
      fail: (err) => {
        console.error('跳转到文件选择页面失败:', err);
        wx.showToast({
          title: '页面跳转失败',
          icon: 'none'
        });
      }
    });
  },

  

  async startAiScanPipeline(tempFilePath) {
    this.clearAiPolling();
    this.setData({
      isScanning: true,
      aiScanError: null,
      aiScanPreview: null
    });

    wx.showLoading({ title: '上传母体...', mask: true });

    try {
      const fileName = `scan_${Date.now()}.jpg`;
      const { publicUrl } = await uploadToStorage('resources', tempFilePath, fileName);
      if (!publicUrl) {
        throw new Error('图片上传失败');
      }

      wx.showLoading({ title: '神经网络解析中...' });
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId || 'user_123';

      const cozeRes = await wx.cloud.callFunction({
        name: 'analyzeImage',
        data: {
          action: 'start',
          imageUrl: publicUrl,
          userId
        }
      });

      console.log('云函数响应:', cozeRes);
      this.handleAiFunctionResponse(cozeRes?.result);
    } catch (error) {
      console.error('AI 流程失败', error);
      this.setData({ aiScanError: error.message || '解析失败' });
      wx.showToast({ title: '解析中断', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ isScanning: false });
    }
  },

  handleAiFunctionResponse(result) {
    if (!result) {
      this.setData({ aiScanError: '云函数没有返回结果' });
      return;
    }

    if (result.success && !result.pending) {
      this.consumeAiScanResult(result.data);
      return;
    }

    if (result.pending) {
      const job = {
        chatId: result.chatId,
        conversationId: result.conversationId
      };
      this.setData({
        aiScanJob: job,
        aiScanError: null,
        aiPolling: true
      });
      this.startAiPolling(job, result.retryAfter || 600);
      wx.showToast({ title: 'AI 解析中...', icon: 'loading', duration: 800 });
      return;
    }

    this.setData({ aiScanError: result.error || '解析未返回数据' });
    wx.showToast({ title: '解析失败', icon: 'none' });
  },

  startAiPolling(job, delay = 600) {
    if (!job?.chatId || !job?.conversationId) return;
    this.cancelAiPollingTimer();
    this.aiPollAttempts = 0;
    const DEFAULT_CLIENT_POLL_INTERVAL = Math.max(500, delay);
    const maxAttempts = Math.max(15, Math.ceil(20000 / DEFAULT_CLIENT_POLL_INTERVAL));

    const pollOnce = async () => {
      if (this.aiPollAttempts >= maxAttempts) {
        this.setData({
          aiPolling: false,
          aiScanError: 'AI 解析超时，请稍后重试'
        });
        wx.showToast({ title: 'AI 解析超时', icon: 'none' });
        return;
      }

      this.aiPollAttempts += 1;

      try {
        const pollRes = await wx.cloud.callFunction({
          name: 'analyzeImage',
          data: {
            action: 'poll',
            chatId: job.chatId,
            conversationId: job.conversationId
          }
        });

        const payload = pollRes?.result;
        console.log('AI 轮询', payload);

        if (payload?.success && !payload.pending) {
          this.consumeAiScanResult(payload.data);
          return;
        }

        if (!payload?.success && !payload?.pending) {
          this.setData({ aiScanError: payload?.error || 'AI 解析失败', aiPolling: false });
          wx.showToast({ title: 'AI 解析失败', icon: 'none' });
          return;
        }

        const nextIn = payload?.retryAfter || DEFAULT_CLIENT_POLL_INTERVAL;
        this.aiPollTimer = setTimeout(pollOnce, nextIn);
      } catch (error) {
        console.error('轮询失败', error);
        this.aiPollTimer = setTimeout(pollOnce, DEFAULT_CLIENT_POLL_INTERVAL);
      }
    };

    this.aiPollTimer = setTimeout(pollOnce, DEFAULT_CLIENT_POLL_INTERVAL);
  },

  clearAiPolling() {
    this.cancelAiPollingTimer();
    this.aiPollAttempts = 0;
    this.setData({ aiPolling: false, aiScanJob: null });
  },

  cancelAiPollingTimer() {
    if (this.aiPollTimer) {
      clearTimeout(this.aiPollTimer);
      this.aiPollTimer = null;
    }
  },

  consumeAiScanResult(rawData) {
    this.clearAiPolling();
    if (!rawData) {
      this.setData({ aiScanError: 'AI 没有返回内容' });
      return;
    }

    const normalized = this.normalizeAiScanResult(rawData);
    wx.vibrateShort({ type: 'medium' });
    this.setData({
      aiScanPreview: normalized,
      aiScanError: null
    });
    wx.showToast({ title: '解析成功', icon: 'success' });
  },

  normalizeAiScanResult(payload = {}) {
    const type = this.detectAiResultType(payload);
    const rows = this.extractAiResultItems(payload);
    const now = Date.now();

    const items = rows.map((row, index) => {
      const safeRow = row || {};
      return {
        id: safeRow.id || `${now}_${index}`,
        title:
          safeRow.title ||
          safeRow.name ||
          safeRow.course ||
          safeRow.task ||
          `条目 ${index + 1}`,
        subtitle: this.buildAiSubtitle(safeRow, type),
        raw: safeRow
      };
    });

    return {
      type,
      count: items.length,
      items,
      raw: payload,
      jsonText: JSON.stringify(payload, null, 2)
    };
  },

  detectAiResultType(payload = {}) {
    if (!payload) return 'unknown';
    const declared = typeof payload.type === 'string' ? payload.type.toLowerCase() : '';
    if (declared.includes('schedule') || declared.includes('course')) {
      return 'schedule';
    }
    if (declared.includes('todo') || declared.includes('task')) {
      return 'task';
    }
    if (Array.isArray(payload.schedule) || Array.isArray(payload.courses)) {
      return 'schedule';
    }
    if (Array.isArray(payload.todos) || Array.isArray(payload.tasks)) {
      return 'task';
    }
    return 'unknown';
  },

  extractAiResultItems(payload = {}) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    const buckets = ['data', 'items', 'schedule', 'todos', 'tasks', 'courses'];
    for (const key of buckets) {
      if (Array.isArray(payload[key])) {
        return payload[key];
      }
    }
    return [];
  },

  buildAiSubtitle(row = {}, type = 'unknown') {
    if (type === 'schedule') {
      const weekday = this.formatWeekdayLabel(row.day_of_week || row.weekday || row.day);
      const sections = this.formatSectionRange(row.start_section || row.startSection, row.length);
      const timeRange = row.time || row.time_range;
      const location = row.location || row.classroom;
      return [weekday, sections || timeRange, location].filter(Boolean).join(' · ');
    }

    if (type === 'task') {
      const course = row.course || row.subject;
      const deadline = this.normalizeDateDisplay(row.deadline || row.date || row.due_date);
      const category = row.type || row.category;
      return [course, category, deadline].filter(Boolean).join(' · ');
    }

    return row.description || row.summary || '';
  },

  formatWeekdayLabel(value) {
    if (!value && value !== 0) return '';
    if (typeof value === 'number') {
      const map = ['一', '二', '三', '四', '五', '六', '日'];
      const index = Math.max(1, Math.min(7, value)) - 1;
      return `周${map[index]}`;
    }
    const str = String(value);
    if (/周/.test(str)) return str;
    return `周${str}`;
  },

  formatSectionRange(start, length) {
    if (!start) return '';
    const safeStart = Number(start) || 1;
    const len = Number(length) || 1;
    const end = safeStart + len - 1;
    return len > 1 ? `第${safeStart}-${end}节` : `第${safeStart}节`;
  },

  normalizeDateDisplay(value) {
    if (!value) return '';
    if (typeof value === 'number') {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString().slice(0, 10);
      }
    }
    const str = String(value).trim();
    if (!str) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.slice(0, 10);
    }
    if (/^\d{1,2}月\d{1,2}日/.test(str)) {
      return str;
    }
    return str;
  },

  copyAiScanJson() {
    const jsonText = this.data.aiScanPreview?.jsonText;
    if (!jsonText) {
      wx.showToast({ title: '暂无可复制的数据', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: jsonText,
      success: () => wx.showToast({ title: 'JSON 已复制', icon: 'success' })
    });
  },

  async importAiScanResult() {
    const preview = this.data.aiScanPreview;
    if (!preview || !preview.items?.length) {
      wx.showToast({ title: '没有可导入的数据', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '写入中...' });

    try {
      let count = 0;
      if (preview.type === 'schedule') {
        count = await this.importAiSchedule(preview.items);
      } else {
        count = await this.importAiTasks(preview.items);
      }

      wx.hideLoading();
      wx.showToast({ title: `导入 ${count} 条成功`, icon: 'success' });
    } catch (error) {
      console.error('导入失败', error);
      wx.hideLoading();
      wx.showToast({ title: error.message || '导入失败', icon: 'none' });
    }
  },

  async importAiTasks(items = []) {
    const app = getApp();
    const userId = app?.globalData?.supabase?.userId;
    if (!userId) throw new Error('请先登录');

    const payloads = items
      .map((item) => {
        const raw = item.raw || {};
        return {
          user_id: userId,
          type: raw.type || raw.category || 'homework',
          title: item.title,
          deadline: this.normalizeDeadlineForDb(raw.deadline || raw.date || raw.due_date),
          description: raw.description || raw.details || null
        };
      })
      .filter((payload) => payload.title);

    if (!payloads.length) {
      throw new Error('解析结果中没有有效的待办');
    }

    await Promise.all(payloads.map((payload) => createTask(payload)));
    return payloads.length;
  },

  async importAiSchedule(items = []) {
    const app = getApp();
    const userId = app?.globalData?.supabase?.userId;
    if (!userId) throw new Error('请先登录');

    const courseMap = new Map();
    const payloads = [];

    for (const item of items) {
      const raw = item.raw || {};
      const courseName = raw.name || raw.course || item.title;
      const day = this.normalizeWeekdayNumber(raw.day_of_week || raw.weekday || raw.day);
      const startSection = Number(raw.start_section || raw.startSection);
      const length = Number(raw.length || raw.duration_sections) || 2;
      if (!courseName || !day || !startSection) continue;

      let course = courseMap.get(courseName);
      if (!course) {
        const colorIndex = courseMap.size % MORANDI_COLORS.length;
        const color = MORANDI_COLORS[colorIndex];
        const [createdCourse] = await createCourse({
          user_id: userId,
          name: courseName,
          color,
          location: raw.location || null,
          teacher: raw.teacher || null
        });
        course = createdCourse;
        courseMap.set(courseName, course);
      }

      payloads.push({
        user_id: userId,
        course_id: course.id,
        day_of_week: day,
        start_section: startSection,
        length,
        weeks: this.normalizeWeeks(raw.weeks),
        location: raw.location || null
      });
    }

    if (!payloads.length) {
      throw new Error('解析结果缺少课程时间');
    }

    await createCourseSchedules(payloads);
    return payloads.length;
  },

  normalizeDeadlineForDb(value) {
    if (!value) return null;
    if (typeof value === 'number') {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
    const str = String(value).trim();
    if (!str) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.slice(0, 10);
    }
    if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(str)) {
      const [year, month, day] = str.split('/');
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    if (/^\d{1,2}月\d{1,2}日/.test(str)) {
      const match = str.match(/(\d{1,2})月(\d{1,2})日/);
      if (match) {
        const year = new Date().getFullYear();
        const month = match[1].padStart(2, '0');
        const day = match[2].padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    }
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return null;
  },

  normalizeWeekdayNumber(value) {
    if (typeof value === 'number' && value >= 1 && value <= 7) {
      return value;
    }
    const str = String(value || '').trim();
    if (!str) return null;
    const map = {
      '周一': 1,
      '星期一': 1,
      一: 1,
      'monday': 1,
      '周二': 2,
      '星期二': 2,
      二: 2,
      'tuesday': 2,
      '周三': 3,
      '星期三': 3,
      三: 3,
      'wednesday': 3,
      '周四': 4,
      '星期四': 4,
      四: 4,
      'thursday': 4,
      '周五': 5,
      '星期五': 5,
      五: 5,
      'friday': 5,
      '周六': 6,
      '星期六': 6,
      六: 6,
      'saturday': 6,
      '周日': 7,
      '星期日': 7,
      日: 7,
      天: 7,
      'sunday': 7
    };
    return map[str.toLowerCase()] || map[str] || null;
  },

  normalizeWeeks(value) {
    if (Array.isArray(value) && value.length) {
      return value;
    }
    if (typeof value === 'string') {
      const weeks = value
        .split(/[,，]/)
        .map((item) => Number(item.trim()))
        .filter((num) => !Number.isNaN(num));
      if (weeks.length) return weeks;
    }
    return [1];
  }

  // 基础文件管理功能已简化，移除分享相关代码
});
