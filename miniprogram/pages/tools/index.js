const { fetchFocusStats } = require('../../utils/supabase');
const focusService = require('../../utils/focusService');

const FOCUS_PRESETS = [
  { id: 'warmup', label: '暖身 15′', desc: '进入状态', minutes: 15 },
  { id: 'flow', label: '经典 45′', desc: '番茄节奏', minutes: 45 },
  { id: 'deep', label: '深潜 75′', desc: '单段冲刺', minutes: 75 }
];

Page({
  data: {
    focusStats: {
      todayFocus: 0,
      totalSessions: 0,
      streakDays: 0
    },
    heatmapData: [],
    distributionData: [],
    achievements: [],
    achievementsMeta: {
      unlocked: 0,
      total: 0
    },
    insightList: [],
    focusPills: FOCUS_PRESETS,
    showStats: false
  },

  onLoad() {
    this.loadFocusData();
  },

  onShow() {
    if (this.getTabBar && this.getTabBar()) {
      this.getTabBar().setSelected(2);
    }
    this.loadFocusData();
  },

  // 加载专注数据
  async loadFocusData() {
    try {
      // 从本地服务获取数据
      const stats = focusService.getStats();
      const achievements = this.normalizeAchievements(focusService.getAchievements());
      const heatmapData = focusService.getHeatmapData();
      const distributionData = focusService.getHourlyDistribution();
      const insightList = this.buildInsights(stats);
      const achievementsMeta = {
        unlocked: achievements.filter(item => item.unlocked).length,
        total: achievements.length
      };
      
      this.setData({
        focusStats: {
          todayFocus: stats.todayMinutes,
          totalSessions: stats.totalSessions,
          streakDays: stats.streakDays
        },
        achievements,
        achievementsMeta,
        insightList,
        heatmapData: heatmapData,
        distributionData: distributionData,
        showStats: true
      });

      // 同时尝试从远程获取数据
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      if (userId) {
        const remoteStats = await fetchFocusStats(userId);
        // 如果远程数据更新，则使用远程数据
        if (remoteStats && remoteStats.today_minutes !== undefined) {
          this.setData({
            focusStats: {
              todayFocus: remoteStats.today_minutes,
              totalSessions: remoteStats.total_sessions,
              streakDays: remoteStats.streak_days
            }
          });
        }
      }
    } catch (error) {
      console.error('Load focus data failed:', error);
      // 即使远程失败，本地数据仍然可用
      const stats = focusService.getStats();
      const achievements = this.normalizeAchievements(focusService.getAchievements());
      const heatmapData = focusService.getHeatmapData();
      const distributionData = focusService.getHourlyDistribution();
      const insightList = this.buildInsights(stats);
      const achievementsMeta = {
        unlocked: achievements.filter(item => item.unlocked).length,
        total: achievements.length
      };
      
      this.setData({
        focusStats: {
          todayFocus: stats.todayMinutes,
          totalSessions: stats.totalSessions,
          streakDays: stats.streakDays
        },
        achievements,
        achievementsMeta,
        insightList,
        heatmapData: heatmapData,
        distributionData: distributionData,
        showStats: true
      });
    }
  },

  normalizeAchievements(map = {}) {
    return Object.keys(map).map(key => ({
      key,
      ...map[key],
      info: focusService.getAchievementInfo(key)
    }));
  },

  buildInsights(stats = {}) {
    const totalMinutes = stats.totalMinutes || 0;
    const totalSessions = stats.totalSessions || 0;
    const longestSession = stats.longestSession || 0;
    const streakDays = stats.streakDays || 0;
    const todayMinutes = stats.todayMinutes || 0;
    const remainingToHour = Math.max(60 - todayMinutes, 0);

    return [
      {
        id: 'total',
        label: '累计专注',
        value: focusService.formatMinutes(totalMinutes),
        hint: `${totalSessions} 次记录`
      },
      {
        id: 'streak',
        label: '连续天数',
        value: `${streakDays} 天`,
        hint: streakDays >= 7 ? '周战士养成中' : '向 7 天挑战'
      },
      {
        id: 'longest',
        label: '最长单次',
        value: focusService.formatMinutes(longestSession),
        hint: longestSession >= 60 ? '保持深度' : '尝试 60+ 分钟'
      },
      {
        id: 'today',
        label: '今日状态',
        value: focusService.formatMinutes(todayMinutes),
        hint: remainingToHour > 0 ? `距 1 小时差 ${focusService.formatMinutes(remainingToHour)}` : '今日已满 1 小时'
      }
    ];
  },

  // 热力图日期点击
  onHeatmapDayTap(e) {
    const { date, minutes } = e.detail;
    if (minutes > 0) {
      wx.showModal({
        title: '专注记录',
        content: `${date}\n专注时长：${focusService.formatMinutes(minutes)}`,
        showCancel: false
      });
    }
  },

  // 时段分布点击
  onDistributionHourTap(e) {
    const { hour, data } = e.detail;
    if (data.minutes > 0) {
      wx.showModal({
        title: '时段统计',
        content: `${data.label}\n专注时长：${focusService.formatMinutes(data.minutes)}`,
        showCancel: false
      });
    }
  },

  // 徽章点击
  onBadgeTap(e) {
    const { achievement, info } = e.detail;
    wx.vibrateShort({ type: 'light' });
    wx.showModal({
      title: info.name,
      content: `${info.desc}\n${achievement.unlocked ? '已解锁' : '未解锁'}`,
      showCancel: false
    });
  },

  // 跳转到专注页面
  goToFocus() {
    wx.vibrateShort({ type: 'light' });
    wx.navigateTo({
      url: '/pages/focus/index'
    });
  },

  goToPresetFocus(e) {
    const minutes = Number(e?.currentTarget?.dataset?.minutes);
    wx.vibrateShort({ type: 'light' });
    const query = Number.isFinite(minutes) && minutes > 0 ? `?minutes=${minutes}` : '';
    wx.navigateTo({
      url: `/pages/focus/index${query}`
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
