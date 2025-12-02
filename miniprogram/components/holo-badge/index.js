Component({
  properties: {
    achievement: {
      type: Object,
      value: {
        key: '',
        unlocked: false,
        unlockedAt: null
      }
    },
    size: {
      type: String,
      value: 'medium' // small, medium, large
    },
    showTooltip: {
      type: Boolean,
      value: true
    },
    showProgress: {
      type: Boolean,
      value: true
    },
    compact: {
      type: Boolean,
      value: false
    }
  },

  data: {
    achievementInfo: null,
    isAnimating: false,
    progress: 0,
    nextMilestone: null,
    glowIntensity: 0
  },

  observers: {
    'achievement': function(achievement) {
      if (achievement && achievement.key) {
        const info = this.getAchievementInfo(achievement.key);
        this.setData({
          achievementInfo: info
        });
        this.calculateProgress(achievement, info);
      }
    }
  },

  lifetimes: {
    attached() {
      if (this.data.achievement && this.data.achievement.key) {
        this.setData({
          achievementInfo: this.getAchievementInfo(this.data.achievement.key)
        });
      }
    }
  },

  methods: {
    // 获取成就信息
    getAchievementInfo(key) {
      const achievementMap = {
        spark: {
          name: '星火',
          desc: '第一次完成专注',
          icon: '✨',
          color: '#E2C2A4',
          gradient: 'linear-gradient(135deg, #E2C2A4 0%, #F4E4C1 50%, #E2C2A4 100%)',
          category: 'beginner',
          rarity: 'common'
        },
        deepDiver: {
          name: '潜行者',
          desc: '单次专注超过60分钟',
          icon: '🌊',
          color: '#87A8A4',
          gradient: 'linear-gradient(135deg, #87A8A4 0%, #A8C4C0 50%, #87A8A4 100%)',
          category: 'endurance',
          rarity: 'rare'
        },
        timeLord: {
          name: '时间领主',
          desc: '累计专注100小时',
          icon: '⏰',
          color: '#BCA0BC',
          gradient: 'linear-gradient(135deg, #BCA0BC 0%, #D4C0D4 50%, #BCA0BC 100%)',
          category: 'milestone',
          rarity: 'epic'
        },
        weekWarrior: {
          name: '周战士',
          desc: '连续7天专注',
          icon: '🔥',
          color: '#E08E79',
          gradient: 'linear-gradient(135deg, #E08E79 0%, #F0B3A5 50%, #E08E79 100%)',
          category: 'consistency',
          rarity: 'rare'
        },
        nightOwl: {
          name: '夜猫子',
          desc: '晚上10点后专注',
          icon: '🦉',
          color: '#6B8A9C',
          gradient: 'linear-gradient(135deg, #6B8A9C 0%, #8CA8BC 50%, #6B8A9C 100%)',
          category: 'timing',
          rarity: 'uncommon'
        },
        earlyBird: {
          name: '早鸟',
          desc: '早上6点前专注',
          icon: '🌅',
          color: '#A2B18A',
          gradient: 'linear-gradient(135deg, #A2B18A 0%, #B8C5A5 50%, #A2B18A 100%)',
          category: 'timing',
          rarity: 'uncommon'
        },
        focusMaster: {
          name: '专注大师',
          desc: '累计专注500小时',
          icon: '🎯',
          color: '#E74C3C',
          gradient: 'linear-gradient(135deg, #E74C3C 0%, #FF6B6B 50%, #E74C3C 100%)',
          category: 'milestone',
          rarity: 'legendary'
        },
        marathonRunner: {
          name: '马拉松选手',
          desc: '单次专注超过120分钟',
          icon: '🏃',
          color: '#3498DB',
          gradient: 'linear-gradient(135deg, #3498DB 0%, #5DADE2 50%, #3498DB 100%)',
          category: 'endurance',
          rarity: 'epic'
        },
        monthlyChampion: {
          name: '月度冠军',
          desc: '单月专注超过100小时',
          icon: '🏆',
          color: '#F39C12',
          gradient: 'linear-gradient(135deg, #F39C12 0%, #F1C40F 50%, #F39C12 100%)',
          category: 'milestone',
          rarity: 'epic'
        }
      };
      
      return achievementMap[key] || { 
        name: '未知', 
        desc: '', 
        icon: '🎯', 
        color: '#87A8A4',
        gradient: 'linear-gradient(135deg, #87A8A4 0%, #A8C4C0 50%, #87A8A4 100%)',
        category: 'unknown',
        rarity: 'common'
      };
    },

    // 点击徽章
    onBadgeTap() {
      if (this.data.achievement.unlocked) {
        wx.vibrateShort({ type: 'light' });
        
        // 添加点击动画
        this.setData({ isAnimating: true });
        
        // 增强光晕效果
        this.animateGlow();
        
        setTimeout(() => {
          this.setData({ isAnimating: false });
        }, 600);
        
        this.triggerEvent('badgeTap', {
          achievement: this.data.achievement,
          info: this.data.achievementInfo,
          progress: this.data.progress
        });
      } else {
        // 未解锁的徽章也显示进度信息
        this.triggerEvent('badgeTap', {
          achievement: this.data.achievement,
          info: this.data.achievementInfo,
          progress: this.data.progress,
          nextMilestone: this.data.nextMilestone
        });
      }
    },

    // 计算进度
    calculateProgress(achievement, info) {
      if (!achievement || !info) return;
      
      if (achievement.unlocked) {
        this.setData({ progress: 100, nextMilestone: null });
        return;
      }
      
      // 根据成就类型计算进度
      const focusService = require('../../utils/focusService');
      const stats = focusService.getStats();
      let progress = 0;
      let nextMilestone = null;
      
      switch (achievement.key) {
        case 'spark':
          progress = stats.totalSessions > 0 ? 100 : 0;
          break;
        case 'deepDiver':
          const longestSession = stats.longestSession || 0;
          progress = Math.min((longestSession / 60) * 100, 100);
          nextMilestone = longestSession < 60 ? '还需 ' + (60 - longestSession) + ' 分钟' : null;
          break;
        case 'timeLord':
          const totalHours = (stats.totalMinutes || 0) / 60;
          progress = Math.min((totalHours / 100) * 100, 100);
          nextMilestone = totalHours < 100 ? '还需 ' + (100 - totalHours).toFixed(1) + ' 小时' : null;
          break;
        case 'weekWarrior':
          progress = Math.min((stats.streakDays / 7) * 100, 100);
          nextMilestone = stats.streakDays < 7 ? '还需 ' + (7 - stats.streakDays) + ' 天' : null;
          break;
        case 'focusMaster':
          const masterHours = (stats.totalMinutes || 0) / 60;
          progress = Math.min((masterHours / 500) * 100, 100);
          nextMilestone = masterHours < 500 ? '还需 ' + (500 - masterHours).toFixed(1) + ' 小时' : null;
          break;
        case 'marathonRunner':
          const marathonSession = stats.longestSession || 0;
          progress = Math.min((marathonSession / 120) * 100, 100);
          nextMilestone = marathonSession < 120 ? '还需 ' + (120 - marathonSession) + ' 分钟' : null;
          break;
        default:
          progress = 0;
      }
      
      this.setData({ progress, nextMilestone });
    },

    // 光晕动画
    animateGlow() {
      let intensity = 0;
      const animate = () => {
        intensity += 0.1;
        if (intensity <= 1) {
          this.setData({ glowIntensity: intensity });
          setTimeout(animate, 50);
        } else {
          // 淡出
          const fadeOut = () => {
            intensity -= 0.1;
            if (intensity >= 0) {
              this.setData({ glowIntensity: intensity });
              setTimeout(fadeOut, 50);
            }
          };
          fadeOut();
        }
      };
      animate();
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
    }
  }
});