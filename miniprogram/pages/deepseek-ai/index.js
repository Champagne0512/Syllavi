const app = getApp();

Page({
  data: {
    image: '',
    scanning: false,
    result: null,
    mode: 'auto', // auto | course | task
    uploading: false,
    progress: 0,
    error: null,
    debugInfo: null,
    dbSummary: null
  },
  
  onLoad(options) {
    const mode = options?.mode;
    if (mode && (mode === 'course' || mode === 'task' || mode === 'auto')) {
      this.setData({ mode });
    }
    
    // 设置页面标题
    this.setPageTitle();
  },
  
  onUnload() {
    if (this.scanTicker) clearInterval(this.scanTicker);
  },
  
  setPageTitle() {
    const titles = {
      'auto': 'AI智能识别',
      'course': '课程表识别',
      'task': '待办识别'
    };
    const title = titles[this.data.mode] || 'AI智能识别';
    wx.setNavigationBarTitle({ title });
  },
  
  switchMode(e) {
    const { mode } = e.currentTarget.dataset;
    if (mode === this.data.mode) return;
    
    this.setData({ 
      mode, 
      result: null, 
      image: '', 
      error: null 
    });
    this.setPageTitle();
  },
  
  chooseImage() {
    if (this.data.uploading) return;
    
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const image = res.tempFiles[0].tempFilePath;
        this.setData({ image, error: null });
        this.startDeepSeekAnalysis(image);
      },
      fail: (err) => {
        console.error('选择图片失败:', err);
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        });
      }
    });
  },
  
  startDeepSeekAnalysis(imagePath) {
    wx.vibrateShort({ type: 'light' });
    
    this.setData({ 
      scanning: true, 
      progress: 0, 
      result: null, 
      uploading: true,
      error: null 
    });
    
    // 模拟进度条
    let tick = 0;
    this.scanTicker = setInterval(() => {
      tick += 1;
      const progress = Math.min(90, tick * 5);
      this.setData({ progress });
      if (tick >= 20) {
        clearInterval(this.scanTicker);
      }
    }, 200);
    
    // 开始AI分析
    this.analyzeWithDeepSeek(imagePath);
  },
  
  async analyzeWithDeepSeek(imagePath) {
    try {
      // 1. 上传图片到云存储
      const uploadResult = await this.uploadImage(imagePath);
      if (!uploadResult.success) {
        throw new Error(uploadResult.error || '图片上传失败');
      }
      
      const imageUrl = uploadResult.data.url;
      const userId = app.globalData.supabase?.userId || app.globalData.userInfo?.id || wx.getStorageSync('user_id') || 'unknown_user';
      
      // 2. 调用云函数并等待识别完成
      const aiResult = await this.callDeepSeekAI(imageUrl, userId);
      if (!aiResult.success) {
        throw new Error(aiResult.error || 'AI识别失败');
      }
      
      // 3. 直接处理结果（云端已同步完成）
      this.handleRecognitionResult(aiResult);
      
    } catch (error) {
      console.error('DeepSeek AI分析失败:', error);
      this.setData({ 
        scanning: false, 
        uploading: false, 
        error: error.message 
      });
      
      wx.showToast({
        title: '识别失败，请重试',
        icon: 'none'
      });
    }
  },
  
  async uploadImage(imagePath) {
    try {
      // 使用 Supabase 存储而不是微信云存储
      const { uploadToStorage } = require('../../utils/supabase');
      
      const userId = app.globalData.supabase?.userId || wx.getStorageSync('user_id') || 'unknown_user';
      const token = app.globalData.supabase?.accessToken || wx.getStorageSync('access_token');
      
      if (!token) {
        throw new Error('未登录或认证令牌过期');
      }
      
      const fileName = `ai-image-${Date.now()}.jpg`;
      const result = await uploadToStorage('temp', imagePath, fileName, {
        userId: userId,
        token: token
      });
      
      return {
        success: true,
        data: { url: result.publicUrl }
      };
    } catch (error) {
      console.error('图片上传失败:', error);
      
      // 如果上传失败，尝试使用匿名上传
      if (error.message && error.message.includes('Unauthorized')) {
        try {
          const { SUPABASE_ANON_KEY } = require('../../utils/supabase');
          const { uploadToStorage } = require('../../utils/supabase');
          
          const fileName = `ai-image-${Date.now()}.jpg`;
          const result = await uploadToStorage('temp', imagePath, fileName, {
            userId: 'public',
            token: SUPABASE_ANON_KEY
          });
          
          return {
            success: true,
            data: { url: result.publicUrl }
          };
        } catch (anonError) {
          console.error('匿名上传也失败了:', anonError);
        }
      }
      
      return {
        success: false,
        error: error.message || '图片上传失败'
      };
    }
  },
  
  callDeepSeekAI(imageUrl, userId) {
    return new Promise((resolve) => {
      wx.cloud.callFunction({
        name: 'deepseekAI',
        data: {
          imageUrl: imageUrl,
          userId: userId,
          mode: this.data.mode,
          autoStore: true
        },
        success: (res) => {
          resolve(res.result);
        },
        fail: (err) => {
          console.error('[DeepSeek] 云函数调用失败:', err);
          resolve({
            success: false,
            error: 'AI服务调用失败'
          });
        }
      });
    });
  },
  
  async handleRecognitionResult(result) {
    const recognition = result.data || result;
    const meta = result.meta || {};
    
    if (this.scanTicker) {
      clearInterval(this.scanTicker);
      this.scanTicker = null;
    }
    
    this.setData({ 
      scanning: false, 
      uploading: false, 
      progress: 100,
      result: recognition,
      debugInfo: {
        rawData: JSON.stringify(result, null, 2)
      },
      dbSummary: meta.storageSummary || null
    });
    
    if (!recognition || recognition.type === 'unknown') {
      wx.showToast({
        title: '无法识别图片内容',
        icon: 'none'
      });
      return;
    }

    if (meta.stored && meta.storageSummary) {
      const { insertedCourses, insertedSchedules, insertedTasks } = meta.storageSummary;
      const detail = insertedTasks
        ? `写入${insertedTasks}条待办`
        : `写入${insertedSchedules || 0}条课程`;
      wx.showToast({ title: detail, icon: 'success', duration: 2500 });
    } else {
      wx.showToast({ title: '识别完成', icon: 'success' });
    }
  },
  
  previewResult() {
    const { result, storage } = this.data;
    if (!result) return;
    
    let content = '';
    if (result.type === 'schedule') {
      content = `识别到课程表：\n`;
      result.data.forEach((course, index) => {
        content += `${index + 1}. ${course.name} - 周${course.day} 第${course.start}节\n`;
      });
    } else if (result.type === 'todo') {
      content = `识别到待办事项：\n`;
      result.data.forEach((task, index) => {
        content += `${index + 1}. ${task.title}`;
        if (task.deadline) content += ` - ${task.deadline}`;
        content += '\n';
      });
    } else {
      content = '无法识别图片内容';
    }
    
    wx.showModal({
      title: '识别结果',
      content: content,
      showCancel: false
    });
  },
  
  goToRelatedPage() {
    const { result } = this.data;
    if (!result) return;
    
    if (result.type === 'schedule') {
      // 跳转到课程表页面
      wx.switchTab({
        url: '/pages/hub/index'
      });
    } else if (result.type === 'todo') {
      // 跳转到任务页面
      wx.switchTab({
        url: '/pages/tasks/index'
      });
    }
  },
  
  retry() {
    this.setData({ 
      image: '', 
      result: null, 
      error: null,
      dbSummary: null,
      debugInfo: null
    });
  }
  
});
