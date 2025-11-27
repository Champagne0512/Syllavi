const { MORANDI_COLORS } = require('../../utils/colors');
const { fetchWeekSchedule, fetchTasks } = require('../../utils/supabase');

// 模拟课程数据 (实际开发中应从数据库加载)
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
        isToday: day.isToday, // 添加isToday属性
        tasks: dayTasks.map(t => ({
          id: t.id,
          title: t.title,
          time: formatTime(t.rawDeadline),
          type: t.type === 'exam' ? 'exam' : 'homework',
          completed: t.completed
        }))
      };
    });

    // 计算总任务数和是否有任务
    const totalWeekTasks = weekTasksByDay.reduce((sum, day) => sum + day.tasks.length, 0);
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

  // --- 原始数据加载 (保持 Supabase 逻辑) ---

  async loadTasks() {
    this.setData({ loading: true });
    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      const rows = await fetchTasks(userId);
      
      if (!rows || !rows.length) throw new Error('empty');

      const tasks = rows.map((row, idx) => {
        const d = new Date(row.deadline);
        const month = `${d.getMonth() + 1}`.padStart(2, '0');
        const day = `${d.getDate()}`.padStart(2, '0');
        const hour = `${d.getHours()}`.padStart(2, '0');
        const minute = `${d.getMinutes()}`.padStart(2, '0');
        const deadlineStr = `${month}.${day} ${hour}:${minute}`;
        const deadlineKey = formatDateKey(d);

        return {
          id: row.id,
          type: row.type,
          title: row.title,
          deadline: deadlineStr,
          rawDeadline: row.deadline,
          deadlineKey,
          description: row.description,
          progress: row.is_completed ? 1 : 0,
          course: row.related_course_id?.slice(0, 4)?.toUpperCase() || 'GEN',
          accent: MORANDI_COLORS[idx % MORANDI_COLORS.length],
          completed: row.is_completed,
          urgent: row.type === 'exam' // 简单标记
        };
      });
      
      this.setData({ tasks, loading: false, skeleton: false }, () => {
        this.updateViewData(); // 数据加载后刷新视图
      });
      wx.setStorageSync('tasks_cache', tasks);
    } catch (err) {
      console.warn('Fallback tasks', err);
      const cached = wx.getStorageSync('tasks_cache');
      const fallback = cached && cached.length ? cached : MOCK_TASKS.map(t => {
        const now = new Date();
        return {
          ...t,
          accent: '#9BB5CE',
          rawDeadline: now.toISOString(),
          deadlineKey: formatDateKey(now),
          deadline: 'Today'
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
    const { value } = e.detail;
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
  saveCourse() {
    const { courseForm, editingCourse } = this.data;
    
    if (!courseForm.name.trim()) {
      wx.showToast({ title: '请输入课程名称', icon: 'none' });
      return;
    }

    if (editingCourse.isNew) {
      // 保存新课程
      this.saveNewCourse();
    } else {
      // 更新现有课程
      const courseIndex = MOCK_COURSES.findIndex(c => c.id === editingCourse.id);
      if (courseIndex !== -1) {
        MOCK_COURSES[courseIndex] = {
          ...MOCK_COURSES[courseIndex],
          ...courseForm
        };
        
        // 刷新时间槽数据
        this.generateTimeSlots();
        this.updateViewData();
        
        wx.showToast({ title: '课程已更新', icon: 'success' });
        this.closeCourseEditor();
        this.closeCourseDetail();
      }
    }
  },

  // 删除课程
  deleteCourse() {
    const { selectedCourse } = this.data;
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除课程"${selectedCourse.name}"吗？此操作不可撤销。`,
      confirmColor: '#FF3B30',
      success: (res) => {
        if (res.confirm) {
          // 从模拟数据中删除
          const courseIndex = MOCK_COURSES.findIndex(c => c.id === selectedCourse.id);
          if (courseIndex !== -1) {
            MOCK_COURSES.splice(courseIndex, 1);
            
            // 刷新时间槽数据
            this.generateTimeSlots();
            this.updateViewData();
            
            wx.showToast({ title: '课程已删除', icon: 'success' });
            this.closeCourseDetail();
          }
        }
      }
    });
  },

  // 添加课程
  addCourse() {
    wx.vibrateShort({ type: 'light' });
    
    // 生成新课程ID
    const newId = 'c' + Date.now();
    
    this.setData({
      showCourseEditor: true,
      editingCourse: { id: newId, isNew: true },
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
  saveNewCourse() {
    const { courseForm } = this.data;
    
    if (!courseForm.name.trim()) {
      wx.showToast({ title: '请输入课程名称', icon: 'none' });
      return;
    }

    // 创建新课程
    const newCourse = {
      id: 'c' + Date.now(),
      name: courseForm.name,
      location: courseForm.location,
      teacher: courseForm.teacher,
      color: courseForm.color,
      day: courseForm.day,
      start: courseForm.start,
      len: courseForm.len
    };

    // 添加到模拟数据
    MOCK_COURSES.push(newCourse);
    
    // 刷新界面
    this.generateTimeSlots();
    this.updateViewData();
    
    wx.showToast({ title: '课程添加成功', icon: 'success' });
    this.closeCourseEditor();
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
