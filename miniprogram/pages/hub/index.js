import { MORANDI_COLORS } from '../../utils/colors';

const mockCourses = [
  { name: '高等数学', time: '08:00 - 09:40', location: 'A3-302' },
  { name: '计算机网络', time: '10:00 - 11:40', location: '信息楼 401' },
  { name: '文学批评', time: '14:00 - 15:40', location: '文科楼 210' },
  { name: 'AI 工程实践', time: '16:00 - 18:00', location: '创新中心' }
];

Page({
  data: {
    viewMode: 'week',
    timelineOffset: 0,
    weekIndex: 6,
    skeleton: true,
    schedule: [],
    dayEvents: [],
    monthHeat: [],
    focusCourse: null,
    emptyRooms: [],
    timelineStyle: ''
  },
  onLoad() {
    this.bootstrap();
    this.timelineTicker = setInterval(() => {
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      const offset = Math.min(100, Math.max(0, (minutes / (24 * 60)) * 100));
      this.setData({ timelineStyle: `top:${offset}%` });
    }, 60000);
  },
  onShow() {
    if (this.getTabBar && this.getTabBar()) {
      this.getTabBar().setSelected(0);
    }
  },
  onUnload() {
    clearInterval(this.timelineTicker);
  },
  bootstrap() {
    setTimeout(() => {
      const schedule = mockCourses.map((course, idx) => ({
        ...course,
        id: idx,
        color: MORANDI_COLORS[idx % MORANDI_COLORS.length]
      }));

      this.setData({
        skeleton: false,
        schedule,
        dayEvents: [
          { label: 'Exam · 计组', time: '周四 13:30', tone: '#C9A5A0' },
          { label: 'Deadline · 设计报告', time: '23:59', tone: '#1148C4' }
        ],
        monthHeat: [2, 5, 1, 4, 0, 3],
        emptyRooms: [
          { building: '图书馆 4F', tag: '静音区', status: '空闲 (1.5h)' },
          { building: '信息楼 203', tag: '插座丰富', status: '空闲 (2h)' }
        ]
      });
    }, 900);
  },
  switchView(e) {
    const { mode } = e.currentTarget.dataset;
    if (mode === this.data.viewMode) return;
    wx.vibrateShort({ type: 'light' });
    this.setData({ viewMode: mode });
  },
  handleWeekChange(e) {
    const direction = e.detail.deltaX > 0 ? -1 : 1;
    const nextIndex = Math.max(1, this.data.weekIndex + direction);
    this.setData({ weekIndex: nextIndex });
  },
  handleCourseOpen(e) {
    const { course } = e.detail;
    this.setData({ focusCourse: course });
    wx.navigateTo({
      url: `/pages/focus/index?course=${encodeURIComponent(course.name)}`
    });
  },
  handleCoursePin() {
    wx.showToast({
      title: '已高亮本节课',
      icon: 'none'
    });
  }
});
