const {
  DEMO_USER_ID,
  fetchProfile,
  fetchFocusStats,
  fetchTasks,
  fetchCourses,
  fetchResources,
  fetchAchievements,
  fetchLearningHeatmap,
  updateProfile,
  uploadToStorage
} from '../../utils/supabase';

// 内联年级选项，避免模块依赖问题
const ALLOWED_GRADES = ['大一', '大二', '大三', '大四', '研一', '研二', '研三', '博士'];
const GRADE_OPTION_NONE = '暂不填写';
const GRADE_PICKER_OPTIONS = [...ALLOWED_GRADES, GRADE_OPTION_NONE];

const normalizeGradeInput = (grade) => {
  if (!grade) return '';
  return ALLOWED_GRADES.includes(grade) ? grade : '';
};

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

const sanitizeGrade = (grade) => {
  if (typeof grade !== 'string') return '';
  return normalizeGradeInput(grade.trim());
};

const getGradePickerIndex = (grade) => {
  const options = GRADE_PICKER_OPTIONS;
  const fallbackIndex = options.indexOf(GRADE_OPTION_NONE);
  const normalized = sanitizeGrade(grade);
  if (!normalized) return fallbackIndex;
  const idx = options.indexOf(normalized);
  return idx >= 0 ? idx : fallbackIndex;
};

const formatGradeForSave = (grade) => {
  const normalized = sanitizeGrade(grade);
  return normalized || null;
};

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
    ],
    editModalVisible: false,
    savingProfile: false,
    editForm: {
      nickname: '',
      school_name: '',
      grade: '',
      bio: '',
      avatar_url: ''
    },
    gradeOptions: GRADE_PICKER_OPTIONS,
    gradePickerIndex: GRADE_PICKER_OPTIONS.indexOf(GRADE_OPTION_NONE)
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

      const normalizedGrade = sanitizeGrade(profile.grade || '');
      this.setData({
        profile: {
          nickname: profile.nickname || userInfo?.nickName || '同学',
          school_name: profile.school_name || '',
          grade: normalizedGrade,
          avatar_url: profile.avatar_url || userInfo?.avatarUrl || '',
          bio: profile.bio || '让学习成为一种习惯'
        },
        editForm: {
          nickname: profile.nickname || userInfo?.nickName || '同学',
          school_name: profile.school_name || '',
          grade: normalizedGrade,
          bio: profile.bio || '让学习成为一种习惯',
          avatar_url: profile.avatar_url || userInfo?.avatarUrl || ''
        },
        gradePickerIndex: getGradePickerIndex(normalizedGrade)
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
    const { profile } = this.data;
    const grade = sanitizeGrade(profile.grade || '');
    this.setData({
      editModalVisible: true,
      editForm: {
        nickname: profile.nickname || '同学',
        school_name: profile.school_name || '',
        grade,
        bio: profile.bio || '',
        avatar_url: profile.avatar_url || ''
      },
      gradePickerIndex: getGradePickerIndex(grade)
    });
  },

  closeEditModal() {
    if (this.data.savingProfile) return;
    this.setData({ editModalVisible: false });
  },

  onEditInput(e) {
    const { field } = e.currentTarget.dataset;
    if (!field) return;
    this.setData({ [`editForm.${field}`]: e.detail.value });
  },

  onGradePickerChange(e) {
    const options = this.data.gradeOptions || [];
    const fallbackIndex = options.indexOf(GRADE_OPTION_NONE);
    const pickedIndex = Number(e?.detail?.value);
    const index = Number.isNaN(pickedIndex) ? fallbackIndex : pickedIndex;
    const selected = options[index] || GRADE_OPTION_NONE;
    const gradeValue = selected === GRADE_OPTION_NONE ? '' : selected;
    this.setData({
      gradePickerIndex: index,
      'editForm.grade': gradeValue
    });
  },

  stopTouchMove() {
    return true;
  },

  chooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      maxDuration: 30,
      camera: 'back',
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        
        // 压缩图片
        wx.compressImage({
          src: tempFilePath,
          quality: 80,
          success: (compressRes) => {
            this.setData({
              'editForm.avatar_url': compressRes.tempFilePath
            });
          },
          fail: () => {
            // 压缩失败，使用原图
            this.setData({
              'editForm.avatar_url': tempFilePath
            });
          }
        });
      },
      fail: (err) => {
        console.log('选择头像失败', err);
      }
    });
  },

  resetAvatar() {
    wx.showModal({
      title: '确认重置头像',
      content: '确定要使用默认头像吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            'editForm.avatar_url': ''
          });
        }
      }
    });
  },

  getImageBase64(filePath) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath,
        encoding: 'base64',
        success: (res) => {
          resolve(res.data);
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },

  async saveProfile() {
    if (this.data.savingProfile) return;
    const app = getApp();
    const userId = app?.globalData?.supabase?.userId;
    const accessToken =
      wx.getStorageSync('access_token') || app?.globalData?.supabase?.accessToken;
    if (!userId || userId === DEMO_USER_ID || !accessToken) {
      wx.showModal({
        title: '请先登录',
        content: '登录后才能同步和保存个人资料。',
        confirmText: '去登录',
        cancelText: '稍后',
        success(res) {
          if (res?.confirm) {
            wx.navigateTo({ url: '/pages/login/index' });
          }
        }
      });
      return;
    }
    const nickname = (this.data.editForm.nickname || '').trim() || '同学';
    const schoolName = (this.data.editForm.school_name || '').trim();
    const gradeInput = (this.data.editForm.grade || '').trim();
    const normalizedGrade = sanitizeGrade(gradeInput);
    if (gradeInput && !normalizedGrade) {
      wx.showToast({ title: '年级仅支持：大一至博士', icon: 'none' });
      return;
    }
    let avatarUrl = this.data.editForm.avatar_url;
    
    // 如果是新选择的图片（临时路径），转换为 Base64 存储
    if (avatarUrl && avatarUrl.startsWith('http://tmp/')) {
      try {
        wx.showLoading({ title: '处理头像中...' });
        
        console.log('转换头像为 Base64');
        const base64Data = await this.getImageBase64(avatarUrl);
        avatarUrl = `data:image/jpeg;base64,${base64Data}`;
        console.log('头像 Base64 转换成功，长度:', base64Data.length);
        
        wx.hideLoading();
      } catch (error) {
        wx.hideLoading();
        console.error('头像处理失败:', error);
        wx.showToast({ title: '头像处理失败', icon: 'none' });
        this.setData({ savingProfile: false });
        return;
      }
    }

    const payload = {
      nickname,
      school_name: schoolName,
      grade: normalizedGrade || null,
      bio: (this.data.editForm.bio || '').trim(),
      avatar_url: avatarUrl || null
    };
    this.setData({ savingProfile: true });
    wx.showLoading({ title: '保存中...' });
    try {
      await updateProfile(userId, payload);
      const nextProfile = {
        ...this.data.profile,
        ...payload,
        grade: normalizedGrade || '',
        avatar_url: avatarUrl || this.data.profile.avatar_url || ''
      };
      this.setData({
        profile: nextProfile,
        editModalVisible: false,
        gradePickerIndex: getGradePickerIndex(normalizedGrade)
      });
      wx.setStorageSync('profile', nextProfile);
      wx.showToast({ title: '已更新', icon: 'success' });
    } catch (err) {
      console.warn('update profile failed', err);
      if (err?.statusCode === 401) {
        wx.showToast({ title: '登录过期，请重新登录', icon: 'none' });
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    } finally {
      wx.hideLoading();
      this.setData({ savingProfile: false });
    }
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
