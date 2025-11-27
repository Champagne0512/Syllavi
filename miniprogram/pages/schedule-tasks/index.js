// pages/schedule-tasks/index.js
import { MORANDI_COLORS } from '../../utils/colors';

const supabaseApi = require('../../utils/supabase');
const {
  DEMO_USER_ID,
  fetchWeekSchedule,
  fetchTasks,
  createTask,
  updateTask,
  deleteTask,
  updateTaskCompletion,
  fetchCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  createCourseSchedules
} = supabaseApi;

function formatTime(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) {
    return '--:--';
  }
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekDays(currentDate) {
  let curr = new Date(currentDate);
  if (Number.isNaN(curr.getTime())) {
    curr = new Date();
  }
  // 调整到周一
  const day = curr.getDay() || 7;
  curr.setDate(curr.getDate() - (day - 1));
  curr.setHours(0, 0, 0, 0);

  const todayKey = formatDateKey(new Date());
  const days = [];
  const weekNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(curr);
    d.setDate(curr.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const dateKey = formatDateKey(d);
    days.push({
      name: weekNames[i],
      date: d.getDate(),
      fullDate: dateKey,
      dateKey,
      isToday: dateKey === todayKey,
      dayIdx: i + 1 // 1-7
    });
  }
  return days;
}

