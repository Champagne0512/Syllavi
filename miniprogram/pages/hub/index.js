const colors = require('../../utils/colors');
const { MORANDI_COLORS } = colors;

const scheduleUtils = require('../../utils/schedule-utils');
const { sectionsToTime } = scheduleUtils;

const supabase = require('../../utils/supabase');
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
  deleteTask,
  uploadToStorage
} = supabase;

// 模拟课程数据（仅在 API 不可用时兜底）
const FALLBACK_COURSES = [
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
const IMPORTANT_EVENT_TYPES = new Set(['exam', 'deadline', 'holiday', 'birthday', 'anniversary']);

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
    scheduleEntries: [],
    scheduleLoading: false,
    scheduleError: null,
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
    modalAnimation: {},
    isScanning: false,
    aiPolling: false,
    aiScanPreview: null,
    aiScanError: null
  },

  onLoad() {
    this.initDate();
    this.loadTasks();
    this.loadSchedule();
  },

  onShow() {
    const app = getApp();
    app.syncTabBar(); // 使用全局同步方法
    this.loadTasks(); // 加载任务数据
    this.loadSchedule(); // 再次同步课表数据
  },

  onUnload() {
    this.clearAiPollingTimer();
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
    const courses = this.getScheduleEntries()
      .filter(c => c.day === dayOfWeek)
      .map(c => ({
        ...c,
        time: sectionsToTime(c.start, c.len)
      }))
      .sort((a, b) => a.start - b.start);

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
    const selectedDayCourses = this.getScheduleEntries()
      .filter(c => c.day === dayOfWeek)
      .map(c => ({
        ...c,
        time: sectionsToTime(c.start, c.len)
      }))
      .sort((a, b) => a.start - b.start);
    
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
    
    // 只筛选重要事件：考试、论文Deadline、假期、生日、自定义纪念日
    const importantEvents = this.data.tasks.filter(t => {
      const d = new Date(t.rawDeadline);
      return d.getFullYear() === year && d.getMonth() === month && this.isImportantEvent(t);
    });

    // 计算倒计时数据 - 事件视界
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const countdownEvents = importantEvents.map(event => {
      const eventDate = new Date(event.rawDeadline);
      eventDate.setHours(0, 0, 0, 0);
      const daysUntil = Math.ceil((eventDate - now) / (24 * 60 * 60 * 1000));
      
      // 计算引力场强度（越近的事件引力越强）
      let gravityStrength = 0;
      if (daysUntil >= 0 && daysUntil <= 30) {
        gravityStrength = Math.max(0, 1 - (daysUntil / 30));
      }
      
      // 计算连线终点位置
      const eventDay = eventDate.getDate();
      const connectToBottom = daysUntil >= 0 && daysUntil <= 7;
      
      return {
        ...event,
        daysUntil,
        gravityStrength,
        isPast: daysUntil < 0,
        isToday: daysUntil === 0,
        isNear: daysUntil >= 0 && daysUntil <= 7,
        eventDay,
        connectToBottom,
        eventHorizonType: this.getEventHorizonType(event)
      };
    }).sort((a, b) => a.daysUntil - b.daysUntil);

    // 获取心情打卡数据 - 心绪马赛克
    const moodData = this.getMoodDataForMonth(year, month);
    
    // 生成月度格子数据
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const calendarGrid = [];
    for(let i=1; i<=daysInMonth; i++) {
      const dStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
      const dateObj = new Date(dStr);
      
      // 查找当天的重要事件
      const dayEvents = countdownEvents.filter(event => {
        const eventDate = new Date(event.rawDeadline);
        return eventDate.getDate() === i;
      });
      
      // 查找当天的心情记录
      const moodRecord = moodData.find(m => m.date === dStr);
      
      // 计算引力场影响（来自附近的重要事件）
      let totalGravity = 0;
      let gravityDistortion = 0;
      countdownEvents.forEach(event => {
        const eventDate = new Date(event.rawDeadline);
        const eventDay = eventDate.getDate();
        const distance = Math.abs(i - eventDay);
        if (distance <= 3) { // 3天范围内有引力影响
          const gravityContribution = event.gravityStrength * (1 - distance / 3);
          totalGravity += gravityContribution;
          // 引力扭曲效果：越近的事件扭曲越强
          if (distance <= 1) {
            gravityDistortion = Math.max(gravityDistortion, gravityContribution * 0.3);
          }
        }
      });
      
      // 心绪马赛克效果
      let moodGlow = 0;
      let moodColor = null;
      if (moodRecord) {
        moodGlow = 1;
        moodColor = this.getMoodColor(moodRecord.mood);
      }
      
      calendarGrid.push({
        day: i,
        date: dStr,
        events: dayEvents,
        mood: moodRecord,
        moodGlow,
        moodColor,
        gravity: totalGravity,
        gravityDistortion,
        isToday: this.isToday(dateObj),
        isWeekend: dateObj.getDay() === 0 || dateObj.getDay() === 6,
        hasEventHorizon: dayEvents.length > 0,
        eventHorizonLines: dayEvents.map(event => ({
          type: event.eventHorizonType,
          connectToBottom: event.connectToBottom,
          gravityStrength: event.gravityStrength
        }))
      });
    }

    // 计算月度统计
    const stats = {
      totalEvents: importantEvents.length,
      nearEvents: countdownEvents.filter(e => e.isNear).length,
      completedEvents: importantEvents.filter(e => e.completed).length,
      moodDays: moodData.length,
      currentStreak: this.calculateCurrentStreak(moodData),
      monthMoodScore: this.calculateMonthMoodScore(moodData),
      perfectMoodDays: moodData.filter(m => m.mood === 'happy' || m.mood === 'productive').length
    };

    // 检查是否获得月度徽章
    const monthlyBadges = this.checkMonthlyBadges(moodData, importantEvents, year, month);

    this.setData({
      monthView: {
        calendarGrid,
        countdownEvents: countdownEvents.slice(0, 5), // 只显示最近5个
        eventHorizonEvents: countdownEvents.filter(e => e.daysUntil >= 0),
        stats,
        currentMonth: month,
        currentYear: year,
        monthlyBadges,
        showMoodCheckIn: this.shouldShowMoodCheckIn(year, month)
      }
    });
  },

  // 获取事件视界类型
  getEventHorizonType(event) {
    if (event.type === 'exam') return 'exam';
    if (event.type === 'deadline') return 'deadline';
    if (event.type === 'holiday') return 'holiday';
    if (event.type === 'birthday') return 'birthday';
    if (event.type === 'anniversary') return 'anniversary';
    return 'important';
  },

  // 获取心情颜色
  getMoodColor(mood) {
    const moodColors = {
      happy: '#FFD93D',      // 开心 - 黄色
      anxious: '#95A5A6',    // 焦虑 - 灰色
      productive: '#6BCF7F', // 充实 - 绿色
      tired: '#E08E79',      // 疲惫 - 橙色
      excited: '#DDA0DD',    // 兴奋 - 紫色
      calm: '#87CEEB'        // 平静 - 天蓝色
    };
    return moodColors[mood] || '#BDC3C7';
  },

  // 计算月度心情得分
  calculateMonthMoodScore(moodData) {
    if (!moodData.length) return 0;
    const moodScores = {
      happy: 5,
      productive: 4,
      calm: 3,
      excited: 4,
      anxious: 1,
      tired: 2
    };
    const totalScore = moodData.reduce((sum, mood) => sum + (moodScores[mood.mood] || 3), 0);
    return Math.round(totalScore / moodData.length * 10) / 10;
  },

  // 检查月度徽章
  checkMonthlyBadges(moodData, events, year, month) {
    const badges = [];
    
    // 全勤徽章
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    if (moodData.length === daysInMonth) {
      badges.push({
        id: 'perfect_attendance',
        name: '全勤大师',
        description: '整月完成心情打卡',
        icon: '🏆',
        color: '#FFD700'
      });
    }
    
    // 连续打卡徽章
    const currentStreak = this.calculateCurrentStreak(moodData);
    if (currentStreak >= 7) {
      badges.push({
        id: 'week_streak',
        name: '七日连击',
        description: '连续打卡7天',
        icon: '🔥',
        color: '#FF6347'
      });
    }
    
    // 高能量月度徽章
    const highEnergyDays = moodData.filter(m => m.mood === 'happy' || m.mood === 'productive').length;
    if (highEnergyDays >= daysInMonth * 0.7) {
      badges.push({
        id: 'high_energy',
        name: '能量满满',
        description: '70%以上日子状态良好',
        icon: '⚡',
        color: '#32CD32'
      });
    }
    
    // 事件征服者徽章
    const completedEvents = events.filter(e => e.completed).length;
    if (completedEvents >= 3) {
      badges.push({
        id: 'event_conqueror',
        name: '事件征服者',
        description: '完成多个重要事件',
        icon: '👑',
        color: '#9370DB'
      });
    }
    
    return badges;
  },

  // 是否应该显示心情打卡
  shouldShowMoodCheckIn(year, month) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // 昨天的日期
    const yesterdayKey = formatDateKey(yesterday);
    
    // 获取昨天的心情记录
    const moodData = this.getMoodDataForMonth(year, month);
    const yesterdayMood = moodData.find(m => m.date === yesterdayKey);
    
    // 如果昨天没有打卡且是最近2天内，显示打卡提醒
    const daysSinceYesterday = Math.floor((today - yesterday) / (24 * 60 * 60 * 1000));
    return !yesterdayMood && daysSinceYesterday <= 2;
  },

  // 获取心情数据
  getMoodDataForMonth(year, month) {
    const moodKey = `mood_${year}_${month}`;
    const savedMoods = wx.getStorageSync(moodKey) || [];
    return savedMoods;
  },

  // 判断是否为今天
  isToday(date) {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  },

  // 计算连续打卡天数
  calculateCurrentStreak(moodData) {
    if (!moodData.length) return 0;
    
    const sorted = [...moodData].sort((a, b) => new Date(b.date) - new Date(a.date));
    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < sorted.length; i++) {
      const moodDate = new Date(sorted[i].date);
      moodDate.setHours(0, 0, 0, 0);
      
      const diffDays = Math.floor((currentDate - moodDate) / (24 * 60 * 60 * 1000));
      
      if (diffDays === streak) {
        streak++;
      } else {
        break;
      }
    }
    
    return streak;
  },

  generateTimeSlots() {
    // 生成 8:00 - 20:00 的时间槽，并附带课程信息
    const slots = [];
    for (let i = 1; i <= 12; i++) { // 12节课
      const coursesInSlot = this.getScheduleEntries()
        .filter(c => c.start === i)
        .map(c => ({
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

  isImportantEvent(task) {
    if (!task) return false;
    if (task.isImportant) return true;
    return IMPORTANT_EVENT_TYPES.has(task.type);
  },

  shouldDisplayTaskOnDate(task, targetTs, targetKey) {
    if (!task) return false;
    const isImportantEvent = this.isImportantEvent(task);

    if (task.mode === 'instant' && !isImportantEvent) {
      return task.deadlineKey === targetKey;
    }

    const todayStart = this.getTodayStartTs();
    const visibleStart = Math.max(task.visibleFromTs || todayStart, todayStart);
    const deadlineLimit = task.deadlineTs || targetTs;
    return targetTs >= visibleStart && targetTs <= deadlineLimit;
  },

  getTimelineLabel(task, targetTs) {
    const isImportantEvent = this.isImportantEvent(task);
    if (task.mode === 'instant' && !isImportantEvent) {
      return formatTime(task.rawDeadline);
    }
    const diff = Math.max(0, Math.ceil(((task.deadlineTs || targetTs) - targetTs) / DAY_MS));
    return diff === 0 ? '今日截止' : `剩余${diff}天`;
  },

  decorateTaskForDate(task, targetTs, targetKey) {
    const isImportantEvent = this.isImportantEvent(task);
    let badge = '持续待办';
    if (isImportantEvent) {
      badge = '重要事件';
    } else if (task.mode === 'instant') {
      badge = '瞬时事件';
    }
    return {
      ...task,
      dayBadge: badge,
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
        const type = typeof row.type === 'string' ? row.type.toLowerCase() : 'homework';
        const isImportant = IMPORTANT_EVENT_TYPES.has(type) || !!row.is_important;
        const mode = type === 'homework' || isImportant ? 'persistent' : 'instant';
        const displayBadge = isImportant ? '重要事件' : (mode === 'instant' ? '瞬时事件' : '持续待办');
        const displayTime = mode === 'instant' ? `${month}.${day} ${hour}:${minute}` : `${month}.${day} 截止`;
        const deadlineTs = dueMidnight.getTime();
        const visibleFromTs = visibleFrom.getTime();
        const daysLeft = Math.max(0, Math.ceil((deadlineTs - todayStartTs) / DAY_MS));
        return {
          id: row.id,
          type,
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
          isImportant,
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
        const fallbackType = (t.type || 'homework').toLowerCase();
        const fallbackImportant = IMPORTANT_EVENT_TYPES.has(fallbackType) || !!t.isImportant;
        return {
          id: t.id || `mock-${idx}`,
          type: fallbackType,
          mode: fallbackType === 'homework' || fallbackImportant ? 'persistent' : 'instant',
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
          urgent: fallbackType !== 'homework',
          displayBadge: fallbackImportant
            ? '重要事件'
            : (fallbackType === 'homework' ? '持续待办' : '瞬时事件'),
          displayTime: '今天',
          deadlineTs,
          visibleFromTs: deadlineTs,
          daysLeft: 0,
          isImportant: fallbackImportant
        };
      });
      
      this.setData({
        tasks: fallback,
        loading: false,
        skeleton: false
      }, () => this.updateViewData());
    }
  },

  // === 心情打卡相关功能 ===
  
  // 保存心情打卡
  saveMoodCheckIn(e) {
    const { mood } = e.currentTarget.dataset;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = formatDateKey(yesterday);
    
    // 获取当前月份的心情数据
    const year = yesterday.getFullYear();
    const month = yesterday.getMonth();
    const moodKey = `mood_${year}_${month}`;
    const moodData = wx.getStorageSync(moodKey) || [];
    
    // 检查是否已经打卡
    const existingIndex = moodData.findIndex(m => m.date === yesterdayKey);
    if (existingIndex >= 0) {
      moodData[existingIndex].mood = mood;
    } else {
      moodData.push({
        date: yesterdayKey,
        mood: mood,
        timestamp: Date.now()
      });
    }
    
    // 保存心情数据
    wx.setStorageSync(moodKey, moodData);
    
    // 显示反馈
    wx.vibrateShort({ type: 'light' });
    wx.showToast({
      title: '打卡成功',
      icon: 'success'
    });
    
    // 关闭打卡弹窗并刷新视图
    this.setData({
      'monthView.showMoodCheckIn': false
    }, () => {
      this.updateViewData();
    });
  },

  // 跳过心情打卡
  skipMoodCheckIn() {
    this.setData({
      'monthView.showMoodCheckIn': false
    });
  },

  // 关闭心情打卡弹窗
  closeMoodCheckIn() {
    this.setData({
      'monthView.showMoodCheckIn': false
    });
  },

  async loadSchedule() {
    // 避免并发重复加载
    if (this._loadingSchedule) return;
    this._loadingSchedule = true;
    this.setData({ scheduleLoading: true });

    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId || wx.getStorageSync('user_id') || DEMO_USER_ID;
      if (!userId) {
        throw new Error('缺少用户信息');
      }

      const rows = await fetchWeekSchedule(userId);
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('课表为空');
      }

      const normalized = this.normalizeScheduleEntries(rows);
      wx.setStorageSync('week_schedule_cache', normalized);
      this.applyScheduleEntries(normalized);
      this.setData({ scheduleError: null });
    } catch (error) {
      console.warn('加载课表失败，使用缓存或兜底数据', error);
      const cached = wx.getStorageSync('week_schedule_cache');
      if (Array.isArray(cached) && cached.length) {
        this.applyScheduleEntries(cached.map((item) => ({ ...item })));
      } else {
        const fallback = this.normalizeScheduleEntries(FALLBACK_COURSES);
        this.applyScheduleEntries(fallback);
      }
      this.setData({ scheduleError: error?.message || '课表获取失败' });
    } finally {
      this.setData({ scheduleLoading: false });
      this._loadingSchedule = false;
    }
  },

  applyScheduleEntries(entries = []) {
    this.setData(
      {
        scheduleEntries: entries
      },
      () => {
        this.generateTimeSlots();
        this.updateViewData();
      }
    );
  },

  normalizeScheduleEntries(rows = []) {
    return rows.map((row, index) => {
      if (row && row.scheduleId && row.courseId && row.day && row.start) {
        return { ...row };
      }

      const scheduleId = row.id || row.schedule_id || `schedule-${index}`;
      const courseId = row.course_id || row.courseId || row.id || scheduleId;
      const paletteIndex = index % MORANDI_COLORS.length;
      const color = row.course_color || row.color || MORANDI_COLORS[paletteIndex];

      // 处理视图返回的数据结构
      const courseName = row.course_name || row.name || `课程${index + 1}`;
      const courseColor = row.course_color || color;
      const courseLocation = row.final_location || row.schedule_location || row.location || '待定';
      const courseTeacher = row.teacher || row.course_teacher || '';

      return {
        id: scheduleId,
        scheduleId,
        courseId,
        name: courseName,
        location: courseLocation,
        teacher: courseTeacher,
        day: Number(row.day_of_week || row.day || row.dayIdx || 1),
        start: Number(row.start_section || row.start || 1),
        len: Number(row.length || row.len || 1),
        color: courseColor,
        weeks: Array.isArray(row.weeks) && row.weeks.length ? row.weeks : DEFAULT_WEEKS
      };
    });
  },

  getScheduleEntries() {
    return Array.isArray(this.data.scheduleEntries) ? this.data.scheduleEntries : [];
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

  // 选择事件类型
  selectEventType(e) {
    const { type } = e.currentTarget.dataset;
    const currentType = this.data.taskForm.type;
    const nextType = currentType === type ? '' : type;
    this.setData({
      'taskForm.type': nextType,
      'taskForm.urgent': false
    });
    wx.vibrateShort({ type: 'light' });
  },

  // 切换紧急状态
  toggleUrgent() {
    const currentUrgent = this.data.taskForm.urgent || false;
    this.setData({
      'taskForm.type': '',
      'taskForm.urgent': !currentUrgent
    });
    wx.vibrateShort({ type: 'light' });
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
        related_course_id: null,
        type: '',
        urgent: false
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
        related_course_id: task.related_course_id || null,
        type: task.type || '',
        urgent: task.urgent || false
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
        related_course_id: null,
        type: '',
        urgent: false
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
      
      // 确定任务类型：优先使用用户选择的重要事件类型，否则使用默认类型
      let recordType = taskForm.type || '';
      if (!recordType) {
        recordType = taskForm.mode === 'instant' ? 'exam' : 'homework';
      }

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
    const courseEntry = this.getScheduleEntries().find(c => c.id === id || c.scheduleId === id);
    
    if (!courseEntry) {
      wx.showToast({ title: '课程信息未找到', icon: 'none' });
      return;
    }
    
    // 添加时间信息
    const course = {
      ...courseEntry,
      time: sectionsToTime(courseEntry.start, courseEntry.len)
    };
    
    // 查找相关任务
    const courseTasks = this.data.tasks.filter(task => {
      if (!task.related_course_id) return false;
      return task.related_course_id === course.courseId;
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

  // 从模拟数据中删除课程
  removeCourseFromMockData(courseId) {
    const entries = this.getScheduleEntries();
    const updatedEntries = entries.filter(entry => entry.courseId !== courseId);
    this.setData({ scheduleEntries: updatedEntries });
    wx.setStorageSync('week_schedule_cache', updatedEntries);
  },

  // 更新模拟数据中的课程
  updateMockCourse(courseId, updates) {
    const entries = this.getScheduleEntries();
    const updatedEntries = entries.map(entry => {
      if (entry.courseId === courseId) {
        return { ...entry, ...updates };
      }
      return entry;
    });
    this.setData({ scheduleEntries: updatedEntries });
    wx.setStorageSync('week_schedule_cache', updatedEntries);
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
      await this.loadSchedule();
      
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

  // 👁️ 点击"扫描课表"按钮触发 - 扫描图片识别课程表/待办事项
  async handleScanImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFiles?.[0]?.tempFilePath;
        if (!tempFilePath) return;

        this.clearAiPollingTimer();
        this.setData({
          isScanning: true,
          aiPolling: false,
          aiScanPreview: null,
          aiScanError: null
        });
        wx.showLoading({ title: '上传中...', mask: true });

        try {
          const fileName = `scan_${Date.now()}.jpg`;
          const { publicUrl } = await uploadToStorage('resources', tempFilePath, fileName);
          if (!publicUrl) throw new Error('图片上传失败');

          wx.showLoading({ title: '解析中...' });
          const app = getApp();
          const userId = app?.globalData?.supabase?.userId || DEMO_USER_ID;

          const cozeRes = await wx.cloud.callFunction({
            name: 'analyzeImage',
            data: {
              action: 'start',
              imageUrl: publicUrl,
              userId
            }
          });

          wx.hideLoading();
          this.setData({ isScanning: false });
          this.processAiStartResult(cozeRes?.result);
        } catch (error) {
          console.error('AI 流程失败', error);
          wx.hideLoading();
          this.setData({ isScanning: false, aiPolling: false, aiScanError: error.message || '解析失败' });
          wx.showToast({ title: error.message || '解析失败', icon: 'none' });
        }
      }
    });
  },

  processAiStartResult(result) {
    if (!result) {
      this.setData({ aiScanError: '云函数无响应' });
      wx.showToast({ title: '云函数无响应', icon: 'none' });
      return;
    }

    if (result.success && !result.pending) {
      this.consumeAiScanResult(result.data);
      return;
    }

    if (result.pending) {
      this.aiPollJob = {
        chatId: result.chatId,
        conversationId: result.conversationId
      };
      this.aiPollAttempts = 0;
      this.setData({ aiPolling: true, aiScanError: null });
      this.startAiPolling(result.retryAfter || 600);
      wx.showToast({ title: 'AI 解析中...', icon: 'loading', duration: 800 });
      return;
    }

    this.setData({ aiScanError: result.error || '解析失败' });
    wx.showToast({ title: result.error || '解析失败', icon: 'none' });
  },

  startAiPolling(delay = 600) {
    if (!this.aiPollJob?.chatId) return;
    this.clearAiPollingTimer(false);
    const baseInterval = Math.max(500, delay);
    const maxAttempts = Math.max(15, Math.ceil(20000 / baseInterval));

    const poll = async () => {
      if (!this.aiPollJob) return;
      if (this.aiPollAttempts >= maxAttempts) {
        this.setData({ aiPolling: false, aiScanError: 'AI 解析超时，请重试' });
        wx.showToast({ title: 'AI 解析超时', icon: 'none' });
        this.clearAiPollingTimer();
        return;
      }

      this.aiPollAttempts += 1;

      try {
        const pollRes = await wx.cloud.callFunction({
          name: 'analyzeImage',
          data: {
            action: 'poll',
            chatId: this.aiPollJob.chatId,
            conversationId: this.aiPollJob.conversationId
          }
        });

        const payload = pollRes?.result;
        if (payload?.success && !payload.pending) {
          this.consumeAiScanResult(payload.data);
          return;
        }

        if (!payload?.success && !payload?.pending) {
          this.setData({ aiPolling: false, aiScanError: payload?.error || 'AI 解析失败' });
          this.clearAiPollingTimer();
          wx.showToast({ title: payload?.error || 'AI 解析失败', icon: 'none' });
          return;
        }

        const nextIn = Math.max(500, payload?.retryAfter || baseInterval);
        this.aiPollTimer = setTimeout(poll, nextIn);
      } catch (error) {
        console.error('AI 轮询失败', error);
        this.aiPollTimer = setTimeout(poll, baseInterval);
      }
    };

    this.aiPollTimer = setTimeout(poll, baseInterval);
  },

  clearAiPollingTimer(resetJob = true) {
    if (this.aiPollTimer) {
      clearTimeout(this.aiPollTimer);
      this.aiPollTimer = null;
    }
    if (resetJob) {
      this.aiPollJob = null;
      this.aiPollAttempts = 0;
    }
  },
  consumeAiScanResult(rawData) {
    this.clearAiPollingTimer();
    if (!rawData) {
      this.setData({ aiScanError: 'AI 未返回数据', aiPolling: false });
      wx.showToast({ title: 'AI 未返回数据', icon: 'none' });
      return;
    }

    const normalized = this.normalizeAiScanResult(rawData);
    wx.vibrateShort({ type: 'medium' });
    this.setData({
      aiScanPreview: normalized,
      aiScanError: null,
      aiPolling: false
    });
    wx.showToast({ title: '解析成功', icon: 'success' });
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
      this.setData({ aiScanPreview: null });
    } catch (error) {
      console.error('导入失败', error);
      wx.hideLoading();
      wx.showToast({ title: error.message || '导入失败', icon: 'none' });
    }
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

  async importAiTasks(items = []) {
    const app = getApp();
    const userId = app?.globalData?.supabase?.userId || DEMO_USER_ID;
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
    const userId = app?.globalData?.supabase?.userId || DEMO_USER_ID;
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
      monday: 1,
      '周二': 2,
      '星期二': 2,
      二: 2,
      tuesday: 2,
      '周三': 3,
      '星期三': 3,
      三: 3,
      wednesday: 3,
      '周四': 4,
      '星期四': 4,
      四: 4,
      thursday: 4,
      '周五': 5,
      '星期五': 5,
      五: 5,
      friday: 5,
      '周六': 6,
      '星期六': 6,
      六: 6,
      saturday: 6,
      '周日': 7,
      '星期日': 7,
      日: 7,
      天: 7,
      sunday: 7
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
});
