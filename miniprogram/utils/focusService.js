// 专注数据管理服务 - 流动的秩序设计
const { createFocusSession, fetchFocusStats } = require('./supabase');

class FocusService {
  constructor() {
    this.STORAGE_KEY = 'syllaby_focus_data';
    this.ACHIEVEMENTS_KEY = 'syllaby_achievements';
    this.initData();
  }

  // 初始化数据结构
  initData() {
    const existingData = wx.getStorageSync(this.STORAGE_KEY);
    if (!existingData) {
      const initialData = {
        records: [], // 专注记录数组
        stats: {
          totalMinutes: 0,
          streakDays: 0,
          todayMinutes: 0,
          lastFocusDate: null,
          longestSession: 0,
          totalSessions: 0
        },
        achievements: {
          spark: { unlocked: false, unlockedAt: null }, // 星火 - 第一次完成专注
          deepDiver: { unlocked: false, unlockedAt: null }, // 潜行者 - 单次专注超过60分钟
          timeLord: { unlocked: false, unlockedAt: null }, // 时间领主 - 累计专注100小时
          weekWarrior: { unlocked: false, unlockedAt: null }, // 周战士 - 连续7天专注
          nightOwl: { unlocked: false, unlockedAt: null }, // 夜猫子 - 晚上10点后专注
          earlyBird: { unlocked: false, unlockedAt: null } // 早鸟 - 早上6点前专注
        }
      };
      wx.setStorageSync(this.STORAGE_KEY, initialData);
      console.log('专注服务初始化完成');
      return initialData;
    } else {
      console.log('专注服务已存在数据');
      return existingData;
    }
  }

  // 获取数据
  getData() {
    return wx.getStorageSync(this.STORAGE_KEY) || this.initData();
  }

  // 保存数据
  saveData(data) {
    wx.setStorageSync(this.STORAGE_KEY, data);
  }

  // 保存专注记录
  async saveRecord(minutes, subject = '专注学习', syncToRemote = true) {
    const data = this.getData();
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const hour = now.getHours();
    
    // 创建新记录
    const newRecord = {
      id: Date.now(),
      date: today,
      timestamp: now.getTime(),
      minutes: minutes,
      subject: subject,
      hour: hour,
      completed: true
    };

    // 添加记录
    data.records.push(newRecord);
    
    // 更新统计
    data.stats.totalMinutes += minutes;
    data.stats.totalSessions += 1;
    data.stats.todayMinutes = this.getTodayMinutes(data.records);
    data.stats.longestSession = Math.max(data.stats.longestSession, minutes);
    
    // 计算连续天数
    data.stats.streakDays = this.calculateStreakDays(data.records);
    data.stats.lastFocusDate = today;

    // 检查成就
    const newAchievements = this.checkAchievements(data, newRecord);
    
    // 保存本地数据
    this.saveData(data);
    
    // 同步到远程数据库
    if (syncToRemote) {
      try {
        const app = getApp();
        const userId = app?.globalData?.supabase?.userId;
        if (userId) {
          await createFocusSession({
            user_id: userId,
            duration: minutes,
            started_at: new Date(now.getTime() - minutes * 60000).toISOString(),
            ended_at: now.toISOString(),
            related_course_id: null,
            completed: true
          });
        }
      } catch (error) {
        console.warn('Remote sync failed:', error);
        // 本地保存成功，远程失败也可以接受
      }
    }
    
    return {
      success: true,
      record: newRecord,
      stats: data.stats,
      newAchievements: newAchievements
    };
  }

  // 获取今日专注时长
  getTodayMinutes(records) {
    const today = new Date().toISOString().split('T')[0];
    return records
      .filter(r => r.date === today)
      .reduce((sum, r) => sum + r.minutes, 0);
  }

  // 计算连续专注天数
  calculateStreakDays(records) {
    if (records.length === 0) return 0;
    
    // 获取所有有专注记录的日期
    const focusDates = [...new Set(records.map(r => r.date))].sort().reverse();
    
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < focusDates.length; i++) {
      const focusDate = new Date(focusDates[i]);
      focusDate.setHours(0, 0, 0, 0);
      
      const diffDays = Math.floor((today - focusDate) / (1000 * 60 * 60 * 24));
      
      if (diffDays === i) {
        streak++;
      } else {
        break;
      }
    }
    
