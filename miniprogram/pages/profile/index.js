import {
  fetchProfile,
  fetchFocusStats,
  fetchTasks,
  fetchCourses,
  fetchResources,
  fetchAchievements,
  fetchLearningHeatmap
} from '../../utils/supabase';

const DEFAULT_STATS = {
  today_focus_minutes: 0,
  week_focus_minutes: 0,
  total_focus_minutes: 0,
  total_sessions: 0,
  completed_tasks: 0,
  total_tasks: 0,
  total_resources: 0,
  total_courses: 0,
  continuous_days: 0
};

const DEFAULT_ACHIEVEMENTS = [
  { id: 'beginner', name: '初出茅庐', desc: '完成首次专注', icon: '🌱', unlocked: false },
  { id: 'focused_1h', name: '专注达人', desc: '累计专注1小时', icon: '⏰', unlocked: false },
  { id: 'focused_10h', name: '时间管理大师', desc: '累计专注10小时', icon: '⏳', unlocked: false },
  { id: 'focused_50h', name: '学霸之光', desc: '累计专注50小时', icon: '🔥', unlocked: false },
  { id: 'focused_100h', name: '百炼成钢', desc: '累计专注100小时', icon: '💎', unlocked: false },
  { id: 'task_10', name: '行动派', desc: '完成10个任务', icon: '✅', unlocked: false },
  { id: 'task_50', name: '执行力MAX', desc: '完成50个任务', icon: '🎯', unlocked: false },
  { id: 'continuous_7', name: '坚持不懈', desc: '连续学习7天', icon: '📅', unlocked: false },
  { id: 'continuous_30', name: '习惯养成', desc: '连续学习30天', icon: '🏆', unlocked: false }
];

