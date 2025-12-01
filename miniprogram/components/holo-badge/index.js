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
    }
  },

  data: {
    achievementInfo: null,
    isAnimating: false
  },

  observers: {
    'achievement': function(achievement) {
      if (achievement && achievement.key) {
        this.setData({
          achievementInfo: this.getAchievementInfo(achievement.key)
        });
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
          gradient: 'linear-gradient(135deg, #E2C2A4 0%, #F4E4C1 50%, #E2C2A4 100%)'
        },
        deepDiver: {
          name: '潜行者',
          desc: '单次专注超过60分钟',
          icon: '🌊',
          color: '#87A8A4',
          gradient: 'linear-gradient(135deg, #87A8A4 0%, #A8C4C0 50%, #87A8A4 100%)'
        },
        timeLord: {
          name: '时间领主',
          desc: '累计专注100小时',
          icon: '⏰',
          color: '#BCA0BC',
          gradient: 'linear-gradient(135deg, #BCA0BC 0%, #D4C0D4 50%, #BCA0BC 100%)'
        },
        weekWarrior: {
          name: '周战士',
          desc: '连续7天专注',
          icon: '🔥',
          color: '#E08E79',
          gradient: 'linear-gradient(135deg, #E08E79 0%, #F0B3A5 50%, #E08E79 100%)'
        },
        nightOwl: {
          name: '夜猫子',
          desc: '晚上10点后专注',
          icon: '🦉',
          color: '#6B8A9C',
          gradient: 'linear-gradient(135deg, #6B8A9C 0%, #8CA8BC 50%, #6B8A9C 100%)'
        },
        earlyBird: {
          name: '早鸟',
          desc: '早上6点前专注',
          icon: '🌅',
          color: '#A2B18A',
          gradient: 'linear-gradient(135deg, #A2B18A 0%, #B8C5A5 50%, #A2B18A 100%)'
        }
      };
      
      return achievementMap[key] || { 
        name: '未知', 
        desc: '', 
        icon: '🎯', 
        color: '#87A8A4',
        gradient: 'linear-gradient(135deg, #87A8A4 0%, #A8C4C0 50%, #87A8A4 100%)'
      };
    },

    // 点击徽章
    onBadgeTap() {
      if (this.data.achievement.unlocked) {
        wx.vibrateShort({ type: 'light' });
        
        // 添加点击动画
        this.setData({ isAnimating: true });
        setTimeout(() => {
          this.setData({ isAnimating: false });
        }, 600);
        
        this.triggerEvent('badgeTap', {
          achievement: this.data.achievement,
          info: this.data.achievementInfo
        });
      }
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
    }
  }
});