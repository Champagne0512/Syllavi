const { fetchRoomReports, createRoomReport, fetchFocusStats } = require('../../utils/supabase');

// 模拟空教室数据
const DEFAULT_ROOMS = [
  { building: '图书馆 4F', tag: '静音区', status: '空闲 (1.5h)' },
  { building: '信息楼 203', tag: '插座丰富', status: '空闲 (2h)' },
  { building: '教学楼 A301', tag: '小教室', status: '空闲 (3h)' },
  { building: '实验楼 105', tag: '设备齐全', status: '空闲 (1h)' }
];

Page({
  data: {
    emptyRooms: [],
    focusStats: {
      todayFocus: 0,
      totalSessions: 0,
      streakDays: 0
    },
    loading: false
  },

  onLoad() {
    this.loadRoomReports();
    this.loadFocusStats();
  },

  onShow() {
    if (this.getTabBar && this.getTabBar()) {
      this.getTabBar().setSelected(2); // 工具模块在导航栏的索引
    }
  },

  // 加载空教室数据
  async loadRoomReports() {
    this.setData({ loading: true });
    try {
      const reports = await fetchRoomReports();
      this.setData({ 
        emptyRooms: reports.length > 0 ? reports.slice(0, 4) : DEFAULT_ROOMS,
        loading: false 
      });
    } catch (error) {
      console.error('Load room reports failed:', error);
      this.setData({ 
        emptyRooms: DEFAULT_ROOMS,
        loading: false 
      });
    }
  },

  // 加载专注统计数据
  async loadFocusStats() {
    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      if (userId) {
        const stats = await fetchFocusStats(userId);
        this.setData({
          focusStats: {
            todayFocus: stats.today_minutes || 0,
            totalSessions: stats.total_sessions || 0,
            streakDays: stats.streak_days || 0
          }
        });
      }
    } catch (error) {
      console.error('Load focus stats failed:', error);
    }
  },

  // 标记空教室
  async markRoom() {
    wx.showActionSheet({
      itemList: ['图书馆', '教学楼', '实验楼', '其他'],
      success: async (res) => {
        const buildings = ['图书馆', '教学楼', '实验楼', '其他'];
        const building = buildings[res.tapIndex];
        
        try {
          await createRoomReport({
            building,
            room_name: `自主标记`,
            floor: 1,
            status: 'available'
          });
          
          wx.showToast({
            title: '标记成功',
            icon: 'success'
          });
          
          // 刷新空教室列表
          this.loadRoomReports();
        } catch (error) {
          wx.showToast({
            title: '标记失败',
            icon: 'none'
          });
        }
      }
    });
  },

  // 刷新教室列表
  refreshRooms() {
    wx.vibrateShort({ type: 'light' });
    this.loadRoomReports();
    wx.showToast({
      title: '刷新成功',
      icon: 'success'
    });
  },

  // 跳转到专注页面
  goToFocus() {
    wx.vibrateShort({ type: 'light' });
    wx.navigateTo({
      url: '/pages/focus/index'
    });
  },

  // 跳转到教室详情
  goToRoomDetail(e) {
    const room = e.currentTarget.dataset.room;
    wx.vibrateShort({ type: 'light' });
    wx.showModal({
      title: room.building,
      content: `标签：${room.tag}\\n状态：${room.status}\\n\\n详细功能开发中...`,
      showCancel: false
    });
  },

  // 开发中提示
  comingSoon() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  }
});