Page({
  data: {
    viewMode: 'day', // 'day', 'week', 'month'
    currentDate: new Date().toISOString(),
    currentDateText: '',
    
    // 数据展示
    tasks: [],
    todayCourses: [],
    todayTasks: [],
    weekDays: [], // 周视图头部
    timeSlots: [], // 周视图网格
    weekTasksByDay: [], 
    monthStats: { totalTasks: 0, completedTasks: 0, exams: 0, busiestDay: '-' },
    monthHeatmap: [],
    upcomingTasks: [],
    scheduleCourses: [],

    loadingTasks: true,
    editorVisible: false,
    editingTask: null,
    saving: false,
    form: { type: 'homework', title: '', date: '', time: '', description: '', related_course_id: null },
    
    // 课程编辑器
    courseEditorVisible: false,
    editingCourse: null,
    savingCourse: false,
    courses: [],
    courseForm: {
      name: '',
      teacher: '',
      location: '',
      color: '#87A8A4',
      credits: 2.0
    }
  },

  onLoad() {
    this.initDate();
    this.loadSchedule();
    this.loadTasks();
  },

  onShow() {
    if (!this.data.loadingTasks) {
      this.loadTasks();
    }
  },

  initDate() {
    const now = new Date();
    this.setData({
      currentDate: now.toISOString(),
    }, () => this.updateViewData());
  },

  // --- 视图切换与导航 ---

  switchView(e) {
    const { mode } = e.currentTarget.dataset;
    if (mode === this.data.viewMode) return;
    wx.vibrateShort({ type: 'light' });
    this.setData({ viewMode: mode }, () => this.updateViewData());
  },

  changeDate(e) {
    const { direction } = e.currentTarget.dataset; // -1 or 1
    const mode = this.data.viewMode;
    const date = new Date(this.data.currentDate);

    if (mode === 'day') {
      date.setDate(date.getDate() + parseInt(direction));
    } else if (mode === 'week') {
      date.setDate(date.getDate() + parseInt(direction) * 7);
    } else if (mode === 'month') {
      date.setMonth(date.getMonth() + parseInt(direction));
    }

    this.setData({ currentDate: date.toISOString() }, () => this.updateViewData());
  },

  updateViewData() {
    const date = new Date(this.data.currentDate);
    
    // 1. 更新顶部日期文字
    let dateText = '';
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (this.data.viewMode === 'day') {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      dateText = `${monthNames[date.getMonth()]} ${date.getDate()} · ${days[date.getDay()]}`;
      this.calculateDayView(date);
    } else if (this.data.viewMode === 'week') {
      dateText = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
      this.calculateWeekView(date);
    } else {
      dateText = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
      this.calculateMonthView(date);
    }

    this.setData({ currentDateText: dateText });
  },

  // --- 数据计算逻辑 ---

  calculateDayView(date) {
    const dateKey = formatDateKey(date);
    const dayOfWeek = date.getDay() || 7; // 1-7

    // 筛选今日课程
    const courses = (this.data.scheduleCourses || [])
      .filter((c) => c.day === dayOfWeek)
      .map((c) => ({
        ...c,
        time: this.formatCourseTime(c.start, c.len)
      }))
      .sort((a, b) => a.start - b.start);

    // 筛选今日任务 (截止日期是今天)
    const tasks = this.data.tasks.filter(t => t.deadlineKey === dateKey);

    this.setData({
      todayCourses: courses,
      todayTasks: tasks
    });
  },

  calculateWeekView(date) {
    const weekDays = getWeekDays(date);
    
    // 聚合一周的任务
    const weekTasksByDay = weekDays.map(day => {
      const dayTasks = this.data.tasks.filter(t => t.deadlineKey === day.dateKey);
      return {
        dateKey: day.dateKey,
        date: day.date,
        label: day.name,
        isToday: day.isToday,
        tasks: dayTasks.map(t => ({
          id: t.id,
          title: t.title,
          time: formatTime(t.rawDeadline),
          type: t.type,
          course: t.course,
          deadlineMeta: t.deadlineMeta,
          completed: t.completed,
          urgent: t.urgent
        }))
      };
    });

    // 计算本周任务总数和完成率
    const allWeekTasks = weekTasksByDay.flatMap(day => day.tasks);
    const totalWeekTasks = allWeekTasks.length;
    const completedWeekTasks = allWeekTasks.filter(t => t.completed).length;
    const completionRate = totalWeekTasks > 0 ? Math.round((completedWeekTasks / totalWeekTasks) * 100) : 0;

    this.setData({ 
      weekDays, 
      weekTasksByDay,
      totalWeekTasks,
      completionRate 
    });
  },

  calculateMonthView(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    // 统计数据
    const currentMonthTasks = this.data.tasks.filter(t => {
      const d = new Date(t.rawDeadline);
      return d.getFullYear() === year && d.getMonth() === month;
    });

    const completed = currentMonthTasks.filter(t => t.completed).length;
    const exams = currentMonthTasks.filter(t => t.type === 'exam').length;
    
    // 寻找最忙的一天
    const countMap = {};
    currentMonthTasks.forEach(t => {
      if (!t.deadlineKey) return;
      countMap[t.deadlineKey] = (countMap[t.deadlineKey] || 0) + 1;
    });
    let busiestDate = '-';
    let maxCount = 0;
    Object.entries(countMap).forEach(([d, c]) => {
      if(c > maxCount) { maxCount = c; busiestDate = d.split('-')[2]; }
    });

    // 热力图数据 (简化版，只显示当前月天数)
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const heatmap = [];
    for(let i=1; i<=daysInMonth; i++) {
      const dStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
      const count = countMap[dStr] || 0;
      let level = 'l0';
      if(count > 0) level = 'l1';
      if(count > 2) level = 'l2';
      if(count > 4) level = 'l3';
      
      heatmap.push({ day: i, date: dStr, count, level });
    }

    // 即将到期的任务 (未来7天)
    const now = new Date();
    const upcoming = this.data.tasks.filter(t => {
      const d = new Date(t.rawDeadline);
      return d > now && !t.completed;
    }).sort((a,b) => new Date(a.rawDeadline) - new Date(b.rawDeadline)).slice(0, 5);

    this.setData({
      monthStats: {
        totalTasks: currentMonthTasks.length,
        completedTasks: completed,
        exams,
        busiestDay: busiestDate === '-' ? '-' : `${month+1}.${busiestDate}`
      },
      monthHeatmap: heatmap,
      upcomingTasks: upcoming
    });
  },

  buildTimeSlots(list = this.data.scheduleCourses || []) {
    const slots = [];
    for (let i = 1; i <= 12; i++) {
      const coursesInSlot = list.filter((c) => c.start === i);
      slots.push({ time: i, courses: coursesInSlot });
    }
    this.setData({ timeSlots: slots });
  },

  formatCourseTime(startSection, length) {
    const start = Number(startSection) || 1;
    const len = Number(length) || 1;
    const startHour = 8 + start - 1;
    const endHour = startHour + len;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(startHour)}:00 - ${pad(endHour)}:00`;
  },

  // --- 原始数据加载 ---

  async loadTasks() {
    this.setData({ loadingTasks: true });
    try {
      const rows = await fetchTasks(this.getUserId());
      const tasks = this.decorateTasks(Array.isArray(rows) ? rows : []);
      this.setData({ tasks, loadingTasks: false }, () => this.updateViewData());
    } catch (err) {
      console.warn('加载任务失败', err);
      this.setData({ loadingTasks: false });
    }
  },

  async loadSchedule() {
    try {
      const rows = await fetchWeekSchedule(this.getUserId());
      const normalized = this.decorateSchedule(Array.isArray(rows) ? rows : []);
      this.setData({ scheduleCourses: normalized }, () => {
        this.buildTimeSlots(normalized);
        this.updateViewData();
      });
    } catch (err) {
      console.warn('加载课程表失败', err);
      this.setData({ scheduleCourses: [] }, () => {
        this.buildTimeSlots([]);
        this.updateViewData();
      });
    }
  },

  // --- 编辑器操作 ---
  
  async markDone(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    try {
      await updateTaskCompletion(id, true);
      wx.vibrateShort({ type: 'light' });
      this.loadTasks();
    } catch (err) {
      console.warn('标记完成失败', err);
    }
  },

  openCreate() {
    wx.vibrateShort({ type: 'light' });
    const now = new Date();
    this.setData({
      editorVisible: true,
      editingTask: null,
      form: { 
        type: 'homework', 
        title: '', 
        date: now.toISOString().split('T')[0], 
        time: '23:59', 
        description: '',
        related_course_id: null
      }
    });
  },

  openEdit(e) {
    const { id } = e.currentTarget.dataset;
    const task = this.data.tasks.find(t => t.id === id);
    if (!task) return;
    
    let date = '', time = '';
    if (task.rawDeadline) {
      const d = new Date(task.rawDeadline);
      date = d.toISOString().split('T')[0];
      time = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }

    this.setData({
      editorVisible: true,
      editingTask: task,
      form: { type: task.type, title: task.title, date, time, description: task.description || '', related_course_id: task.related_course_id || null }
    });
  },

  closeEditor() { this.setData({ editorVisible: false }); },
  noop() {},
  changeType(e) { this.setData({ 'form.type': e.currentTarget.dataset.type }); },
  onTitleChange(e) { this.setData({ 'form.title': e.detail.value }); },
  onDateChange(e) { this.setData({ 'form.date': e.detail.value }); },
  onTimeChange(e) { this.setData({ 'form.time': e.detail.value }); },
  onDescChange(e) { this.setData({ 'form.description': e.detail.value }); },

  async submitTask() {
    if (this.data.saving) return;
    const { form, editingTask } = this.data;
    if (!form.title || !form.date || !form.time) return wx.showToast({ title: '信息不完整', icon: 'none' });

    this.setData({ saving: true });
    
    try {
      const deadlineIso = new Date(`${form.date}T${form.time}:00`).toISOString();
      if (editingTask) {
        const patch = {
          type: form.type,
          title: form.title,
          description: form.description || null,
          deadline: deadlineIso,
          related_course_id: form.related_course_id || null
        };
        await updateTask(editingTask.id, patch);
      } else {
        const payload = {
          user_id: this.getUserId(),
          type: form.type,
          title: form.title,
          description: form.description || null,
          deadline: deadlineIso,
          is_completed: false,
          related_course_id: form.related_course_id || null
        };
        await createTask(payload);
      }
      this.setData({ editorVisible: false, saving: false });
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.loadTasks();
    } catch (err) {
      console.warn('保存任务失败', err);
      this.setData({ saving: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },
  
  async deleteCurrent() {
    if (!this.data.editingTask) return;
    try {
      await deleteTask(this.data.editingTask.id);
      this.setData({ editorVisible: false });
      wx.showToast({ title: '已删除', icon: 'success' });
      this.loadTasks();
    } catch (err) {
      console.warn('删除任务失败', err);
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  },

  // 打开课程详情
  openCourse(e) {
    const { id } = e.currentTarget.dataset;
    const course = this.data.scheduleCourses.find(c => c.id === id);
    if (!course) return;
    
    this.setData({
      courseEditorVisible: true,
      editingCourse: course,
      courseForm: {
        name: course.name || '',
        teacher: course.teacher || '',
        location: course.location || '',
        color: course.color || '#87A8A4',
        credits: course.credits || 2.0
      }
    });
  },

  // 打开创建课程弹窗
  openCreateCourse() {
    wx.vibrateShort({ type: 'light' });
    this.setData({
      courseEditorVisible: true,
      editingCourse: null,
      courseForm: {
        name: '',
        teacher: '',
        location: '',
        color: '#87A8A4',
        credits: 2.0
      }
    });
  },

  // 关闭课程编辑器
  closeCourseEditor() {
    this.setData({ courseEditorVisible: false });
  },

  // 课程表单输入处理
  onCourseNameChange(e) {
    this.setData({ 'courseForm.name': e.detail.value });
  },

  onCourseTeacherChange(e) {
    this.setData({ 'courseForm.teacher': e.detail.value });
  },

  onCourseLocationChange(e) {
    this.setData({ 'courseForm.location': e.detail.value });
  },

  onCourseCreditsChange(e) {
    this.setData({ 'courseForm.credits': parseFloat(e.detail.value) || 0 });
  },

  // 选择颜色
  selectCourseColor(e) {
    const { color } = e.currentTarget.dataset;
    this.setData({ 'courseForm.color': color });
  },

  // 保存课程
  async saveCourse() {
    if (this.data.savingCourse) return;
    
    const { courseForm, editingCourse } = this.data;
    if (!courseForm.name) {
      wx.showToast({ title: '请输入课程名称', icon: 'none' });
      return;
    }

    this.setData({ savingCourse: true });

    try {
      const payload = {
        user_id: this.getUserId(),
        name: courseForm.name,
        teacher: courseForm.teacher || null,
        location: courseForm.location || null,
        color: courseForm.color,
        credits: courseForm.credits || 2.0
      };

      if (editingCourse) {
        // 更新现有课程
        await updateCourse(editingCourse.courseId, payload);
        wx.showToast({ title: '课程已更新', icon: 'success' });
      } else {
        // 创建新课程
        await createCourse(payload);
        wx.showToast({ title: '课程已创建', icon: 'success' });
      }

      this.setData({ courseEditorVisible: false, savingCourse: false });
      this.loadSchedule();
      this.loadCourses();
    } catch (err) {
      console.error('保存课程失败', err);
      this.setData({ savingCourse: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  // 删除课程
  async deleteCourse() {
    const { editingCourse } = this.data;
    if (!editingCourse) return;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除课程「${editingCourse.name}」吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await deleteCourse(editingCourse.courseId);
            this.setData({ courseEditorVisible: false });
            wx.showToast({ title: '课程已删除', icon: 'success' });
            this.loadSchedule();
            this.loadCourses();
          } catch (err) {
            console.error('删除课程失败', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 加载所有课程列表（用于选择）
  async loadCourses() {
    try {
      const courses = await fetchCourses(this.getUserId());
      this.setData({ courses: Array.isArray(courses) ? courses : [] });
    } catch (err) {
      console.warn('加载课程列表失败', err);
    }
  },

  decorateTasks(rows = []) {
    const paletteLen = MORANDI_COLORS.length;
    return rows.map((task, idx) => {
      const accent = MORANDI_COLORS[idx % paletteLen];
      const deadlineIso = task.deadline;
      const dateObj = deadlineIso ? new Date(deadlineIso) : null;
      const month = dateObj ? dateObj.getMonth() + 1 : null;
      const day = dateObj ? dateObj.getDate() : null;
      const shortLabel = dateObj ? `${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}` : '--';
      const timeLabel = dateObj
        ? `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`
        : '--:--';
      const deadlineKey = dateObj ? formatDateKey(dateObj) : '';

      return {
        id: task.id,
        type: task.type,
        title: task.title,
        description: task.description,
        accent,
        rawDeadline: deadlineIso,
        deadlineKey,
        deadline: shortLabel,
        deadlineMeta: `${shortLabel} ${timeLabel}`,
        completed: task.is_completed,
        course: task.course?.name || '未关联课程',
        courseColor: task.course?.color || accent,
        urgent: task.type === 'exam',
        related_course_id: task.related_course_id || null
      };
    });
  },

  decorateSchedule(rows = []) {
    const paletteLen = MORANDI_COLORS.length;
    return rows.map((item, idx) => {
      const course = item.course || {};
      return {
        id: item.id,
        courseId: item.course_id,
        day: item.day_of_week,
        start: item.start_section,
        len: item.length,
        location: item.location || course.location || '未设置教室',
        name: course.name || '未命名课程',
        color: course.color || MORANDI_COLORS[idx % paletteLen]
      };
    });
  },

  getUserId() {
    const app = getApp();
    return (
      app?.globalData?.supabase?.userId ||
      wx.getStorageSync('user_id') ||
      wx.getStorageSync('syllaby_user_id') ||
      DEMO_USER_ID
    );
  }
})