Page({
  data: {
    loading: true,
    profile: {
      nickname: '同学',
      school_name: '',
      grade: '',
      avatar_url: '',
      bio: ''
    },
    stats: DEFAULT_STATS,
    achievements: DEFAULT_ACHIEVEMENTS,
    heatmap: [],
    quickActions: [
      { id: 'courses', name: '我的课程', icon: '📚', path: '/pages/hub/index' },
      { id: 'resources', name: '资源库', icon: '📁', path: '/pages/knowledge/index' },
      { id: 'focus', name: '专注记录', icon: '⏱️', path: '/pages/focus/index' },
      { id: 'settings', name: '设置', icon: '⚙️', path: '/pages/settings/index' }
    ]
  },

  onLoad() {
    this.bootstrap();
  },

  onShow() {
    if (this.getTabBar && this.getTabBar()) {
      this.getTabBar().setSelected(3);
    }
    // 刷新数据
    if (!this.data.loading) {
      this.loadStats();
      this.loadAchievements();
    }
  },

  async bootstrap() {
    this.setData({ loading: true });
    await Promise.all([
      this.loadProfile(),
      this.loadStats(),
      this.loadAchievements(),
      this.loadHeatmap()
    ]);
    this.setData({ loading: false });
  },

  async loadProfile() {
    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      const rows = await fetchProfile(userId);
      const profile = Array.isArray(rows) && rows.length ? rows[0] : {};

      // 获取微信用户信息作为默认头像
      const userInfo = wx.getStorageSync('userInfo');

      this.setData({
        profile: {
          nickname: profile.nickname || userInfo?.nickName || '同学',
          school_name: profile.school_name || '',
          grade: profile.grade || '',
          avatar_url: profile.avatar_url || userInfo?.avatarUrl || '',
          bio: profile.bio || '让学习成为一种习惯'
        }
      });

      // 缓存profile
      wx.setStorageSync('profile', this.data.profile);
    } catch (err) {
      console.warn('load profile failed', err);
      // 使用缓存
      const cached = wx.getStorageSync('profile');
      if (cached) {
        this.setData({ profile: cached });
      }
    }
  },

  async loadStats() {
    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;

      // 并行加载所有统计数据
      const [focusStats, tasks, courses, resources] = await Promise.all([
        fetchFocusStats(userId).catch(() => null),
        fetchTasks(userId).catch(() => []),
        fetchCourses(userId).catch(() => []),
        fetchResources(userId).catch(() => [])
      ]);

      const stats = {
        today_focus_minutes: focusStats?.today_minutes || 0,
        week_focus_minutes: focusStats?.week_minutes || 0,
        total_focus_minutes: focusStats?.total_minutes || 0,
        total_sessions: focusStats?.total_sessions || 0,
        completed_tasks: Array.isArray(tasks) ? tasks.filter(t => t.is_completed).length : 0,
        total_tasks: Array.isArray(tasks) ? tasks.length : 0,
        total_resources: Array.isArray(resources) ? resources.length : 0,
        total_courses: Array.isArray(courses) ? courses.length : 0,
        continuous_days: focusStats?.continuous_days || 0
      };

      this.setData({ stats });
      wx.setStorageSync('profile_stats', stats);
    } catch (err) {
      console.warn('load stats failed', err);
      const cached = wx.getStorageSync('profile_stats');
      this.setData({ stats: cached || DEFAULT_STATS });
    }
  },

  async loadAchievements() {
    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;

      // 如果数据库有achievements表，从数据库加载
      const dbAchievements = await fetchAchievements(userId).catch(() => null);

      if (dbAchievements && Array.isArray(dbAchievements) && dbAchievements.length) {
        this.setData({ achievements: dbAchievements });
      } else {
        // 否则根据stats计算成就解锁状态
        this.calculateAchievements();
      }
    } catch (err) {
      console.warn('load achievements failed', err);
      this.calculateAchievements();
    }
  },

  calculateAchievements() {
    const { stats } = this.data;
    const totalHours = stats.total_focus_minutes / 60;
    const completedTasks = stats.completed_tasks;
    const continuousDays = stats.continuous_days;

    const achievements = this.data.achievements.map(ach => {
      let unlocked = false;

      switch (ach.id) {
        case 'beginner':
          unlocked = stats.total_sessions > 0;
          break;
        case 'focused_1h':
          unlocked = totalHours >= 1;
          break;
        case 'focused_10h':
          unlocked = totalHours >= 10;
          break;
        case 'focused_50h':
          unlocked = totalHours >= 50;
          break;
        case 'focused_100h':
          unlocked = totalHours >= 100;
          break;
        case 'task_10':
          unlocked = completedTasks >= 10;
          break;
        case 'task_50':
          unlocked = completedTasks >= 50;
          break;
        case 'continuous_7':
          unlocked = continuousDays >= 7;
          break;
        case 'continuous_30':
          unlocked = continuousDays >= 30;
          break;
      }

      return { ...ach, unlocked };
    });

    this.setData({ achievements });
  },

  async loadHeatmap() {
    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      const heatmapData = await fetchLearningHeatmap(userId);

      if (Array.isArray(heatmapData) && heatmapData.length) {
        this.setData({ heatmap: heatmapData });
      } else {
        // 生成默认热力图（最近30天）
        this.generateDefaultHeatmap();
      }
    } catch (err) {
      console.warn('load heatmap failed', err);
      this.generateDefaultHeatmap();
    }
  },

  generateDefaultHeatmap() {
    const heatmap = [];
    const today = new Date();

    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      heatmap.push({
        date: date.toISOString().split('T')[0],
        level: 0, // 0-4，表示活跃度
        minutes: 0
      });
    }

    this.setData({ heatmap });
  },

  navigateToAction(e) {
    const { path } = e.currentTarget.dataset;
    if (path) {
      wx.navigateTo({
        url: path,
        fail: () => {
          wx.switchTab({ url: path });
        }
      });
    }
  },

  editProfile() {
    wx.navigateTo({
      url: '/pages/settings/index'
    });
  },

  viewAchievement(e) {
    const { achievement } = e.currentTarget.dataset;
    const status = achievement.unlocked ? '已解锁' : '未解锁';
    wx.showModal({
      title: `${achievement.icon} ${achievement.name}`,
      content: `${achievement.desc}\n\n状态：${status}`,
      showCancel: false
    });
  },

  formatTime(minutes) {
    if (minutes < 60) {
      return `${minutes}分钟`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
  },

  onShareAppMessage() {
    const { stats } = this.data;
    const totalHours = Math.floor(stats.total_focus_minutes / 60);

    return {
      title: `我在 Syllaby 已累计专注 ${totalHours} 小时，一起来学习吧！`,
      path: '/pages/login/index'
    };
  }
});
