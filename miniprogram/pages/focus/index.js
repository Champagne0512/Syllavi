const { createFocusSession, fetchFocusStats } = require('../../utils/supabase');
const focusService = require('../../utils/focusService');
const app = getApp();

const gradients = [
  ['#92B4EC', '#F7F7F5'],
  ['#F4C095', '#1C1C1E'],
  ['#1148C4', '#FF5C00']
];

const MIN_MINUTES = 5;
const MAX_MINUTES = 180;

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
};

Page({
  data: {
    gradients,
    minutes: 45,
    remaining: 45 * 60,
    displayTime: formatTime(45 * 60),
    running: false,
    gradientIndex: 0,
    courseName: '',
    summaryCard: null,
    customMinutes: 45,
    customMinutesDraft: '45',
    stats: {
      totalMinutes: 0,
      streakDays: 0,
      todayMinutes: 0,
      totalSessions: 0
    },
    achievements: {},
    newAchievements: []
  },
  onLoad() {
    this.loadFocusData();
  },

  onShow() {
    this.loadFocusData();
  },
  onUnload() {
    clearInterval(this.timer);
    clearInterval(this.gradientTicker);
  },
  rollGradient() {
    const gradientIndex = (this.data.gradientIndex + 1) % gradients.length;
    this.setData({ gradientIndex });
  },
  startFocus() {
    if (this.data.running) {
      return;
    }
    wx.vibrateShort({ type: 'light' });
    this.setData({ running: true });
    this.gradientTicker = setInterval(() => this.rollGradient(), 15000);
    this.timer = setInterval(() => {
      const left = this.data.remaining - 1;
      if (left <= 0) {
        this.finishSession();
        return;
      }
      this.setData({ remaining: left, displayTime: formatTime(left) });
    }, 1000);
  },
  async finishSession() {
    clearInterval(this.timer);
    clearInterval(this.gradientTicker);
    const usedSeconds = this.data.minutes * 60 - this.data.remaining;
    const usedMinutes = Math.max(1, Math.round(usedSeconds / 60));
    const subject = this.data.courseName || '专注学习';

    try {
      // 使用 FocusService 保存记录（包含本地存储、成就检查和远程同步）
      const result = await focusService.saveRecord(usedMinutes, subject, true);
      
      // 更新页面数据
      this.loadFocusData();

      // 显示完成卡片
      this.setData({
        running: false,
        summaryCard: {
          focus: (usedMinutes / 60).toFixed(1),
          streak: result.stats.streakDays
        },
        newAchievements: result.newAchievements || [],
        remaining: this.data.minutes * 60,
        displayTime: formatTime(this.data.minutes * 60)
      });

      // 如果有新成就，显示提示
      if (result.newAchievements && result.newAchievements.length > 0) {
        setTimeout(() => {
          this.showAchievementNotifications(result.newAchievements);
        }, 1000);
      }
    } catch (err) {
      console.warn('record focus failed', err);
      // 降级到本地保存
      const result = await focusService.saveRecord(usedMinutes, subject, false);
      this.loadFocusData();
      
      this.setData({
        running: false,
        summaryCard: {
          focus: (usedMinutes / 60).toFixed(1),
          streak: result.stats.streakDays
        },
        remaining: this.data.minutes * 60,
        displayTime: formatTime(this.data.minutes * 60)
      });
    }
    wx.vibrateShort({ type: 'medium' });
  },
  stopFocus() {
    clearInterval(this.timer);
    clearInterval(this.gradientTicker);
    this.setData({
      running: false,
      remaining: this.data.minutes * 60,
      displayTime: formatTime(this.data.minutes * 60)
    });
  },
  adjustMinutes(e) {
    const minutes = e.detail.value;
    this.setFocusMinutes(minutes);
  },
  setFocusMinutes(minutes) {
    if (this.data.running) return;
    const normalized = this.normalizeMinutes(minutes);
    const seconds = normalized * 60;
    this.setData({
      minutes: normalized,
      customMinutes: normalized,
      customMinutesDraft: String(normalized),
      remaining: seconds,
      displayTime: formatTime(seconds)
    });
  },
  normalizeMinutes(value) {
    const num = Number(value);
    if (Number.isNaN(num)) return this.data.minutes;
    return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(num)));
  },
  onCustomMinutesInput(e) {
    this.setData({ customMinutesDraft: e.detail.value });
  },
  applyCustomMinutes() {
    if (this.data.running) {
      wx.showToast({ title: '专注进行中，稍后再改', icon: 'none' });
      return;
    }
    const normalized = this.normalizeMinutes(this.data.customMinutesDraft);
    this.setFocusMinutes(normalized);
    if (String(normalized) !== this.data.customMinutesDraft) {
      this.setData({ customMinutesDraft: String(normalized) });
    }
    wx.vibrateShort({ type: 'light' });
  },
  exitFocus() {
    wx.vibrateShort({ type: 'light' });
    wx.navigateBack();
  },
  // 加载专注数据
  async loadFocusData() {
    try {
      console.log('=== 开始加载专注数据 ===');
      
      // 先获取本地数据作为默认值
      const localStats = focusService.getStats();
      const achievements = focusService.getAchievements();
      
      console.log('本地统计数据:', localStats);
      console.log('本地成就数据:', achievements);
      
      // 尝试从数据库获取最新数据
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      
      console.log('用户ID:', userId);
      
      if (userId) {
        try {
          const remoteStats = await fetchFocusStats(userId);
          console.log('远程统计数据:', remoteStats);
          
          if (remoteStats) {
            // 合并本地和远程数据，优先使用远程数据
            const stats = {
              totalMinutes: remoteStats.total_minutes || localStats.totalMinutes,
              streakDays: remoteStats.continuous_days || localStats.streakDays,
              todayMinutes: remoteStats.today_minutes || localStats.todayMinutes,
              totalSessions: remoteStats.total_sessions || localStats.totalSessions
            };
            
            console.log('合并后的统计数据:', stats);
            
            this.setData({
              stats: stats,
              achievements: achievements
            });
            
            console.log('专注数据已从数据库同步:', stats);
            console.log('页面数据已设置:', this.data.stats);
            return;
          }
        } catch (error) {
          console.warn('从数据库获取专注数据失败，使用本地数据:', error);
        }
      }
      
      // 如果无法获取远程数据，使用本地数据
      console.log('使用本地数据设置页面');
      this.setData({
        stats: localStats,
        achievements: achievements
      });
      
      console.log('页面数据已设置（本地）:', this.data.stats);
      
    } catch (error) {
      console.error('加载专注数据失败:', error);
      // 降级到本地数据
      const localStats = focusService.getStats();
      const achievements = focusService.getAchievements();
      
      console.log('错误降级使用本地数据:', localStats);
      
      this.setData({
        stats: localStats,
        achievements: achievements
      });
    }
  },

  // 显示成就通知
  showAchievementNotifications(achievementKeys) {
    achievementKeys.forEach((key, index) => {
      setTimeout(() => {
        const info = this.getAchievementInfo(key);
        wx.showModal({
          title: '🎉 成就解锁',
          content: `${info.name}\n${info.desc}`,
          showCancel: false,
          confirmText: '太棒了',
          success: () => {
            wx.vibrateShort({ type: 'heavy' });
          }
        });
      }, index * 2000);
    });
  },

  // 获取成就信息（供WXML使用）
  getAchievementInfo(key) {
    const achievementMap = {
      spark: {
        name: '星火',
        desc: '第一次完成专注',
        icon: '✨',
        color: '#E2C2A4'
      },
      deepDiver: {
        name: '潜行者',
        desc: '单次专注超过60分钟',
        icon: '🌊',
        color: '#87A8A4'
      },
      timeLord: {
        name: '时间领主',
        desc: '累计专注100小时',
        icon: '⏰',
        color: '#BCA0BC'
      },
      weekWarrior: {
        name: '周战士',
        desc: '连续7天专注',
        icon: '🔥',
        color: '#E08E79'
      },
      nightOwl: {
        name: '夜猫子',
        desc: '晚上10点后专注',
        icon: '🦉',
        color: '#6B8A9C'
      },
      earlyBird: {
        name: '早鸟',
        desc: '早上6点前专注',
        icon: '🌅',
        color: '#A2B18A'
      }
    };
    
    return achievementMap[key] || { name: '未知', desc: '', icon: '🎯', color: '#87A8A4' };
  },

  // 跳转到统计页面
  goToStats() {
    wx.vibrateShort({ type: 'light' });
    wx.navigateTo({
      url: '/pages/tools/index'
    });
  },

  saveCard() {
    if (!this.data.summaryCard) {
      wx.showToast({ title: '暂无专注记录', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '生成中...' });
    const { focus, streak } = this.data.summaryCard;
    const courseName = this.data.courseName || 'Focus Session';

    const ctx = wx.createCanvasContext('focusCard', this);
    const width = 600;
    const height = 800;

    // 背景 - 使用设计规范的颜色
    ctx.setFillStyle('#F2F4F6');
    ctx.fillRect(0, 0, width, height);

    // 添加弥散背景效果
    const gradient1 = ctx.createRadialGradient(150, 200, 50, 150, 200, 200);
    gradient1.addColorStop(0, 'rgba(135, 168, 164, 0.3)');
    gradient1.addColorStop(1, 'rgba(135, 168, 164, 0)');
    ctx.setFillStyle(gradient1);
    ctx.fillRect(0, 0, width, height);

    const gradient2 = ctx.createRadialGradient(450, 600, 50, 450, 600, 200);
    gradient2.addColorStop(0, 'rgba(224, 142, 121, 0.3)');
    gradient2.addColorStop(1, 'rgba(224, 142, 121, 0)');
    ctx.setFillStyle(gradient2);
    ctx.fillRect(0, 0, width, height);

    // 标题
    ctx.setFillStyle('#2D3436');
    ctx.setFontSize(32);
    ctx.setTextAlign('left');
    ctx.fillText('Syllaby · Focus', 40, 80);

    // 课程/主题
    ctx.setFontSize(28);
    ctx.setFillStyle('#87A8A4');
    ctx.fillText(courseName, 40, 140);

    // 时长 & 连续天数
    ctx.setFillStyle('#2D3436');
    ctx.setFontSize(80);
    ctx.fillText(`${focus}h`, 40, 260);
    ctx.setFontSize(28);
    ctx.setFillStyle('#BCA0BC');
    ctx.fillText('专注时长', 40, 310);

    ctx.setFillStyle('#2D3436');
    ctx.setFontSize(80);
    ctx.fillText(`${streak}`, 40, 430);
    ctx.setFontSize(28);
    ctx.setFillStyle('#BCA0BC');
    ctx.fillText('连续专注天数', 40, 480);

    // 底部文案
    ctx.setFillStyle('#87A8A4');
    ctx.setFontSize(24);
    ctx.fillText('流动的秩序 · 学术禅意', 40, 560);

    ctx.draw(false, () => {
      wx.canvasToTempFilePath(
        {
          canvasId: 'focusCard',
          width,
          height,
          destWidth: width,
          destHeight: height,
          success: (res) => {
            wx.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: () => {
                wx.hideLoading();
                wx.showToast({ title: '已保存到相册', icon: 'success' });
              },
              fail: () => {
                wx.hideLoading();
                wx.showToast({ title: '保存失败', icon: 'none' });
              }
            });
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '生成失败', icon: 'none' });
          }
        },
        this
      );
    });
  }
});