const { MORANDI_COLORS } = require('../../utils/colors');
const {
  createResource,
  deleteFromStorage,
  deleteResource,
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
    // 简单映射，你可以根据需要扩展
    const map = {
      'pdf': 'pdf',
      'ppt': 'ppt', 'pptx': 'ppt',
      'doc': 'doc', 'docx': 'doc',
      'jpg': 'img', 'png': 'img', 'jpeg': 'img'
    };
    return map[type] || 'other';
  },
  onLoad() {
    this.hydrateLastOpenedFile();
    this.refreshActionableInsight([]);
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
        extension: ['pdf', 'ppt', 'pptx', 'doc', 'docx', 'jpg', 'png']
      });
      if (!tempFiles || !tempFiles.length) {
        this._uploading = false;
        return;
      }
      const file = tempFiles[0];
      
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
      this.setData({ files }, () => {
        this.updateFilteredFiles();
        this.refreshActionableInsight();
      });
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
    const { lastOpenedFile, files } = this.data;
    let target = null;
    if (lastOpenedFile) {
      target = files.find((file) => file.id === lastOpenedFile.id);
    }
    if (!target && files.length) {
      target = files[0];
    }

    if (!target) {
      wx.showToast({ title: '上传文件以体验 AI', icon: 'none' });
      return;
    }

    this.runSummary(target);
  },

  // 👁️ 点击"魔眼"按钮触发 - 扫描图片识别课程表/待办事项
  async handleScanImage() {
    const that = this;
    
    // 1. 选择图片
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        
        // 开启扫描动画
        that.setData({ isScanning: true });
        wx.showLoading({ title: '上传母体...', mask: true });

        try {
          // 2. 上传图片到 Supabase (Coze 需要公网链接)
          // 注意：文件名最好加个随机数防止重复
          const fileName = `scan_${Date.now()}.jpg`;
          const { publicUrl } = await uploadToStorage('temp_scans', tempFilePath, fileName);

          if (!publicUrl) throw new Error('图片上传失败');

          wx.showLoading({ title: '神经网络解析中...' });

          // 3. 呼叫云函数 (Call Coze)
          const cozeRes = await wx.cloud.callFunction({
            name: 'analyzeImage', // 刚才创建的云函数名
            data: {
              imageUrl: publicUrl,
              userId: 'user_123' // 这里可以换成真实的 openid
            }
          });

          // 关闭 Loading
          wx.hideLoading();
          that.setData({ isScanning: false });

          console.log('云函数结果:', cozeRes);

          // 4. 处理结果
          if (cozeRes.result && cozeRes.result.success) {
            const aiData = cozeRes.result.data;
            
            // 成功！弹出确认框
            that.showAiResultConfirm(aiData);
          } else {
            throw new Error(cozeRes.result?.error || '解析未返回数据');
          }

        } catch (err) {
          console.error('全链路失败:', err);
          wx.hideLoading();
          that.setData({ isScanning: false });
          wx.showToast({ title: '解析中断', icon: 'none' });
        }
      }
    })
  },

  // 弹窗确认逻辑
  showAiResultConfirm(data) {
    // 假设 AI 返回了 { type: 'schedule', data: [...] }
    const contentStr = JSON.stringify(data, null, 2); // 简单展示，以后可以做漂亮点
    
    wx.showModal({
      title: '✨ 解析成功',
      content: `识别到内容，是否导入？\n${contentStr.slice(0, 100)}...`, // 只显示前100字防止太长
      confirmText: '导入数据库',
      success: (res) => {
        if (res.confirm) {
          // TODO: 这里调用你之前的 createResource 或 createTodo 写入数据库
          console.log('用户确认导入:', data);
          wx.showToast({ title: '已同步', icon: 'success' });
        }
      }
    });
  }

  // 基础文件管理功能已简化，移除分享相关代码
});
