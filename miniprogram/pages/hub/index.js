const { MORANDI_COLORS } = require('../../utils/colors');
const {
  DEMO_USER_ID,
  fetchWeekSchedule,
  fetchAllTasks,
  fetchTasks,
  createCourse,
  updateCourse,
  deleteCourse,
  createCourseSchedules,
  createTask,
  updateTask,
  deleteTask
} = require('../../utils/supabase');

// 模拟课程数据 (实际开发中应从数据库加载)
const MOCK_COURSES = [
  { id: 'c1', name: '操作系统', location: 'C3-201', day: 1, start: 2, len: 2, color: '#9BB5CE' }, // 周一 2-4节
  { id: 'c2', name: '线性代数', location: 'B1-105', day: 2, start: 1, len: 2, color: '#C9A5A0' }, // 周二 1-2节
  { id: 'c3', name: '人工智能导论', location: 'A2-404', day: 3, start: 6, len: 3, color: '#A3B18A' },
  { id: 'c4', name: '英语视听说', location: 'D1-302', day: 4, start: 3, len: 2, color: '#D6CDEA' },
  { id: 'c5', name: '计算机网络', location: 'C3-101', day: 5, start: 1, len: 2, color: '#E0C3A5' }
];

const DEFAULT_WEEKS = Object.freeze(Array.from({ length: 18 }, (_, idx) => idx + 1));

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

const DAY_MS = 24 * 60 * 60 * 1000;

