// 课程表工具函数

// 内联年级选项，避免模块依赖问题
const ALLOWED_GRADES = ['大一', '大二', '大三', '大四', '研一', '研二', '研三', '博士'];

// 节次时间表
const SECTION_TABLE = [
  { start: '08:00', end: '08:45', label: '第1节' },
  { start: '08:55', end: '09:40', label: '第2节' },
  { start: '10:00', end: '10:45', label: '第3节' },
  { start: '10:55', end: '11:40', label: '第4节' },
  { start: '14:00', end: '14:45', label: '第5节' },
  { start: '14:55', end: '15:40', label: '第6节' },
  { start: '16:00', end: '16:45', label: '第7节' },
  { start: '16:55', end: '17:40', label: '第8节' },
  { start: '18:30', end: '19:15', label: '第9节' },
  { start: '19:25', end: '20:10', label: '第10节' }
];

// 星期标签
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// 月份标签
const MONTH_LABELS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

// 格式化时间
function formatTime(date) {
  return date.toTimeString().slice(0, 5);
}

// 格式化日期
function formatDate(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

// 获取星期几
function getWeekday(date) {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1; // 转换为周一=0的格式
}

// 获取一周的开始和结束日期
function getWeekRange(date = new Date()) {
  const weekStart = new Date(date);
  const day = weekStart.getDay();
  const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
  weekStart.setDate(diff);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  
  return { weekStart, weekEnd };
}

// 生成一周的日期数组
function generateWeekDates(baseDate = new Date()) {
  const { weekStart } = getWeekRange(baseDate);
  const dates = [];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    dates.push({
      date,
      day: WEEKDAYS[i],
      dateStr: `${date.getMonth() + 1}/${date.getDate()}`,
      isToday: isToday(date),
      isWeekend: i >= 5
    });
  }
  
  return dates;
}

// 判断是否为今天
function isToday(date) {
  const today = new Date();
  return date.getDate() === today.getDate() &&
         date.getMonth() === today.getMonth() &&
         date.getFullYear() === today.getFullYear();
}

// 将节次转换为时间范围
function sectionsToTime(startSection = 1, length = 2) {
  const start = SECTION_TABLE[startSection - 1]?.start || '08:00';
  const endSectionIndex = Math.min(SECTION_TABLE.length - 1, startSection - 1 + length);
  const end = SECTION_TABLE[endSectionIndex]?.end || '09:40';
  return `${start} - ${end}`;
}

// 计算课程位置
function calculateSectionPosition(startSection, length = 1) {
  const totalHeight = 400; // 总高度 (rpx)
  const sectionHeight = totalHeight / SECTION_TABLE.length;
  
  const top = (startSection - 1) * sectionHeight;
  const height = length * sectionHeight;
  
  return { top: `${top}rpx`, height: `${height}rpx` };
}

// 按日期分组课程
function groupCoursesByDate(courses, date) {
  const dayOfWeek = getWeekday(date);
  return courses.filter(course => course.day_of_week === dayOfWeek + 1);
}

// 获取月度统计
function getMonthlyStats(tasks, courses, date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  
  const monthTasks = tasks.filter(task => {
    const deadline = new Date(task.deadline);
    return deadline >= monthStart && deadline <= monthEnd;
  });
  
  const monthCourses = courses.filter(course => {
    const schedules = course.schedules || [];
    return schedules.some(schedule => {
      // 简化处理，假设课程在整个月都有效
      return true;
    });
  });
  
  return {
    taskCount: monthTasks.length,
    completedTasks: monthTasks.filter(t => t.is_completed).length,
    courseCount: monthCourses.length,
    examCount: monthTasks.filter(t => t.type === 'exam').length
  };
}

// 生成月度热力图数据
function generateMonthHeatmap(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const heatmap = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    heatmap.push({
      date: dateStr,
      level: 0, // 0-4，表示活跃度
      count: 0
    });
  }

  return heatmap;
}

module.exports = {
  SECTION_TABLE,
  WEEKDAYS,
  MONTH_LABELS,
  formatTime,
  formatDate,
  getWeekday,
  getWeekRange,
  generateWeekDates,
  isToday,
  sectionsToTime,
  calculateSectionPosition,
  groupCoursesByDate,
  getMonthlyStats,
  generateMonthHeatmap
};