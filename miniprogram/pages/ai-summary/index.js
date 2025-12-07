// pages/ai-summary/index.js
const { 
  fetchResources,
  updateResource
} = require('../../utils/supabase');

Page({
  data: {
    // 文件信息
    fileName: '',
    fileType: '',
    fileSize: '',
    fileId: null,
    fileUrl: '',
    
    // 可选择的文件列表
    availableFiles: [],
    selectedFile: null,
    
    // 处理状态
    isProcessing: false,
    summary: '',
    isPartial: false,
    hasError: false,
    errorMessage: '',
    
    // 请求ID，用于中断处理
    requestId: null,
    
    // 是否请求完整分析
    requestFullAnalysis: false
  },

  onLoad(options) {
    // 如果有传入文件ID，则直接处理该文件
    if (options.id) {
      this.setData({
        fileId: options.id,
        directAnalysisMode: true  // 设置标志表示直接分析特定文件
      });
      this.loadFileInfo(options.id);
    } else {
      // 否则加载用户的所有文件供选择
      this.loadUserFiles();
    }
  },

  onShow() {
    // 页面显示时，检查是否有正在进行的分析任务
    // 这里可以从缓存中读取未完成的任务状态
    this.checkPendingTasks();
  },

  // 检查是否有待处理的任务
  checkPendingTasks() {
    try {
      const pendingTask = wx.getStorageSync('pendingAnalysisTask');
      if (pendingTask && pendingTask.fileId === this.data.fileId && pendingTask.status === 'processing') {
        this.setData({
          isProcessing: true,
          requestFullAnalysis: pendingTask.isFullAnalysis || false
        });
        // 继续轮询结果
        this.pollForAnalysisResult(pendingTask.taskId, pendingTask.isFullAnalysis || false);
      }
    } catch (error) {
      console.error('检查待处理任务失败:', error);
    }
  },

  // 处理云函数超时
  handleCloudFunctionTimeout(isFullAnalysis) {
    console.log('云函数超时，使用备用方案');

    // 显示友好的提示
    wx.showModal({
      title: 'AI分析处理中',
      content: 'AI分析需要一些时间，请耐心等待。您也可以中断处理并稍后重试。',
      showCancel: true,
      cancelText: '中断',
      confirmText: '继续等待',
      success: (res) => {
        if (res.cancel) {
          // 用户选择中断
          this.setData({
            isProcessing: false,
            hasError: false
          });
          wx.showToast({
            title: '已中断处理',
            icon: 'none'
          });
        } else {
          // 用户选择继续等待，增加超时时间
          wx.showToast({
            title: '继续等待分析结果...',
            icon: 'loading',
            duration: 10000
          });
        }
      }
    });
  },


  // 加载用户的所有文件
  async loadUserFiles() {
    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      const rows = await fetchResources(userId);
      
      if (!rows || !rows.length) {
        this.setData({
          hasError: true,
          errorMessage: '没有可分析的文件，请先上传文件'
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
        aiSummary: file.ai_summary || ''
      }));
      
      this.setData({
        availableFiles: files
      });
    } catch (error) {
      console.error('加载文件列表失败:', error);
      this.setData({
        hasError: true,
        errorMessage: '加载文件列表失败：' + error.message
      });
    }
  },

  // 加载单个文件信息
  async loadFileInfo(fileId) {
    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      const rows = await fetchResources(userId);
      
      if (!rows || !rows.length) {
        this.setData({
          hasError: true,
          errorMessage: '找不到指定文件'
        });
        return;
      }
      
      const file = rows.find(f => f.id === fileId);
      if (!file) {
        this.setData({
          hasError: true,
          errorMessage: '找不到指定文件'
        });
        return;
      }
      
      // 构造文件对象
      const fileObject = {
        id: file.id,
        name: file.file_name,
        type: file.file_type,
        uiType: this.getFileTypeClass(file.file_type),
        subject: file.subject || '未分类',
        url: file.file_url,
        size: file.file_size,
        aiSummary: file.ai_summary || ''
      };

      this.setData({
        fileName: file.file_name,
        fileType: file.file_type,
        fileSize: this.formatSize(file.file_size),
        fileId: file.id,
        fileUrl: file.file_url,
        selectedFile: fileObject  // 设置selectedFile以激活按钮
      });

      // 检查是否已经有摘要
      if (file.ai_summary) {
        this.setData({
          summary: file.ai_summary,
          isPartial: false,
          hasError: false
        });
      }
    } catch (error) {
      console.error('加载文件信息失败:', error);
      this.setData({
        hasError: true,
        errorMessage: '加载文件信息失败：' + error.message
      });
    }
  },

  // 文件类型映射
  getFileTypeClass(type) {
    const map = {
      'pdf': 'pdf',
      'ppt': 'ppt', 'pptx': 'ppt',
      'doc': 'doc', 'docx': 'doc',
      'jpg': 'img', 'png': 'img', 'jpeg': 'img'
    };
    return map[type] || 'other';
  },

  // 格式化文件大小
  formatSize(bytes) {
    if (!bytes) return '未知大小';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  },

  // 选择文件
  selectFile(e) {
    const fileId = e.currentTarget.dataset.id;
    const file = this.data.availableFiles.find(f => f.id === fileId);
    if (file) {
      this.setData({
        selectedFile: file,
        fileId: file.id,
        fileName: file.name,
        fileType: file.type,
        fileSize: this.formatSize(file.size),
        fileUrl: file.url
      });
    }
  },

  // 开始处理
  startProcessing() {
    if (!this.data.fileId || !this.data.fileUrl) {
      wx.showToast({
        title: '请先选择文件',
        icon: 'none'
      });
      return;
    }
    
    // 重置状态
    this.setData({
      isProcessing: true,
      summary: '',
      isPartial: false,
      hasError: false,
      errorMessage: ''
    });
    
    // 生成请求ID
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.setData({ requestId });
    
    this.callCloudFunction();
  },

  // 调用云函数 - 使用异步模式
  async callCloudFunction() {
    try {
      // 第一步：启动异步分析任务
      console.log('启动文档分析任务');

      // 增加超时时间到3秒，减少超时风险
      const startResult = await Promise.race([
        wx.cloud.callFunction({
          name: 'summarizeDocument',
          data: {
            action: 'startAnalysis',
            fileUrl: this.data.fileUrl,
            fileType: this.data.fileType,
            isFullAnalysis: false
          }
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('云函数响应超时')), 3000)
        )
      ]);

      console.log('分析任务启动结果:', startResult);

      if (startResult.result && startResult.result.success) {
        // 第二步：轮询检查结果
        this.pollForAnalysisResult(startResult.result.taskId, false);
      } else {
        throw new Error(startResult.result.error || '启动分析任务失败');
      }
    } catch (error) {
      console.error('启动分析任务失败:', error);
      
      // 如果是超时错误，尝试使用本地存储作为备用方案
      if (error.message && error.message.includes('超时')) {
        this.handleCloudFunctionTimeout(false);
      } else {
        this.setData({
          isProcessing: false,
          hasError: true,
          errorMessage: error.message || '启动分析失败，请重试'
        });
      }
    }
  },

  // 保存摘要到数据库
  async saveSummaryToDatabase(summary) {
    try {
      await updateResource(this.data.fileId, {
        ai_summary: summary
      });
    } catch (error) {
      console.error('保存摘要失败:', error);
      // 不影响用户体验，只记录日志
    }
  },

  // 中断处理
  interruptProcessing() {
    wx.showModal({
      title: '确认中断',
      content: '确认要中断AI分析？',
      success: (res) => {
        if (res.confirm) {
          // 中断处理并重置状态
          this.setData({
            isProcessing: false,
            hasError: false
          });

          wx.showToast({
            title: '已中断处理',
            icon: 'none'
          });
        }
      }
    });
  },

  // 请求完整摘要
  async requestFullSummary() {
    if (!this.data.isPartial) {
      wx.showToast({
        title: '已经是完整版',
        icon: 'none'
      });
      return;
    }
    
    wx.showModal({
      title: '完整分析',
      content: '完整分析可能需要更长时间，是否继续？',
      success: (res) => {
        if (res.confirm) {
          // 设置完整分析标志并重新处理
          this.setData({
            isProcessing: true,
            summary: '',
            isPartial: false,
            hasError: false,
            errorMessage: '',
            requestFullAnalysis: true
          });
          
          // 调用专门处理完整分析的方法
          this.callFullAnalysisFunction();
        }
      }
    });
  },

  // 轮询检查分析结果
  async pollForAnalysisResult(taskId, isFullAnalysis) {
    try {
      // 增加云函数任务超时时间到3秒
      const result = await Promise.race([
        wx.cloud.callFunction({
          name: 'summarizeDocument',
          data: {
            action: 'checkResult',
            taskId: taskId
          }
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('云函数检查超时')), 3000)
        )
      ]);

      console.log('检查分析结果:', result);

      if (result.result && result.result.success) {
        const { status, summary, isPartial, error } = result.result;

        if (status === 'completed') {
          // 分析完成
          this.setData({
            summary: summary,
            isPartial: isPartial || false,
            isProcessing: false,
            requestFullAnalysis: false
          });

          // 保存摘要到数据库
          await this.saveSummaryToDatabase(summary);

          wx.showToast({
            title: isFullAnalysis ? '完整分析完成' : '分析完成',
            icon: 'success'
          });
        } else if (status === 'failed') {
          // 分析失败
          this.setData({
            isProcessing: false,
            hasError: true,
            errorMessage: error || '分析失败，请重试'
          });
        } else if (status === 'processing') {
          // 仍在处理中，继续轮询
          setTimeout(() => {
            this.pollForAnalysisResult(taskId, isFullAnalysis);
          }, 4000); // 每4秒检查一次，减少服务器压力
        }
      } else {
        throw new Error(result.result.error || '检查结果失败');
      }
    } catch (error) {
      console.error('检查分析结果失败:', error);

      this.setData({
        isProcessing: false,
        hasError: true,
        errorMessage: '检查结果超时，请稍后重试'
      });
    }
  },

  // 调用完整分析云函数
  async callFullAnalysisFunction() {
    try {
      // 显示更友好的加载提示
      wx.showLoading({
        title: '启动完整分析...',
        mask: true
      });

      // 第一步：启动完整分析任务，增加超时时间
      const startResult = await Promise.race([
        wx.cloud.callFunction({
          name: 'summarizeDocument',
          data: {
            action: 'startAnalysis',
            fileUrl: this.data.fileUrl,
            fileType: this.data.fileType,
            isFullAnalysis: true,
            existingSummary: this.data.summary
          }
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('云函数响应超时')), 3000)
        )
      ]);

      wx.hideLoading();
      console.log('完整分析任务启动结果:', startResult);

      if (startResult.result && startResult.result.success) {
        // 第二步：轮询检查结果
        this.pollForAnalysisResult(startResult.result.taskId, true);
      } else {
        throw new Error(startResult.result.error || '启动完整分析任务失败');
      }
    } catch (error) {
      console.error('完整分析失败:', error);
      wx.hideLoading();

      // 如果是超时错误，使用本地备用方案
      if (error.message && error.message.includes('超时')) {
        this.handleCloudFunctionTimeout(true);
      } else {
        wx.showModal({
          title: '分析失败',
          content: error.message || '处理失败，请重试',
          showCancel: false,
          confirmText: '知道了'
        });

        this.setData({
          isProcessing: false,
          hasError: true,
          errorMessage: error.message || '处理失败，请重试'
        });
      }
    }
  },

  // 复制摘要
  copySummary() {
    if (!this.data.summary) {
      wx.showToast({
        title: '没有可复制的内容',
        icon: 'none'
      });
      return;
    }
    
    wx.setClipboardData({
      data: this.data.summary,
      success: () => {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        });
      }
    });
  },

  // 重试处理
  retryProcessing() {
    this.setData({
      hasError: false,
      errorMessage: ''
    });
    this.startProcessing();
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  }
});