    return streak;
  }

  // 检查成就解锁
  checkAchievements(data, newRecord) {
    const newAchievements = [];
    const achievements = data.achievements;
    const stats = data.stats;
    
    // 星火 - 第一次完成专注
    if (!achievements.spark.unlocked && stats.totalSessions >= 1) {
      achievements.spark.unlocked = true;
      achievements.spark.unlockedAt = newRecord.timestamp;
      newAchievements.push('spark');
    }
    
    // 潜行者 - 单次专注超过60分钟
    if (!achievements.deepDiver.unlocked && newRecord.minutes >= 60) {
      achievements.deepDiver.unlocked = true;
      achievements.deepDiver.unlockedAt = newRecord.timestamp;
      newAchievements.push('deepDiver');
    }
    
    // 时间领主 - 累计专注100小时
    if (!achievements.timeLord.unlocked && stats.totalMinutes >= 6000) {
      achievements.timeLord.unlocked = true;
      achievements.timeLord.unlockedAt = newRecord.timestamp;
      newAchievements.push('timeLord');
    }
    
    // 周战士 - 连续7天专注
    if (!achievements.weekWarrior.unlocked && stats.streakDays >= 7) {
      achievements.weekWarrior.unlocked = true;
      achievements.weekWarrior.unlockedAt = newRecord.timestamp;
      newAchievements.push('weekWarrior');
    }
    
    // 夜猫子 - 晚上10点后专注
    if (!achievements.nightOwl.unlocked && newRecord.hour >= 22) {
      achievements.nightOwl.unlocked = true;
      achievements.nightOwl.unlockedAt = newRecord.timestamp;
      newAchievements.push('nightOwl');
    }
    
    // 早鸟 - 早上6点前专注
    if (!achievements.earlyBird.unlocked && newRecord.hour <= 6) {
      achievements.earlyBird.unlocked = true;
      achievements.earlyBird.unlockedAt = newRecord.timestamp;
      newAchievements.push('earlyBird');
    }
    
    return newAchievements;
  }

  // 获取统计数据
  getStats() {
    const data = this.getData();
    return data.stats;
  }

  // 获取成就数据
  getAchievements() {
    const data = this.getData();
    return data.achievements;
  }

  // 获取热力图数据（过去一年）
  getHeatmapData() {
    const data = this.getData();
    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    // 生成过去一年的日期数组
    const dateMap = new Map();
    for (let d = new Date(oneYearAgo); d <= today; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      dateMap.set(dateStr, { date: dateStr, minutes: 0 });
    }
    
    // 填充实际数据
    data.records.forEach(record => {
      if (dateMap.has(record.date)) {
        dateMap.get(record.date).minutes += record.minutes;
      }
    });
    
    return Array.from(dateMap.values());
  }

  // 获取专注时段分布（24小时）
  getHourlyDistribution(lookbackDays = 7) {
    const data = this.getData();
    const hourlyData = Array(24).fill(0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfWindow = new Date(today);
    startOfWindow.setDate(startOfWindow.getDate() - Math.max(lookbackDays - 1, 0));
    const activeDays = new Set();
    
    data.records.forEach(record => {
      if (!record.date) return;
      const recordDate = new Date(record.date);
      recordDate.setHours(0, 0, 0, 0);
      if (recordDate < startOfWindow || recordDate > today) {
        return;
      }
      const hour = Math.min(Math.max(record.hour || 0, 0), 23);
      hourlyData[hour] += record.minutes;
      activeDays.add(record.date);
    });
    const divisor = activeDays.size || 1;
    
    return hourlyData.map((minutes, hour) => ({
      hour: hour,
      minutes: Math.round(minutes / divisor),
      label: `${hour.toString().padStart(2, '0')}:00`
    }));
  }

  // 获取最近7天的数据
  getRecentWeekData() {
    const data = this.getData();
    const today = new Date();
    const weekData = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayRecords = data.records.filter(r => r.date === dateStr);
      const totalMinutes = dayRecords.reduce((sum, r) => sum + r.minutes, 0);
      
      weekData.push({
        date: dateStr,
        dayName: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()],
        minutes: totalMinutes,
        sessions: dayRecords.length
      });
    }
    
    return weekData;
  }

  // 格式化时间显示
  formatMinutes(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    } else {
      return `${mins}m`;
    }
  }

  // 获取成就信息
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
  }
}

// 导出单例
module.exports = new FocusService();
