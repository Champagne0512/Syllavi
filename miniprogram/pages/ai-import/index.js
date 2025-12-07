const {
  uploadToStorage,
  parseImageWithAI,
  createTask,
  createCourse,
  createCourseSchedules
} = require('../../utils/supabase');
const { MORANDI_COLORS } = require('../../utils/colors');

Page({
  data: {
    image: '',
    scanning: false,
    progress: 0,
    result: null,
    mode: 'task', // task | course
    uploading: false
  },
  onLoad(options) {
    const mode = options?.mode;
    if (mode && (mode === 'task' || mode === 'course')) {
      this.setData({ mode });
    }
  },
  onUnload() {
    if (this.scanTicker) clearInterval(this.scanTicker);
  },
  handleBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.switchTab({ url: '/pages/tools/index' });
    }
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
    const app = getApp();
    const userId = app?.globalData?.supabase?.userId || wx.getStorageSync('user_id') || 'unknown_user';
    const token = app?.globalData?.supabase?.accessToken || wx.getStorageSync('access_token');
    
    if (!token) {
      throw new Error('未登录或认证令牌过期');
    }
    
    const { publicUrl } = await uploadToStorage(
      'temp',
      imagePath,
      `snapshot_${Date.now()}.jpg`,
      {
        userId: userId,
        token: token
      }
    );
    
    // 调用AI解析（仅提取数据，不自动入库）
    const aiResult = await parseImageWithAI(publicUrl, this.data.mode, {
      userId: userId,
      autoStore: false
    });
    
    // 返回可编辑的本地结果
    return aiResult.data || [];
  },
  normalizeDeadline(value) {
    const fallback = () => {
      const today = new Date();
      today.setHours(23, 59, 0, 0);
      return today.toISOString();
    };

    if (!value) return fallback();
    if (typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? fallback() : date.toISOString();
    }

    const parsed = this.parseDateTimeText(String(value));
    return parsed || fallback();
  },
  parseDateTimeText(raw) {
    const text = (raw || '').trim();
    if (!text) return null;

    const isoMatch = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2})(?::(\d{2}))?)?/);
    if (isoMatch) {
      const [, year, month, day, hour, minute] = isoMatch;
      const hh = hour ? hour.padStart(2, '0') : '23';
      const mm = minute ? minute : '59';
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hh}:${mm}:00`;
    }

    const zhMatch = text.match(/(\d{1,2})月(\d{1,2})日(?:\s*(上午|中午|下午|晚上|夜间|晚|早上)?\s*(\d{1,2})(?::(\d{2}))?)?/);
    if (zhMatch) {
      const nowYear = new Date().getFullYear();
      const month = zhMatch[1].padStart(2, '0');
      const day = zhMatch[2].padStart(2, '0');
      let hour = zhMatch[4] ? Number(zhMatch[4]) : 23;
      const minute = zhMatch[5] ? zhMatch[5] : '59';
      const period = zhMatch[3] || '';
      if (period.includes('下午') || period.includes('晚上') || period.includes('夜') || period.includes('晚')) {
        if (hour < 12) hour += 12;
      }
      return `${nowYear}-${month}-${day}T${String(hour).padStart(2, '0')}:${minute}:00`;
    }

    const mdMatch = text.match(/^(\d{1,2})[./-](\d{1,2})(?:\s*(\d{1,2})(?::(\d{2}))?)?/);
    if (mdMatch) {
      const nowYear = new Date().getFullYear();
      const month = mdMatch[1].padStart(2, '0');
      const day = mdMatch[2].padStart(2, '0');
      const hour = mdMatch[3] ? mdMatch[3].padStart(2, '0') : '23';
      const minute = mdMatch[4] ? mdMatch[4] : '59';
      return `${nowYear}-${month}-${day}T${hour}:${minute}:00`;
    }

    const timeOnly = text.match(/^(\d{1,2})(?::(\d{2}))$/);
    if (timeOnly) {
      const hour = timeOnly[1].padStart(2, '0');
      const minute = timeOnly[2];
      const today = new Date();
      return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}T${hour}:${minute}:00`;
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  },
  async confirmItem(e) {
    const { index } = e.currentTarget.dataset;
    const item = this.data.result?.[index];
    if (!item) return;
    const app = getApp();
    const userId = app?.globalData?.supabase?.userId || wx.getStorageSync('user_id');

    if (!userId) {
      wx.showToast({ title: '请先登录再导入', icon: 'none' });
      return;
    }

    if (item.kind === 'task') {
      try {
        wx.showLoading({ title: '导入中...' });
        const mappedType = item.type === 'exam' ? 'exam' : 'homework';
        const payload = {
          user_id: userId,
          type: mappedType,
          title: item.title,
          deadline: this.normalizeDeadline(item.deadline),
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
      return;
    }

    // 单条课程导入：创建课程 + 对应排课
    try {
      wx.showLoading({ title: '导入课程中...' });
      const color =
        MORANDI_COLORS[index % MORANDI_COLORS.length] || MORANDI_COLORS[0];
      const [course] = await createCourse({
        user_id: userId,
        name: item.name,
        color,
        location: item.location || null,
        teacher: item.teacher || null
      });

      const courseId = course && course.id;
      if (!courseId) {
        throw new Error('课程ID缺失，导入失败');
      }

      const schedulePayload = [{
        user_id: userId,
        course_id: courseId,
        day_of_week: item.day_of_week,
        start_section: item.start_section,
        length: item.length,
        weeks: item.weeks && item.weeks.length ? item.weeks : [1]
      }];
      await createCourseSchedules(schedulePayload);

      wx.hideLoading();
      wx.showToast({ title: '课程已写入课程表', icon: 'success' });
    } catch (err) {
      console.warn('import course failed', err);
      wx.hideLoading();
      wx.showToast({ title: '课程导入失败', icon: 'none' });
    }
  },
  editItem(e) {
    const { index } = e.currentTarget.dataset;
    const item = this.data.result?.[index];
    if (!item) return;

    if (item.kind === 'task') {
      wx.showActionSheet({
        itemList: ['修改标题', '切换类型 (作业/考试)'],
        success: (res) => {
          if (res.tapIndex === 0) {
            wx.showModal({
              title: '修改任务标题',
              editable: true,
              placeholderText: '输入新的标题',
              content: item.title,
              success: (modalRes) => {
                const title = (modalRes.content || '').trim();
                if (!modalRes.confirm || !title) return;
                const key = `result[${index}].title`;
                this.setData({ [key]: title });
              }
            });
          } else if (res.tapIndex === 1) {
            const nextType = item.type === 'exam' ? 'homework' : 'exam';
            const key = `result[${index}].type`;
            this.setData({ [key]: nextType });
          }
        }
      });
    } else {
      wx.showActionSheet({
        itemList: ['修改课程名', '修改教室'],
        success: (res) => {
          if (res.tapIndex === 0) {
            wx.showModal({
              title: '修改课程名',
              editable: true,
              placeholderText: '输入新的课程名',
              content: item.name,
              success: (modalRes) => {
                const name = (modalRes.content || '').trim();
                if (!modalRes.confirm || !name) return;
                const key = `result[${index}].name`;
                this.setData({ [key]: name });
              }
            });
          } else if (res.tapIndex === 1) {
            wx.showModal({
              title: '修改教室',
              editable: true,
              placeholderText: '输入新的教室',
              content: item.location,
              success: (modalRes) => {
                const location = (modalRes.content || '').trim();
                if (!modalRes.confirm || !location) return;
                const key = `result[${index}].location`;
                this.setData({ [key]: location });
              }
            });
          }
        }
      });
    }
  },
  async confirmAll() {
    const items = this.data.result || [];
    if (!items.length) return;
    const app = getApp();
    const userId = app?.globalData?.supabase?.userId;

    wx.showLoading({ title: '批量导入中...' });
    try {
      const taskPayloads = items
        .filter((it) => it.kind === 'task')
        .map((item) => ({
          user_id: userId,
          type: item.type || 'homework',
          title: item.title,
          deadline: item.deadline,
          description: null
        }));

      const courseItems = items.filter((it) => it.kind === 'course');

      // 并行导入任务
      if (taskPayloads.length) {
        await Promise.all(taskPayloads.map((p) => createTask(p)));
      }

      // 并行导入课程及排课
      for (let i = 0; i < courseItems.length; i += 1) {
        const item = courseItems[i];
        const color =
          MORANDI_COLORS[i % MORANDI_COLORS.length] || MORANDI_COLORS[0];
        const [course] = await createCourse({
          user_id: userId,
          name: item.name,
          color,
          location: item.location || null,
          teacher: item.teacher || null
        });
        await createCourseSchedules([
          {
            user_id: userId,
            course_id: course.id,
            day_of_week: item.day_of_week,
            start_section: item.start_section,
            length: item.length,
            weeks: item.weeks && item.weeks.length ? item.weeks : [1]
          }
        ]);
      }

      wx.hideLoading();
      wx.showToast({ title: '批量导入完成', icon: 'success' });
    } catch (err) {
      console.warn('bulk import failed', err);
      wx.hideLoading();
      wx.showToast({ title: '批量导入失败', icon: 'none' });
    }
  },
  
  
});
