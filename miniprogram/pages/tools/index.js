const { fetchFocusStats, fetchFocusHeatmapRemote, fetchFocusDistributionRemote, fetchRemoteAchievementsSnapshot } = require('../../utils/supabase');
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
    showStats: false,
    showAchievementModal: false,
    selectedAchievement: null
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
      const heatmapSummary = this.buildHeatmapSummary(heatmapData);
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
        heatmapSummary,
        showStats: true
      });

      // 同时尝试从远程获取数据
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      if (userId) {
        const [remoteStats, heatmapRows, distributionRows, achievementRows] = await Promise.all([
          fetchFocusStats(userId),
          fetchFocusHeatmapRemote(userId, 365),
          fetchFocusDistributionRemote(userId),
          fetchRemoteAchievementsSnapshot(userId)
        ]);

        const nextAchievements = this.mergeRemoteAchievements(achievementRows);
        const achievementsMeta = {
          unlocked: nextAchievements.filter(item => item.unlocked).length,
          total: nextAchievements.length
        };

        const mergedStats = {
          totalMinutes: remoteStats?.total_minutes ?? stats.totalMinutes,
          totalSessions: remoteStats?.total_sessions ?? stats.totalSessions,
          longestSession: remoteStats?.longest_session ?? stats.longestSession ?? 0,
          streakDays: remoteStats?.streak_days ?? stats.streakDays,
          todayMinutes: remoteStats?.today_minutes ?? stats.todayMinutes
        };

        const remoteHeatmap = heatmapRows && heatmapRows.length ? this.normalizeHeatmapFromRemote(heatmapRows) : this.data.heatmapData;
        const remoteDistribution = distributionRows && distributionRows.length ? this.normalizeDistributionFromRemote(distributionRows) : this.data.distributionData;
        const heatmapSummary = this.buildHeatmapSummary(remoteHeatmap);

        this.setData({
          focusStats: {
            todayFocus: mergedStats.todayMinutes,
            totalSessions: mergedStats.totalSessions,
            streakDays: mergedStats.streakDays
          },
          heatmapData: remoteHeatmap,
          distributionData: remoteDistribution,
          heatmapSummary,
          achievements: nextAchievements,
          achievementsMeta,
          insightList: this.buildInsights(mergedStats)
        });
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
        heatmapSummary,
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

  normalizeHeatmapFromRemote(rows = []) {
    return rows.map(row => ({
      date: row.focus_date || row.date,
      minutes: row.focus_minutes || 0,
      level: row.level ?? 0
    }));
  },

  normalizeDistributionFromRemote(rows = []) {
    const base = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      minutes: 0,
      label: `${hour.toString().padStart(2, '0')}:00`
    }));
    rows.forEach(item => {
      const hour = Number(item.hour);
      if (!Number.isNaN(hour) && base[hour]) {
        base[hour].minutes = Number(item.minutes) || 0;
      }
    });
    return base;
  },

  mergeRemoteAchievements(remoteList = []) {
    const merged = this.normalizeAchievements(focusService.getAchievements());
    const map = merged.reduce((acc, item) => {
      acc[item.key] = item;
      return acc;
    }, {});

    remoteList.forEach(row => {
      const key = row.achievement_id;
      if (map[key]) {
        map[key].unlocked = true;
        map[key].unlockedAt = row.unlocked_at;
      }
    });

    return Object.values(map);
  },

  buildHeatmapSummary(rows = []) {
    if (!Array.isArray(rows) || !rows.length) {
      return {
        rangeDays: 0,
        activeDays: 0,
        totalMinutes: 0,
        avgMinutes: 0
      };
    }

    const totalMinutes = rows.reduce((sum, item) => sum + (Number(item.minutes || item.focus_minutes || 0)), 0);
    const activeDays = rows.filter(item => (item.minutes || item.focus_minutes || 0) > 0).length;
    const avgMinutes = activeDays ? Math.round(totalMinutes / activeDays) : 0;

    return {
      rangeDays: rows.length,
      activeDays,
      totalMinutes,
      avgMinutes
    };
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
    const { achievement, info, progress, nextMilestone } = e.detail;
    wx.vibrateShort({ type: 'light' });
    
    // 显示自定义成就弹窗
    this.setData({
      showAchievementModal: true,
      selectedAchievement: {
        achievement,
        info,
        progress,
        nextMilestone
      }
    });
  },

  // 关闭成就弹窗
  closeAchievementModal() {
    this.setData({
      showAchievementModal: false,
      selectedAchievement: null
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

  

  // 获取稀有度文本
  getRarityText(rarity) {
    const rarityMap = {
      common: '普通',
      uncommon: '稀有', 
      rare: '珍稀',
      epic: '史诗',
      legendary: '传说'
    };
    return rarityMap[rarity] || '未知';
  },

  // 格式化解锁时间
  formatUnlockTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
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
