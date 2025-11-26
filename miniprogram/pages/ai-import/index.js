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
    const app = getApp();
    const userId = app?.globalData?.supabase?.userId;

    if (item.kind === 'task') {
      try {
        wx.showLoading({ title: '导入中...' });
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

      const schedulePayload = [
        {
          user_id: userId,
          course_id: course.id,
          day_of_week: item.day_of_week,
          start_section: item.start_section,
          length: item.length,
          weeks: item.weeks && item.weeks.length ? item.weeks : [1]
        }
      ];
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
  }
});
