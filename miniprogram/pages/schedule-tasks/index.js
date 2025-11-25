// pages/schedule-tasks/index.js
import { MORANDI_COLORS } from '../../utils/colors';

// 模拟课程数据 (使用莫兰迪色系)
const MOCK_COURSES = [
  { id: 'c1', name: '操作系统', location: 'C3-201', day: 1, start: 2, len: 2, color: '#9BB5CE' }, // 周一 2-4节
  { id: 'c2', name: '线性代数', location: 'B1-105', day: 2, start: 1, len: 2, color: '#C9A5A0' }, // 周二 1-2节
  { id: 'c3', name: '人工智能导论', location: 'A2-404', day: 3, start: 6, len: 3, color: '#A3B18A' },
  { id: 'c4', name: '英语视听说', location: 'D1-302', day: 4, start: 3, len: 2, color: '#D6CDEA' },
  { id: 'c5', name: '计算机网络', location: 'C3-101', day: 5, start: 1, len: 2, color: '#E0C3A5' }
];

// 模拟任务兜底
const MOCK_TASKS = [
  {
    id: 'mock-1',
    type: 'homework',
    title: '操作系统实验报告',
    deadline: new Date().toISOString(),
    is_completed: false,
    related_course_id: 'OS'
  }
];

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getWeekDays(currentDate) {
  const curr = new Date(currentDate);
  // 调整到周一
  const day = curr.getDay() || 7; 
  if(day !== 1) curr.setHours(-24 * (day - 1));
  
  const days = [];
  const weekNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(curr);
    d.setDate(curr.getDate() + i);
    days.push({
      name: weekNames[i],
      date: d.getDate(),
      fullDate: d.toISOString().split('T')[0],
      isToday: d.toDateString() === new Date().toDateString(),
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
    monthStats: {},
    monthHeatmap: [],
    upcomingTasks: [],

    loadingTasks: true,
    editorVisible: false,
    editingTask: null,
    saving: false,
    form: { type: 'homework', title: '', date: '', time: '', description: '' }
  },

  onLoad() {
    this.initDate();
    this.loadTasks();
    this.generateTimeSlots();
  },

  onShow() {
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
    const nowStr = date.toISOString().split('T')[0];
    
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
    const dateStr = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay() || 7; // 1-7

    // 筛选今日课程
    const courses = MOCK_COURSES.filter(c => c.day === dayOfWeek).map(c => ({
      ...c,
      time: `${8 + c.start - 1}:00 - ${8 + c.start - 1 + c.len}:00` // 简单计算时间
    })).sort((a, b) => a.start - b.start);

    // 筛选今日任务 (截止日期是今天)
    const tasks = this.data.tasks.filter(t => {
      if (!t.rawDeadline) return false;
      return t.rawDeadline.startsWith(dateStr);
    });

    this.setData({
      todayCourses: courses,
      todayTasks: tasks
    });
  },

  calculateWeekView(date) {
    const weekDays = getWeekDays(date);
    
    // 聚合一周的任务
    const weekTasksByDay = weekDays.map(day => {
      const dayTasks = this.data.tasks.filter(t => t.rawDeadline && t.rawDeadline.startsWith(day.fullDate));
      return {
        date: day.fullDate,
        label: day.name,
        tasks: dayTasks.map(t => ({
          id: t.id,
          title: t.title,
          time: formatTime(t.rawDeadline),
          type: t.type === 'exam' ? 'exam-chip' : 'hw-chip'
        }))
      };
    });

    this.setData({ weekDays, weekTasksByDay });
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
      const d = t.rawDeadline.split('T')[0];
      countMap[d] = (countMap[d] || 0) + 1;
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

  generateTimeSlots() {
    // 生成 8:00 - 20:00 的时间槽，并附带课程信息
    const slots = [];
    for (let i = 1; i <= 12; i++) { // 12节课
      const coursesInSlot = MOCK_COURSES.filter(c => c.start === i).map(c => ({
        ...c,
        timeIndex: i - 1
      }));
      
      slots.push({
        time: i,
        courses: coursesInSlot
      });
    }
    this.setData({ timeSlots: slots });
  },

  // --- 原始数据加载 ---

  async loadTasks() {
    this.setData({ loadingTasks: true });
    try {
      // 这里应该从数据库加载真实数据
      // 暂时使用模拟数据
      const fallback = MOCK_TASKS.map((t, idx) => ({
        ...t, 
        accent: MORANDI_COLORS[idx % MORANDI_COLORS.length], 
        rawDeadline: new Date().toISOString(), 
        deadline: 'Today',
        completed: t.is_completed,
        course: t.related_course_id?.slice(0, 4)?.toUpperCase() || 'GEN',
        urgent: t.type === 'exam'
      }));
      
      this.setData({
        tasks: fallback,
        loadingTasks: false
      }, () => this.updateViewData());
    } catch (err) {
      console.warn('加载任务失败', err);
      this.setData({ loadingTasks: false });
    }
  },

  // --- 编辑器操作 ---
  
  async markDone(e) {
    const { id } = e.currentTarget.dataset;
    const tasks = this.data.tasks.map(t => t.id === id ? { ...t, completed: true } : t);
    this.setData({ tasks });
    this.updateViewData(); // 刷新
    wx.vibrateShort({ type: 'light' });
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
        description: '' 
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
      form: { type: task.type, title: task.title, date, time, description: task.description || '' }
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
      // 这里应该保存到数据库
      // 暂时模拟保存
      setTimeout(() => {
        this.setData({ editorVisible: false, saving: false });
        wx.showToast({ title: '保存成功', icon: 'success' });
        this.loadTasks(); // 重新加载
      }, 500);
    } catch (err) {
      this.setData({ saving: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },
  
  async deleteCurrent() {
    if(!this.data.editingTask) return;
    try {
      // 这里应该从数据库删除
      // 暂时模拟删除
      this.setData({ editorVisible: false });
      this.loadTasks();
    } catch(e) {}
  },

  // 打开课程详情
  openCourse(e) {
    const { id } = e.currentTarget.dataset;
    wx.showToast({ title: '课程详情开发中', icon: 'none' });
  }
})
