import { MORANDI_COLORS } from '../../utils/colors';
import {
  fetchWeekSchedule,
  fetchTasks,
  fetchRoomReports,
  createRoomReport
} from '../../utils/supabase';

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

function buildDayEventsFromTasks(rows) {
  if (!Array.isArray(rows) || !rows.length) return DEFAULT_EVENTS;
  const now = new Date();
  const todayStr = now.toDateString();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = tomorrow.toDateString();

  const events = [];

  rows.forEach((row) => {
    if (!row.deadline) return;
    const d = new Date(row.deadline);
    if (Number.isNaN(d.getTime())) return;
    const dateStr = d.toDateString();
    const hh = `${d.getHours()}`.padStart(2, '0');
    const mm = `${d.getMinutes()}`.padStart(2, '0');
    const timeLabel = `${hh}:${mm}`;
    const prefix = row.type === 'exam' ? 'Exam' : 'Deadline';
    const label = `${prefix} · ${row.title}`;
    const baseTone = row.type === 'exam' ? '#C9A5A0' : '#FF5C00';

    if (dateStr === todayStr) {
      events.push({ label, time: timeLabel, tone: baseTone });
    } else if (dateStr === tomorrowStr) {
      events.push({
        label: `${label}（明日）`,
        time: `明日 ${timeLabel}`,
        tone: '#9BB5CE'
      });
    }
  });

  return events.length ? events : DEFAULT_EVENTS;
}

