import { MORANDI_COLORS } from '../../utils/colors';
import { fetchWeekSchedule } from '../../utils/supabase';

const mockCourses = [
  { name: '高等数学', time: '08:00 - 09:40', location: 'A3-302' },
  { name: '计算机网络', time: '10:00 - 11:40', location: '信息楼 401' },
  { name: '文学批评', time: '14:00 - 15:40', location: '文科楼 210' },
  { name: 'AI 工程实践', time: '16:00 - 18:00', location: '创新中心' }
];

const SECTION_TABLE = [
  { start: '08:00', end: '08:45' },
  { start: '08:55', end: '09:40' },
  { start: '10:00', end: '10:45' },
  { start: '10:55', end: '11:40' },
  { start: '14:00', end: '14:45' },
  { start: '14:55', end: '15:40' },
  { start: '16:00', end: '16:45' },
  { start: '16:55', end: '17:40' },
  { start: '18:30', end: '19:15' },
  { start: '19:25', end: '20:10' }
];

const DEFAULT_EVENTS = [
  { label: 'Exam · 计组', time: '周四 13:30', tone: '#C9A5A0' },
  { label: 'Deadline · 设计报告', time: '23:59', tone: '#1148C4' }
];

const DEFAULT_ROOMS = [
  { building: '图书馆 4F', tag: '静音区', status: '空闲 (1.5h)' },
  { building: '信息楼 203', tag: '插座丰富', status: '空闲 (2h)' }
];

const DEFAULT_MONTH_HEAT = [2, 5, 1, 4, 0, 3];

function sectionsToTime(startSection = 1, length = 2) {
  const start = SECTION_TABLE[startSection - 1]?.start || '08:00';
  const endSectionIndex = Math.min(
    SECTION_TABLE.length - 1,
    startSection - 1 + length
  );
  const end = SECTION_TABLE[endSectionIndex]?.end || '09:40';
  return `${start} - ${end}`;
}

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
  async bootstrap() {
    await this.loadScheduleFromSupabase();
  },
  async loadScheduleFromSupabase() {
    this.setData({ skeleton: true });
    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      const rows = await fetchWeekSchedule(userId);
      if (!rows || !rows.length) {
        throw new Error('empty dataset');
      }
      const schedule = rows.map((row, idx) => ({
        id: row.id || idx,
        name: row.course?.name || `课程 ${idx + 1}`,
        time: sectionsToTime(row.start_section, row.length),
        location: row.course?.location || '待定教室',
        color: row.course?.color || MORANDI_COLORS[idx % MORANDI_COLORS.length]
      }));
      this.setData({
        skeleton: false,
        schedule,
        dayEvents: DEFAULT_EVENTS,
        monthHeat: DEFAULT_MONTH_HEAT,
        emptyRooms: DEFAULT_ROOMS
      });
    } catch (err) {
      console.warn('Supabase schedule fallback', err);
      this.useMockSchedule();
    }
  },
  useMockSchedule() {
    const schedule = mockCourses.map((course, idx) => ({
      ...course,
      id: idx,
      color: MORANDI_COLORS[idx % MORANDI_COLORS.length]
    }));

    this.setData({
      skeleton: false,
      schedule,
      dayEvents: DEFAULT_EVENTS,
      monthHeat: DEFAULT_MONTH_HEAT,
      emptyRooms: DEFAULT_ROOMS
    });
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
