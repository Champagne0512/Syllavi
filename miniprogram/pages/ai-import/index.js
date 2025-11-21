import { uploadToStorage, parseImageWithAI, createTask } from '../../utils/supabase';

Page({
  data: {
    image: '',
    scanning: false,
    progress: 0,
    result: null,
    mode: 'task', // task | course
    uploading: false
  },
  onUnload() {
    if (this.scanTicker) clearInterval(this.scanTicker);
  },
  switchMode(e) {
    const { mode } = e.currentTarget.dataset;
    if (mode === this.data.mode) return;
    this.setData({ mode, result: null });
  },
  chooseImage() {
    if (this.data.uploading) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        const image = res.tempFiles[0].tempFilePath;
        this.setData({ image });
        this.startScanning(image);
      }
    });
  },
  startScanning(imagePath) {
    wx.vibrateShort({ type: 'light' });
    this.setData({ scanning: true, progress: 0, result: null, uploading: true });
    let tick = 0;
    this.scanTicker = setInterval(() => {
      tick += 1;
      const value = Math.min(90, this.data.progress + 8);
      this.setData({ progress: value });
    }, 300);
    this.runAIFlow(imagePath)
      .then((items) => {
        clearInterval(this.scanTicker);
        this.scanTicker = null;
        this.setData({
          scanning: false,
          uploading: false,
          progress: 100,
          result: items
        });
        wx.vibrateShort({ type: 'medium' });
      })
      .catch((err) => {
        console.warn('AI import failed', err);
        clearInterval(this.scanTicker);
        this.scanTicker = null;
        this.setData({
          scanning: false,
          uploading: false,
          progress: 0
        });
        wx.showToast({ title: '识别失败，请重试', icon: 'none' });
      });
  },
  async runAIFlow(imagePath) {
    const { publicUrl } = await uploadToStorage(
      'temp',
      imagePath,
      `snapshot_${Date.now()}.jpg`
    );
    const data = await parseImageWithAI(publicUrl, this.data.mode);

    if (data.type === 'task') {
      return (data.data || []).map((item) => ({
        kind: 'task',
        type: item.type,
        title: item.title,
        deadline: item.deadline,
        course: item.course
      }));
    }

    // 简化课程导入展示，仅展示结果，不直接写表
    return (data.data || []).map((item) => ({
      kind: 'course',
      name: item.name,
      day_of_week: item.day_of_week,
      start_section: item.start_section,
      length: item.length,
      location: item.location,
      teacher: item.teacher,
      weeks: item.weeks
    }));
  },
  async confirmItem(e) {
    const { index } = e.currentTarget.dataset;
    const item = this.data.result?.[index];
    if (!item) return;
    if (item.kind === 'task') {
      try {
        wx.showLoading({ title: '导入中...' });
        const app = getApp();
        const userId = app?.globalData?.supabase?.userId;
        const payload = {
          user_id: userId,
          type: item.type || 'homework',
          title: item.title,
          deadline: item.deadline,
          description: null
        };
        await createTask(payload);
        wx.hideLoading();
        wx.showToast({ title: '已写入待办', icon: 'success' });
      } catch (err) {
        console.warn('import task failed', err);
        wx.hideLoading();
        wx.showToast({ title: '导入失败', icon: 'none' });
      }
    } else {
      wx.showToast({
        title: '课程导入请后续接入课程表写入',
        icon: 'none'
      });
    }
  }
});