Page({
  data: {
    viewMode: 'week',
    timelineOffset: 0,
    weekIndex: 1,
    skeleton: true,
    schedule: [],
    allSchedule: [],
    dayEvents: [],
    monthHeat: [],
    focusCourse: null,
    emptyRooms: [],
    timelineStyle: '',
    profile: {
      nickname: '同学',
      avatar_url: ''
    }
  },
  onLoad() {
    const token = wx.getStorageSync('access_token');
    const userId =
      wx.getStorageSync('user_id') || wx.getStorageSync('syllaby_user_id');
    if (!token && !userId) {
      // 首次进入且未登录，跳转到登录页
      wx.reLaunch({ url: '/pages/login/index' });
      return;
    }
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
  onTouchStart(e) {
    this.startX = e.changedTouches && e.changedTouches.length
      ? e.changedTouches[0].clientX
      : 0;
  },
  onTouchEnd(e) {
    const endX = e.changedTouches && e.changedTouches.length
      ? e.changedTouches[0].clientX
      : 0;
    const deltaX = endX - (this.startX || 0);
    if (Math.abs(deltaX) > 50) {
      this.handleWeekChange(deltaX);
    }
  },
  async bootstrap() {
    await this.loadScheduleFromSupabase();
    this.loadTasksForToday();
    this.loadEmptyRooms();
    this.loadProfile();
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
        location: row.location || row.course?.location || '待定教室',
        color: row.course?.color || MORANDI_COLORS[idx % MORANDI_COLORS.length],
        dayOfWeek: row.day_of_week,
        startSection: row.start_section,
        length: row.length,
        weeks: row.weeks || []
      }));
      this.setData({
        skeleton: false,
        schedule,
        allSchedule: schedule,
        dayEvents: DEFAULT_EVENTS,
        monthHeat: DEFAULT_MONTH_HEAT,
        emptyRooms: DEFAULT_ROOMS
      });
      // 缓存一份数据用于离线查看
      wx.setStorageSync('hub_schedule', schedule);
    } catch (err) {
      console.warn('Supabase schedule fallback', err);
      const cached = wx.getStorageSync('hub_schedule');
      if (cached && cached.length) {
        this.setData({
          skeleton: false,
          schedule: cached,
          allSchedule: cached
        });
        this.applyViewMode(this.data.viewMode);
      } else {
        this.useMockSchedule();
      }
    }
  },
  useMockSchedule() {
    const schedule = mockCourses.map((course, idx) => ({
      ...course,
      id: idx,
      color: MORANDI_COLORS[idx % MORANDI_COLORS.length],
      dayOfWeek: (idx % 5) + 1,
      startSection: 2 * idx + 1,
      length: 2
    }));

    this.setData(
      {
        skeleton: false,
        schedule,
        allSchedule: schedule,
        dayEvents: DEFAULT_EVENTS,
        monthHeat: DEFAULT_MONTH_HEAT,
        emptyRooms: DEFAULT_ROOMS
      },
      () => {
        // 确保切换到日视图时有数据
        this.applyViewMode(this.data.viewMode);
      }
    );
  },
  switchView(e) {
    const { mode } = e.currentTarget.dataset;
    if (mode === this.data.viewMode) return;
    wx.vibrateShort({ type: 'light' });
    this.setData({ viewMode: mode });
    this.applyViewMode(mode);
  },
  handleWeekChange(deltaX) {
    const direction = deltaX > 0 ? -1 : 1;
    const nextIndex = Math.max(1, this.data.weekIndex + direction);
    this.setData({ weekIndex: nextIndex }, () => {
      this.applyViewMode(this.data.viewMode);
    });
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
  },
  applyViewMode(mode) {
    const { allSchedule, weekIndex } = this.data;
    if (mode === 'week') {
      const weekCourses = allSchedule.filter((c) =>
        Array.isArray(c.weeks) && c.weeks.length
          ? c.weeks.indexOf(weekIndex) !== -1
          : true
      );
      this.setData({ schedule: weekCourses });
      return;
    }
    if (mode === 'day') {
      const today = new Date().getDay() || 7;
      const todayCourses = allSchedule.filter((c) => {
        const matchDay = c.dayOfWeek === today;
        const matchWeek =
          !Array.isArray(c.weeks) || !c.weeks.length
            ? true
            : c.weeks.indexOf(weekIndex) !== -1;
        return matchDay && matchWeek;
      });
      this.setData({ schedule: todayCourses });
      return;
    }
    if (mode === 'month') {
      // 月视图目前只依赖 monthHeat，schedule 不强制清空
      return;
    }
  },
  async loadTasksForToday() {
    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      const rows = await fetchTasks(userId);
      const events = buildDayEventsFromTasks(rows || []);
      this.setData({ dayEvents: events });
      wx.setStorageSync('hub_day_events', events);
    } catch (err) {
      console.warn('load tasks for hub failed', err);
      const cached = wx.getStorageSync('hub_day_events');
      this.setData({ dayEvents: cached && cached.length ? cached : DEFAULT_EVENTS });
    }
  },
  async loadEmptyRooms() {
    try {
      const rows = await fetchRoomReports();
      if (!rows || !rows.length) {
        this.setData({ emptyRooms: DEFAULT_ROOMS });
        return;
      }
      const now = Date.now();
      const rooms = rows.map((row) => {
        const expires = row.expires_at ? new Date(row.expires_at).getTime() : now;
        const minutesLeft = Math.max(
          0,
          Math.round((expires - now) / (60 * 1000))
        );
        const tag =
          Array.isArray(row.features) && row.features.length
            ? row.features.join(' · ')
            : '自习友好';
        let statusLabel = '状态未知';
        if (row.status === 'available') {
          statusLabel =
            minutesLeft > 0 ? `空闲 (${Math.round(minutesLeft / 30) * 0.5}h)` : '即将占用';
        } else if (row.status === 'occupied') {
          statusLabel = '有人上课';
        }
        return {
          building: row.building || '教学楼',
          tag,
          status: statusLabel
        };
      });
      this.setData({ emptyRooms: rooms });
      wx.setStorageSync('hub_empty_rooms', rooms);
    } catch (err) {
      console.warn('load room reports failed', err);
      const cached = wx.getStorageSync('hub_empty_rooms');
      this.setData({ emptyRooms: cached && cached.length ? cached : DEFAULT_ROOMS });
    }
  },
  markRoom() {
    wx.showModal({
      title: '标记空教室',
      content: '请输入教学楼和教室号，例如「信息楼 203」。',
      editable: true,
      placeholderText: '例如：信息楼 203',
      success: async (res) => {
        const value = (res.content || '').trim();
        if (!res.confirm || !value) return;
        const parts = value.split(/\s+/);
        const building = parts[0];
        const roomName = parts.slice(1).join(' ') || '自习教室';
        const app = getApp();
        const userId = app?.globalData?.supabase?.userId;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 默认2小时

        wx.showLoading({ title: '提交中...' });
        try {
          await createRoomReport({
            reported_by: userId,
            building,
            room_name: roomName,
            status: 'available',
            features: ['静音区'],
            expires_at: expiresAt.toISOString()
          });
          wx.hideLoading();
          wx.showToast({ title: '已标记', icon: 'success' });
          this.loadEmptyRooms();
        } catch (err) {
          console.warn('create room report failed', err);
          wx.hideLoading();
          wx.showToast({ title: '标记失败', icon: 'none' });
        }
      }
    });
  },

  async loadProfile() {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      const cachedProfile = wx.getStorageSync('profile');
      
      if (cachedProfile) {
        this.setData({ profile: cachedProfile });
      }

      // 获取微信用户信息作为默认值
      this.setData({
        profile: {
          nickname: userInfo?.nickName || '同学',
          avatar_url: userInfo?.avatarUrl || ''
        }
      });
    } catch (err) {
      console.warn('load profile failed', err);
    }
  },

  // 跳转到个人主页
  goToProfile() {
    wx.navigateTo({
      url: '/pages/profile/index'
    });
  }
});
