const supabaseApi = require('../../utils/supabase');
const {
  DEMO_USER_ID,
  fetchProfile,
  fetchFocusStats,
  fetchTasks,
  fetchCourses,
  fetchResources,
  updateProfile,
  uploadToStorage
} = supabaseApi;

// 使用Supabase工具中的年级验证函数
const { normalizeGradeInput } = supabaseApi;

const DEFAULT_STATS = {
  today_focus_minutes: 0,
  week_focus_minutes: 0,
  total_focus_minutes: 0,
  total_focus_hours: 0,
  total_sessions: 0,
  completed_tasks: 0,
  total_tasks: 0,
  total_resources: 0,
  total_courses: 0,
  continuous_days: 0
};

// 年级选择器选项
const GRADE_OPTION_NONE = '暂不填写';
const GRADE_PICKER_OPTIONS = ['大一', '大二', '大三', '大四', '研一', '研二', '研三', '博士', GRADE_OPTION_NONE];

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

Page({
  data: {
    loading: true,
    isGuest: false,
    profile: {
      nickname: '同学',
      school_name: '',
      grade: '',
      avatar_url: '',
      bio: ''
    },
    stats: DEFAULT_STATS,
    quickActions: [
      { id: 'courses', name: '我的课程', iconToken: 'courses', path: '/pages/hub/index' },
      { id: 'resources', name: '资源库', iconToken: 'resources', path: '/pages/knowledge/index' },
      { id: 'settings', name: '设置', iconToken: 'settings', path: '/pages/settings/index' }
    ],
    editModalVisible: false,
    savingProfile: false,
    editForm: {
      nickname: '',
      school_name: '',
      grade: '',
      bio: '',
      avatar_url: '',
      avatar_temp_path: '',
      avatar_temp_name: ''
    },
    gradeOptions: GRADE_PICKER_OPTIONS,
    gradePickerIndex: GRADE_PICKER_OPTIONS.indexOf(GRADE_OPTION_NONE)
  },

  onLoad() {
    this.setData({ isGuest: this.detectGuestMode() });
    this.bootstrap();
  },

  onShow() {
    const guestMode = this.detectGuestMode();
    if (guestMode !== this.data.isGuest) {
      this.setData({ isGuest: guestMode });
    }
    const app = getApp();
    app.syncTabBar(); // 使用全局同步方法
    // 刷新数据
    if (!this.data.loading) {
      this.loadStats();
    }
  },

  async bootstrap() {
    this.setData({ loading: true });
    await Promise.all([
      this.loadProfile(),
      this.loadStats()
    ]);
    this.setData({ loading: false });
  },

  detectGuestMode() {
    const app = getApp();
    const supabase = app?.globalData?.supabase || {};
    const userId = supabase.userId || wx.getStorageSync('user_id') || wx.getStorageSync('syllaby_user_id');
    const token = supabase.accessToken || wx.getStorageSync('access_token');
    if (!userId) return true;
    if (userId === DEMO_USER_ID) return true;
    return !token;
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

      if (!userId) {
        console.warn('未找到用户ID，使用默认统计数据');
        this.setData({ stats: DEFAULT_STATS });
        return;
      }

      console.log('开始加载个人主页统计数据，用户ID:', userId);

      // 并行加载所有统计数据
      const [focusStats, tasks, courses, resources] = await Promise.all([
        fetchFocusStats(userId).catch(err => {
          console.warn('专注统计获取失败:', err);
          return null;
        }),
        fetchTasks(userId).catch(err => {
          console.warn('任务数据获取失败:', err);
          return [];
        }),
        fetchCourses(userId).catch(err => {
          console.warn('课程数据获取失败:', err);
          return [];
        }),
        fetchResources(userId).catch(err => {
          console.warn('资源数据获取失败:', err);
          return [];
        })
      ]);

      console.log('个人主页数据获取完成:', {
        focusStats: focusStats,
        tasks: tasks?.length,
        courses: courses?.length,
        resources: resources?.length
      });

      const todayMinutes = Number(focusStats?.today_minutes) || 0;
      const weekMinutes = Number(focusStats?.week_minutes) || 0;
      const totalFocusMinutes = Math.max(0, Math.floor(Number(focusStats?.total_minutes) || 0));
      const totalSessions = Number(focusStats?.total_sessions) || 0;
      const continuousDays = Number(focusStats?.continuous_days) || 0;
      
      const stats = {
        today_focus_minutes: todayMinutes,
        week_focus_minutes: weekMinutes,
        total_focus_minutes: totalFocusMinutes,
        total_focus_hours: Math.floor(totalFocusMinutes / 60),
        total_sessions: totalSessions,
        completed_tasks: Array.isArray(tasks) ? tasks.filter(t => t.is_completed).length : 0,
        total_tasks: Array.isArray(tasks) ? tasks.length : 0,
        total_resources: Array.isArray(resources) ? resources.length : 0,
        total_courses: Array.isArray(courses) ? courses.length : 0,
        continuous_days: continuousDays
      };

      this.setData({ stats });
      wx.setStorageSync('profile_stats', stats);
      console.log('个人主页统计数据已更新:', stats);
    } catch (err) {
      console.error('load stats failed', err);
      const cached = wx.getStorageSync('profile_stats');
      this.setData({ stats: cached || DEFAULT_STATS });
    }
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

  navigateToTasks() {
    wx.vibrateShort({ type: 'light' });
    wx.navigateTo({
      url: '/pages/tasks/index'
    });
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
        avatar_url: profile.avatar_url || '',
        avatar_temp_path: '',
        avatar_temp_name: ''
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

  goLogin() {
    wx.navigateTo({ url: '/pages/login/index' });
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
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        const tempFilePath = file.tempFilePath;
        const extension = (tempFilePath.split('.').pop() || 'jpg').toLowerCase();
        const fileName = `avatar.${extension}`;

        const applyAvatar = (finalPath) => {
          this.setData({
            'editForm.avatar_url': finalPath,
            'editForm.avatar_temp_path': finalPath,
            'editForm.avatar_temp_name': fileName
          });
        };

        wx.compressImage({
          src: tempFilePath,
          quality: 80,
          success: (compressRes) => {
            applyAvatar(compressRes.tempFilePath);
          },
          fail: () => {
            applyAvatar(tempFilePath);
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
            'editForm.avatar_url': '',
            'editForm.avatar_temp_path': '',
            'editForm.avatar_temp_name': ''
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
        success: (res) => resolve(res.data),
        fail: (err) => reject(err)
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
    const {
      avatar_url: avatarPreview,
      avatar_temp_path: avatarTempPath,
      avatar_temp_name: avatarTempName
    } = this.data.editForm;
    let avatarUrl = avatarPreview;

    const payload = {
      nickname,
      school_name: schoolName,
      grade: normalizedGrade || null,
      bio: (this.data.editForm.bio || '').trim()
    };
    this.setData({ savingProfile: true });
    wx.showLoading({ title: '处理中...' });
    try {
      if (avatarTempPath) {
        try {
          const fileName = avatarTempName || `avatar_${Date.now()}.jpg`;
          const uploadResult = await uploadToStorage('avatars', avatarTempPath, fileName, {
            userId,
            token: accessToken
          });
          avatarUrl = uploadResult.publicUrl;
        } catch (uploadErr) {
          console.warn('avatar upload failed, fallback to base64', uploadErr);
          wx.showToast({ title: '头像上传受限，已改为本地保存', icon: 'none' });
          try {
            const base64Data = await this.getImageBase64(avatarTempPath);
            avatarUrl = `data:image/jpeg;base64,${base64Data}`;
          } catch (readErr) {
            console.error('read avatar as base64 failed', readErr);
            throw uploadErr;
          }
        }
      }
      await updateProfile(userId, { ...payload, avatar_url: avatarUrl || null });
      const nextProfile = {
        ...this.data.profile,
        ...payload,
        grade: normalizedGrade || '',
        avatar_url: avatarUrl || this.data.profile.avatar_url || ''
      };
      this.setData({
        profile: nextProfile,
        editModalVisible: false,
        gradePickerIndex: getGradePickerIndex(normalizedGrade),
        editForm: {
          ...this.data.editForm,
          avatar_temp_path: '',
          avatar_temp_name: '',
          avatar_url: nextProfile.avatar_url
        }
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
    return {
      title: `我在 Syllaby 已累计专注 ${stats.total_focus_hours || 0} 小时，一起来学习吧！`,
      path: '/pages/login/index'
    };
  }
});