// 空教室功能已迁移到工具模块

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
  const weekNames = ['一', '二', '三', '四', '五', '六', '日'];
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
      dayIdx: i + 1, // 1-7
      timestamp: d.getTime()
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
    totalWeekTasks: 0,
    hasNoWeekTasks: true,
    monthStats: {},
    
    // 周视图日期选择
    selectedDay: null, // 当前选中的日期
    selectedDayCourses: [], // 选中日期的课程
    selectedDayTasks: [], // 选中日期的任务
    monthHeatmap: [],
    upcomingTasks: [],

    // 课程详情弹窗
    showCourseDetail: false,
    selectedCourse: {},
    selectedCourseTasks: [],
    showCourseEditor: false,
    editingCourse: {},
    courseForm: {
      name: '',
      location: '',
      teacher: '',
      color: '#87A8A4',
      day: 1,
      start: 1,
      len: 2
    },

    // 通用数据
    profile: { nickname: '同学' },
    loading: false,
    skeleton: true,

    // 待办编辑器
    showTaskEditor: false,
    editingTask: null,
    taskForm: {
      mode: 'persistent',
      title: '',
      description: '',
      deadline: '',
      deadline_date: '',
      deadline_time: '',
      has_specific_time: false,
      related_course_id: null
    },

    // 课程详情弹窗相关
    showCourseDetail: false,
    selectedCourse: {},
    selectedCourseTasks: [],
    modalAnimation: {}
  },

  onLoad() {
    this.initDate();
    this.loadTasks();
    this.generateTimeSlots();
  },

  onShow() {
    if (this.getTabBar && this.getTabBar()) {
      this.getTabBar().setSelected(0);
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
    const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
    if (this.data.viewMode === 'day') {
      const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      dateText = `${monthNames[date.getMonth()]} ${date.getDate()}日 · ${days[date.getDay()]}`;
      this.calculateDayView(date);
    } else if (this.data.viewMode === 'week') {
      dateText = `${monthNames[date.getMonth()]} ${date.getFullYear()}年`;
      this.calculateWeekView(date);
    } else {
      dateText = `${monthNames[date.getMonth()]} ${date.getFullYear()}年`;
      this.calculateMonthView(date);
    }

    this.setData({ currentDateText: dateText });
  },

  // --- 数据计算逻辑 ---

  calculateDayView(date) {
    const dateKey = formatDateKey(date);
    const dayOfWeek = date.getDay() || 7; // 1-7

    // 筛选今日课程
    const courses = MOCK_COURSES.filter(c => c.day === dayOfWeek).map(c => ({
      ...c,
      time: `${8 + c.start - 1}:00 - ${8 + c.start - 1 + c.len}:00` // 简单计算时间
    })).sort((a, b) => a.start - b.start);

    const targetMidnight = new Date(dateKey);
    targetMidnight.setHours(0, 0, 0, 0);
    const targetTs = targetMidnight.getTime();

    const tasks = this.data.tasks
      .filter((task) => this.shouldDisplayTaskOnDate(task, targetTs, dateKey))
      .map((task) => this.decorateTaskForDate(task, targetTs, dateKey));

    this.setData({
      todayCourses: courses,
      todayTasks: tasks
    });
  },

  calculateWeekView(date) {
    const weekDays = getWeekDays(date);
    
    // 聚合一周的任务
    const weekTasksByDay = weekDays.map(day => {
      const dayDate = new Date(day.dateKey);
      dayDate.setHours(0, 0, 0, 0);
      const dayTs = dayDate.getTime();
      const dayTasks = this.data.tasks
        .filter(task => this.shouldDisplayTaskOnDate(task, dayTs, day.dateKey))
        .map(task => ({
          instanceId: `${task.id}-${day.dateKey}`,
          originalId: task.id,
          title: task.title,
          timelineLabel: this.getTimelineLabel(task, dayTs),
          mode: task.mode,
          completed: task.completed,
          accent: task.accent,
          payload: task
        }));
      return {
        dateKey: day.dateKey,
        date: day.date,
        label: day.name,
        isToday: day.isToday,
        tasks: dayTasks
      };
    });

    const uniqueTaskIds = new Set();
    weekTasksByDay.forEach(day => {
      day.tasks.forEach(task => uniqueTaskIds.add(task.originalId));
    });

    const totalWeekTasks = uniqueTaskIds.size;
    const hasNoWeekTasks = totalWeekTasks === 0;

    // 初始化选中日期（默认为今天）
    const todayKey = formatDateKey(new Date());
    const selectedDay = this.data.selectedDay || todayKey;
    this.updateSelectedDayCourses(selectedDay);

    this.setData({ weekDays, weekTasksByDay, totalWeekTasks, hasNoWeekTasks });
  },

  // 选中日期处理
  selectDay(e) {
    const { date } = e.currentTarget.dataset;
    wx.vibrateShort({ type: 'light' });
    
    if (this.data.selectedDay === date) {
      // 如果再次点击已选中的日期，则取消选中
      this.setData({
        selectedDay: null,
        selectedDayCourses: [],
        selectedDayText: ''
      });
    } else {
      this.updateSelectedDayCourses(date);
    }
  },

  updateSelectedDayCourses(dateKey) {
    const selectedDay = dateKey;
    const selectedDate = new Date(selectedDay);
    
    // 计算选中日期的星期几（1-7）
    const dayOfWeek = selectedDate.getDay() || 7;
    
    // 筛选选中日期的课程
    const selectedDayCourses = MOCK_COURSES.filter(c => c.day === dayOfWeek).map(c => ({
      ...c,
      time: `${8 + c.start - 1}:00 - ${8 + c.start - 1 + c.len}:00`
    })).sort((a, b) => a.start - b.start);
    
    // 生成选中日期的文本
    const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const selectedDayText = `${monthNames[selectedDate.getMonth()]} ${selectedDate.getDate()}日 · ${days[selectedDate.getDay()]}`;
    
    this.setData({
      selectedDay,
      selectedDayCourses,
      selectedDayText
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

  getTodayStartTs() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.getTime();
  },

  shouldDisplayTaskOnDate(task, targetTs, targetKey) {
    if (!task) return false;
    if (task.mode === 'instant') {
      return task.deadlineKey === targetKey;
    }
    const todayStart = this.getTodayStartTs();
    const visibleStart = Math.max(task.visibleFromTs || todayStart, todayStart);
    return targetTs >= visibleStart && targetTs <= (task.deadlineTs || targetTs);
  },

  getTimelineLabel(task, targetTs) {
    if (task.mode === 'instant') {
      return formatTime(task.rawDeadline);
    }
    const diff = Math.max(0, Math.ceil(((task.deadlineTs || targetTs) - targetTs) / DAY_MS));
    return diff === 0 ? '今日截止' : `剩余${diff}天`;
  },

  decorateTaskForDate(task, targetTs, targetKey) {
    return {
      ...task,
      dayBadge: task.mode === 'instant' ? '瞬时事件' : '持续待办',
      dayIndicator: this.getTimelineLabel(task, targetTs),
      instanceId: `${task.id}-${targetKey}`
    };
  },

  // --- 原始数据加载 (保持 Supabase 逻辑) ---

  async loadTasks() {
    this.setData({ loading: true });
    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      
      // 添加调试信息
      console.log('首页加载任务 - 用户ID:', userId);
      console.log('首页加载任务 - fetchAllTasks函数:', typeof fetchAllTasks);
      
      // 添加强制刷新选项
      const forceRefresh = wx.getStorageSync('force_refresh_tasks') || false;
      if (forceRefresh) {
        console.log('首页加载任务 - 强制刷新任务缓存');
        wx.removeStorageSync('tasks_cache');
        wx.setStorageSync('force_refresh_tasks', false);
      }
      
      const rows = await fetchAllTasks(userId);
      
      // 添加调试信息
      console.log('首页加载任务 - 获取到的任务数量:', rows?.length);
      console.log('首页加载任务 - 任务详情:', rows);
      
      // 检查小组任务
      const groupTasks = rows?.filter(task => 
        task.type === 'group_task' || 
        (task.title && task.title.startsWith('[小组任务]'))
      );
      console.log('首页加载任务 - 小组任务数量:', groupTasks?.length);
      console.log('首页加载任务 - 小组任务详情:', groupTasks);
      
      if (!rows || !rows.length) throw new Error('empty');

      const todayStartTs = this.getTodayStartTs();
      const tasks = rows.map((row, idx) => {
        const d = new Date(row.deadline);
        const month = `${d.getMonth() + 1}`.padStart(2, '0');
        const day = `${d.getDate()}`.padStart(2, '0');
        const hour = `${d.getHours()}`.padStart(2, '0');
        const minute = `${d.getMinutes()}`.padStart(2, '0');
        const deadlineStr = `${month}.${day} ${hour}:${minute}`;
        const deadlineKey = formatDateKey(d);
        const dueMidnight = new Date(d);
        dueMidnight.setHours(0, 0, 0, 0);
        const createdAt = row.created_at ? new Date(row.created_at) : null;
        const visibleFrom = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : new Date();
        visibleFrom.setHours(0, 0, 0, 0);
        const mode = row.type === 'homework' ? 'persistent' : 'instant';
        const displayBadge = mode === 'instant' ? '瞬时事件' : '持续待办';
        const displayTime = mode === 'instant' ? `${month}.${day} ${hour}:${minute}` : `${month}.${day} 截止`;
        const deadlineTs = dueMidnight.getTime();
        const visibleFromTs = visibleFrom.getTime();
        const daysLeft = Math.max(0, Math.ceil((deadlineTs - todayStartTs) / DAY_MS));
        return {
          id: row.id,
          type: row.type,
          mode,
          title: row.title,
          deadline: deadlineStr,
          rawDeadline: row.deadline,
          deadlineKey,
          description: row.description,
          progress: row.is_completed ? 1 : 0,
          // 小组任务使用特殊的课程标识
          course: row.type === 'group_task' ? '小组' : (row.related_course_id?.slice(0, 4)?.toUpperCase() || 'GEN'),
          courseName: row.course?.name || '',
          related_course_id: row.related_course_id || null,
          // 小组任务使用特殊的颜色
          accent: row.type === 'group_task' ? '#FF6B6B' : MORANDI_COLORS[idx % MORANDI_COLORS.length],
          completed: row.is_completed,
          // 标记小组任务和考试任务
          urgent: mode === 'instant' || row.type === 'group_task', // 小组任务也标记为紧急
          displayBadge,
          displayTime,
          deadlineTs,
          visibleFromTs,
          daysLeft,
          // 添加小组任务支持
          groupDetails: row.groupInfo ? {
            groupId: row.groupInfo.groupId,
            groupName: row.groupInfo.groupName || '学习小组',
            groupDescription: row.groupInfo.groupDescription || ''
          } : null
        };
      });
      
      this.setData({ tasks, loading: false, skeleton: false }, () => {
        this.updateViewData(); // 数据加载后刷新视图
      });
      wx.setStorageSync('tasks_cache', tasks);
    } catch (err) {
      console.warn('Fallback tasks', err);
      const cached = wx.getStorageSync('tasks_cache');
      const rawList = Array.isArray(cached) && cached.length ? cached : MOCK_TASKS;
      const fallback = rawList.map((t, idx) => {
        if (t.mode && t.deadlineTs && t.visibleFromTs) {
          return t;
        }
        const now = t.rawDeadline ? new Date(t.rawDeadline) : new Date();
        now.setSeconds(0, 0);
        const deadlineTs = now.getTime();
        return {
          id: t.id || `mock-${idx}`,
          type: t.type || 'homework',
          mode: (t.type || 'homework') === 'homework' ? 'persistent' : 'instant',
          title: t.title,
          description: t.description || '',
          rawDeadline: now.toISOString(),
          deadlineKey: formatDateKey(now),
          deadline: '今天',
          course: t.course || t.related_course_id || 'GEN',
          courseName: t.courseName || '',
          related_course_id: t.related_course_id || null,
          accent: t.accent || '#9BB5CE',
          completed: t.completed || t.is_completed || false,
          urgent: (t.type || 'homework') !== 'homework',
          displayBadge: (t.type || 'homework') === 'homework' ? '持续待办' : '瞬时事件',
          displayTime: '今天',
          deadlineTs,
          visibleFromTs: deadlineTs,
          daysLeft: 0
        };
      });
      
      this.setData({
        tasks: fallback,
        loading: false,
        skeleton: false
      }, () => this.updateViewData());
    }
  },

  // 事件处理
  handleCourseOpen(e) {
    const course = e.detail;
    wx.showActionSheet({
      itemList: ['查看详情', '编辑课程'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 查看详情
          this.showCourseDetail(course);
        } else if (res.tapIndex === 1) {
          // 编辑课程
          this.editCourse(course);
        }
      }
    });
  },

  showCourseDetail(course) {
    const timeRange = sectionsToTime(course.start_section, course.length);
    wx.showModal({
      title: course.name,
      content: `时间：${timeRange}\\n地点：${course.location || '待定'}\\n教师：${course.teacher || '待定'}`,
      showCancel: false
    });
  },

  editCourse(course) {
    // 跳转到课程编辑页面
    wx.navigateTo({
      url: `/pages/course-edit/index?courseId=${course.id}`
    });
  },

  // === 待办相关功能 ===
  
  // 切换任务完成状态
  async toggleTaskComplete(e) {
    const { id, completed } = e.currentTarget.dataset;
    try {
      // 切换任务状态：已完成 -> 未完成，未完成 -> 已完成
      await updateTask(id, { is_completed: !completed });
      wx.vibrateShort({ type: 'light' });
      this.loadTasks();
      wx.showToast({
        title: completed ? '已标记为未完成' : '任务已完成',
        icon: 'success'
      });
    } catch (err) {
      console.error('切换任务状态失败:', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // 完成所有今日待办
  async completeAllTasks() {
    const { todayTasks } = this.data;
    const incompleteTasks = todayTasks.filter(task => !task.completed);
    
    if (incompleteTasks.length === 0) {
      wx.showToast({ title: '没有待完成的任务', icon: 'none' });
      return;
    }
    
    wx.showModal({
      title: '确认完成',
      content: `确定要完成所有 ${incompleteTasks.length} 个待办任务吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });
          try {
            // 批量更新任务状态
            await Promise.all(
              incompleteTasks.map(task => updateTask(task.id, { is_completed: true }))
            );
            
            wx.hideLoading();
            wx.showToast({ 
              title: `已完成 ${incompleteTasks.length} 个任务`, 
              icon: 'success' 
            });
            
            // 重新加载任务
            this.loadTasks();
          } catch (err) {
            console.error('批量完成任务失败:', err);
            wx.hideLoading();
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 打开待办创建器
  openTaskCreator() {
    wx.vibrateShort({ type: 'light' });
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = '23:59';
    const defaultDeadline = new Date(`${dateStr}T${timeStr}:00`);
    
    this.setData({
      showTaskEditor: true,
      editingTask: null,
      taskForm: {
        mode: 'persistent',
        title: '',
        description: '',
        deadline: defaultDeadline.toISOString(),
        deadline_date: dateStr,
        deadline_time: timeStr,
        has_specific_time: false,
        related_course_id: null
      }
    });
  },

  // 打开待办编辑器
  openTaskEditor(e) {
    const { task } = e.currentTarget.dataset;
    if (!task) return;
    wx.vibrateShort({ type: 'light' });
    
    const deadline = new Date(task.rawDeadline);
    const dateStr = deadline.toISOString().split('T')[0];
    const timeStr = `${String(deadline.getHours()).padStart(2, '0')}:${String(deadline.getMinutes()).padStart(2, '0')}`;
    const mode = task.type === 'homework' ? 'persistent' : 'instant';
    const hasExplicitTime = mode === 'instant' ? true : (deadline.getHours() !== 23 || deadline.getMinutes() !== 59);
    
    this.setData({
      showTaskEditor: true,
      editingTask: task,
      taskForm: {
        mode,
        title: task.title,
        description: task.description || '',
        deadline: task.rawDeadline,
        deadline_date: dateStr,
        deadline_time: timeStr,
        has_specific_time: hasExplicitTime,
        related_course_id: task.related_course_id || null
      }
    });
  },

  // 关闭待办编辑器
  closeTaskEditor() {
    this.setData({
      showTaskEditor: false,
      editingTask: null,
      taskForm: {
        mode: 'persistent',
        title: '',
        description: '',
        deadline: '',
        deadline_date: '',
        deadline_time: '',
        has_specific_time: false,
        related_course_id: null
      }
    });
  },

  // 待办表单输入处理
  onTaskFormChange(e) {
    const { field } = e.currentTarget.dataset;
    let { value } = e.detail;
    
    if (field === 'deadline_date' || field === 'deadline_time') {
      this.setData({
        [`taskForm.${field}`]: value
      });
      // 自动组合完整的deadline
      this.updateDeadline();
      return;
    }
    
    this.setData({
      [`taskForm.${field}`]: value
    });
  },

  // 更新截止时间
  updateDeadline() {
    const { deadline_date, deadline_time, has_specific_time, mode } = this.data.taskForm;
    if (deadline_date) {
      let timeStr = '23:59';
      if (mode === 'instant') {
        timeStr = deadline_time || '08:00';
      } else if (has_specific_time && deadline_time) {
        timeStr = deadline_time;
      }
      const deadline = new Date(`${deadline_date}T${timeStr}:00`);
      this.setData({
        'taskForm.deadline': deadline.toISOString()
      });
    }
  },

  // 切换是否使用具体时间
  toggleSpecificTime() {
    if (this.data.taskForm.mode === 'instant') {
      return;
    }
    const has_specific_time = !this.data.taskForm.has_specific_time;
    this.setData({
      'taskForm.has_specific_time': has_specific_time
    });
    this.updateDeadline();
  },

  switchTaskMode(e) {
    const { mode } = e.currentTarget.dataset;
    if (!mode || mode === this.data.taskForm.mode) return;
    const updates = {
      'taskForm.mode': mode
    };
    if (mode === 'instant') {
      updates['taskForm.has_specific_time'] = true;
      if (!this.data.taskForm.deadline_time) {
        updates['taskForm.deadline_time'] = '08:00';
      }
    }
    this.setData(updates, () => {
      this.updateDeadline();
    });
  },

  // 保存待办
  async saveTask() {
    const { taskForm, editingTask } = this.data;
    
    if (!taskForm.title.trim()) {
      wx.showToast({ title: '请输入任务标题', icon: 'none' });
      return;
    }

    if (!taskForm.deadline_date) {
      wx.showToast({ title: '请选择截止日期', icon: 'none' });
      return;
    }

    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId || wx.getStorageSync('user_id') || DEMO_USER_ID;
      const recordType = taskForm.mode === 'instant' ? 'exam' : 'homework';

      const payload = {
        user_id: userId,
        type: recordType,
        title: taskForm.title.trim(),
        description: taskForm.description.trim() || null,
        deadline: taskForm.deadline,
        is_completed: false,
        related_course_id: taskForm.related_course_id || null
      };

      if (editingTask) {
        // 更新现有任务
        await updateTask(editingTask.id, payload);
        wx.showToast({ title: '任务已更新', icon: 'success' });
      } else {
        // 创建新任务
        await createTask(payload);
        wx.showToast({ title: '任务已创建', icon: 'success' });
      }

      this.closeTaskEditor();
      this.loadTasks();
    } catch (err) {
      console.error('保存任务失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  // 删除待办
  async deleteTask() {
    const { editingTask } = this.data;
    
    if (!editingTask) return;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除任务"${editingTask.title}"吗？`,
      confirmColor: '#FF3B30',
      success: async (res) => {
        if (res.confirm) {
          try {
            await deleteTask(editingTask.id);
            wx.showToast({ title: '任务已删除', icon: 'success' });
            this.closeTaskEditor();
            this.loadTasks();
          } catch (err) {
            console.error('删除任务失败:', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  goToProfile() {
    wx.navigateTo({ url: '/pages/profile/index' });
  },

  // 格式化日期
  formatDate(date) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  // 获取热力图颜色
  getHeatmapColor(level) {
    const colors = [
      'var(--paper)',                    // 0: 无数据
      'rgba(17, 72, 196, 0.2)',         // 1: 低活跃
      'rgba(17, 72, 196, 0.5)',         // 2: 中活跃  
      'rgba(17, 72, 196, 0.8)',         // 3: 高活跃
      'rgba(17, 72, 196, 1.0)'          // 4: 极高活跃
    ];
    return colors[level] || colors[0];
  },

  // 触摸事件（用于时间轴动画）
  onTouchStart(e) {
    this.touchStartTime = Date.now();
    this.touchStartY = e.touches[0].clientY;
  },

  onTouchEnd(e) {
    const touchEndTime = Date.now();
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchEndY - this.touchStartY;
    const deltaTime = touchEndTime - this.touchStartTime;

    // 判断手势
    if (Math.abs(deltaY) > 50 && deltaTime < 300) {
      if (deltaY > 0 && this.data.viewMode === 'week') {
        // 下滑 - 上一周
        this.prevWeek();
      } else if (deltaY < 0 && this.data.viewMode === 'week') {
        // 上滑 - 下一周
        this.nextWeek();
      }
    }
  },

  // === 课程详情弹窗相关函数 ===
  
  openCourse(e) {
    const { id } = e.currentTarget.dataset;
    const course = MOCK_COURSES.find(c => c.id === id);
    
    if (!course) {
      wx.showToast({ title: '课程信息未找到', icon: 'none' });
      return;
    }
    
    // 添加时间信息
    course.time = `${8 + course.start - 1}:00 - ${8 + course.start - 1 + course.len}:00`;
    
    // 查找相关任务
    const courseTasks = this.data.tasks.filter(task => {
      const courseCode = (task.course || task.related_course_id || '').toLowerCase();
      const courseName = course.name.toLowerCase();
      return courseName.includes(courseCode) || courseCode.includes(courseName.slice(0, 4));
    });
    
    this.setData({
      selectedCourse: course,
      selectedCourseTasks: courseTasks,
      showCourseDetail: true
    });
    
    wx.vibrateShort({ type: 'light' });
  },

  // 关闭课程详情
  closeCourseDetail() {
    this.setData({
      showCourseDetail: false,
      selectedCourse: {},
      selectedCourseTasks: []
    });
  },

  // 打开课程编辑器
  openCourseEditor() {
    const { selectedCourse } = this.data;
    this.setData({
      showCourseEditor: true,
      editingCourse: { ...selectedCourse },
      courseForm: {
        name: selectedCourse.name || '',
        location: selectedCourse.location || '',
        teacher: selectedCourse.teacher || '',
        color: selectedCourse.color || '#87A8A4',
        day: selectedCourse.day || 1,
        start: selectedCourse.start || 1,
        len: selectedCourse.len || 2
      }
    });
    wx.vibrateShort({ type: 'light' });
  },

  // 关闭课程编辑器
  closeCourseEditor() {
    this.setData({
      showCourseEditor: false,
      editingCourse: {},
      courseForm: {
        name: '',
        location: '',
        teacher: '',
        color: '#87A8A4',
        day: 1,
        start: 1,
        len: 2
      }
    });
  },

  // 表单输入处理
  onCourseFormChange(e) {
    const { field } = e.currentTarget.dataset;
    let { value } = e.detail;
    
    // 处理picker组件的特殊情况
    if (field === 'day' || field === 'start' || field === 'len') {
      value = parseInt(value) + 1; // picker索引转换为实际值
    }
    
    this.setData({
      [`courseForm.${field}`]: value
    });
  },

  // 选择颜色
  selectCourseColor(e) {
    const { color } = e.currentTarget.dataset;
    this.setData({
      'courseForm.color': color
    });
  },

  // 保存课程
  async saveCourse() {
    const { courseForm, editingCourse } = this.data;
    
    if (!courseForm.name.trim()) {
      wx.showToast({ title: '请输入课程名称', icon: 'none' });
      return;
    }

    if (editingCourse.isNew) {
      // 保存新课程
      await this.saveNewCourse();
    } else {
      // 更新现有课程
      try {
        const coursePayload = {
          name: courseForm.name,
          location: courseForm.location || null,
          teacher: courseForm.teacher || null,
          color: courseForm.color,
          credits: 2.0
        };

        await updateCourse(editingCourse.courseId, coursePayload);

        // 更新课程时间安排
        const schedulePayload = {
          day_of_week: courseForm.day,
          start_section: courseForm.start,
          length: courseForm.len,
          location: courseForm.location || null
        };

        // 刷新界面 - 直接更新模拟数据
        this.updateMockCourse(editingCourse.courseId, courseForm);
        this.generateTimeSlots();
        this.updateViewData();
        
        wx.showToast({ title: '课程已更新', icon: 'success' });
        this.closeCourseEditor();
        this.closeCourseDetail();
      } catch (err) {
        console.error('更新课程失败:', err);
        wx.showToast({ title: '更新失败', icon: 'none' });
      }
    }
  },

  // 删除课程
  async deleteCourse() {
    const { selectedCourse } = this.data;
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除课程"${selectedCourse.name}"吗？此操作不可撤销。`,
      confirmColor: '#FF3B30',
      success: async (res) => {
        if (res.confirm) {
          try {
            // 删除课程记录
            await deleteCourse(selectedCourse.courseId);
            
            // 刷新界面 - 从模拟数据中删除
            this.removeCourseFromMockData(selectedCourse.courseId);
            this.generateTimeSlots();
            this.updateViewData();
            
            wx.showToast({ title: '课程已删除', icon: 'success' });
            this.closeCourseDetail();
          } catch (err) {
            console.error('删除课程失败:', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 添加课程
  addCourse() {
    wx.vibrateShort({ type: 'light' });
    
    this.setData({
      showCourseEditor: true,
      editingCourse: { isNew: true },
      courseForm: {
        name: '',
        location: '',
        teacher: '',
        color: '#87A8A4',
        day: 1,
        start: 1,
        len: 2
      }
    });
  },

  // 保存新课程
  async saveNewCourse() {
    const { courseForm } = this.data;
    
    if (!courseForm.name.trim()) {
      wx.showToast({ title: '请输入课程名称', icon: 'none' });
      return;
    }

    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId || wx.getStorageSync('user_id') || DEMO_USER_ID;
      
      // 创建课程记录
      const coursePayload = {
        user_id: userId,
        name: courseForm.name,
        location: courseForm.location || null,
        teacher: courseForm.teacher || null,
        color: courseForm.color,
        credits: 2.0
      };

      const courseResult = await createCourse(coursePayload);
      const newCourse = Array.isArray(courseResult) ? courseResult[0] : courseResult;

      // 创建课程时间安排
      const weeks =
        Array.isArray(courseForm.weeks) && courseForm.weeks.length
          ? courseForm.weeks
          : DEFAULT_WEEKS;

      const schedulePayload = {
        user_id: userId,
        course_id: newCourse.id,
        day_of_week: courseForm.day,
        start_section: courseForm.start,
        length: courseForm.len,
        location: courseForm.location || null,
        weeks: [...weeks]
      };

      await createCourseSchedules([schedulePayload]);

      // 刷新界面 - 直接更新模拟数据
      this.addCourseToMockData(newCourse, courseForm);
      this.generateTimeSlots();
      this.updateViewData();
      
      wx.showToast({ title: '课程添加成功', icon: 'success' });
      this.closeCourseEditor();
    } catch (err) {
      console.error('保存课程失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  closeCourseDetail() {
    console.log('关闭课程详情'); // 调试日志
    this.setData({
      showCourseDetail: false,
      selectedCourse: {},
      selectedCourseTasks: []
    });
  },

  editCourse() {
    const { selectedCourse } = this.data;
    wx.showModal({
      title: '编辑课程',
      content: `确定要编辑课程"${selectedCourse.name}"吗？`,
      confirmText: '编辑',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({
            title: '编辑功能开发中',
            icon: 'none'
          });
          // 这里可以跳转到课程编辑页面
          // wx.navigateTo({
          //   url: `/pages/course-edit/index?courseId=${selectedCourse.id}`
          // });
        }
      }
    });
  },

  // 添加课程到模拟数据
  addCourseToMockData(newCourse, courseForm) {
    // 生成唯一的课程ID
    const courseId = 'c' + (MOCK_COURSES.length + 1);
    
    // 创建新的课程对象
    const newMockCourse = {
      id: courseId,
      name: newCourse.name,
      location: courseForm.location || '待定',
      teacher: courseForm.teacher || '待定',
      day: courseForm.day,
      start: courseForm.start,
      len: courseForm.len,
      color: courseForm.color
    };
    
    // 添加到模拟数据
    MOCK_COURSES.push(newMockCourse);
    
    // 更新存储
    wx.setStorageSync('courses_cache', MOCK_COURSES);
  },

  // 更新模拟数据中的课程
  updateMockCourse(courseId, courseForm) {
    const courseIndex = MOCK_COURSES.findIndex(c => c.id === courseId);
    if (courseIndex !== -1) {
      MOCK_COURSES[courseIndex] = {
        ...MOCK_COURSES[courseIndex],
        name: courseForm.name,
        location: courseForm.location || '待定',
        teacher: courseForm.teacher || '待定',
        day: courseForm.day,
        start: courseForm.start,
        len: courseForm.len,
        color: courseForm.color
      };
      
      // 更新存储
      wx.setStorageSync('courses_cache', MOCK_COURSES);
    }
  },

  // 从模拟数据中删除课程
  removeCourseFromMockData(courseId) {
    const courseIndex = MOCK_COURSES.findIndex(c => c.id === courseId);
    if (courseIndex !== -1) {
      MOCK_COURSES.splice(courseIndex, 1);
      
      // 更新存储
      wx.setStorageSync('courses_cache', MOCK_COURSES);
    }
  },

  // 添加课程到模拟数据
  addCourseToMockData(newCourse, courseForm) {
    // 生成唯一的课程ID
    const courseId = 'c' + (MOCK_COURSES.length + 1);
    
    // 创建新的课程对象
    const newMockCourse = {
      id: courseId,
      name: newCourse.name,
      location: courseForm.location || '待定',
      teacher: courseForm.teacher || '待定',
      day: courseForm.day,
      start: courseForm.start,
      len: courseForm.len,
      color: courseForm.color
    };
    
    // 添加到模拟数据
    MOCK_COURSES.push(newMockCourse);
    
    // 更新存储
    wx.setStorageSync('courses_cache', MOCK_COURSES);
  },

  // 更新模拟数据中的课程
  updateMockCourse(courseId, courseForm) {
    const courseIndex = MOCK_COURSES.findIndex(c => c.id === courseId);
    if (courseIndex !== -1) {
      MOCK_COURSES[courseIndex] = {
        ...MOCK_COURSES[courseIndex],
        name: courseForm.name,
        location: courseForm.location || '待定',
        teacher: courseForm.teacher || '待定',
        day: courseForm.day,
        start: courseForm.start,
        len: courseForm.len,
        color: courseForm.color
      };
      
      // 更新存储
      wx.setStorageSync('courses_cache', MOCK_COURSES);
    }
  },

  // 从模拟数据中删除课程
  removeCourseFromMockData(courseId) {
    const courseIndex = MOCK_COURSES.findIndex(c => c.id === courseId);
    if (courseIndex !== -1) {
      MOCK_COURSES.splice(courseIndex, 1);
      
      // 更新存储
      wx.setStorageSync('courses_cache', MOCK_COURSES);
    }
  },

  deleteCourse() {
    const { selectedCourse } = this.data;
    wx.showModal({
      title: '删除课程',
      content: `确定要删除课程"${selectedCourse.name}"吗？此操作不可撤销。`,
      confirmText: '删除',
      confirmColor: '#FF3B30',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          // 从模拟数据中删除课程
          const courseIndex = MOCK_COURSES.findIndex(c => c.id === selectedCourse.id);
          if (courseIndex !== -1) {
            MOCK_COURSES.splice(courseIndex, 1);
            
            // 更新视图数据
            this.updateViewData();
            
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            });
            
            this.closeCourseDetail();
          }
        }
      }
    });
  }
});
