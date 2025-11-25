const { DEMO_USER_ID, fetchProfile, updateProfile } = require('../../utils/supabase');

// 内联年级选项，避免模块依赖问题
const ALLOWED_GRADES = ['大一', '大二', '大三', '大四', '研一', '研二', '研三', '博士'];
const GRADE_OPTION_NONE = '暂不填写';
const GRADE_PICKER_OPTIONS = [...ALLOWED_GRADES, GRADE_OPTION_NONE];

const normalizeGradeInput = (grade) => {
  if (!grade) return '';
  return ALLOWED_GRADES.includes(grade) ? grade : '';
};

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
    saving: false,
    form: {
      nickname: '',
      school_name: '',
      grade: '',
      bio: ''
    },
    gradeOptions: GRADE_PICKER_OPTIONS,
    gradePickerIndex: GRADE_PICKER_OPTIONS.indexOf(GRADE_OPTION_NONE)
  },
  onLoad() {
    this.loadProfile();
  },
  async loadProfile() {
    this.setData({ loading: true });
    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      const rows = await fetchProfile(userId);
      const profile = Array.isArray(rows) && rows.length ? rows[0] : {};
      const normalizedGrade = sanitizeGrade(profile.grade || '');
      this.setData({
        loading: false,
        form: {
          nickname: profile.nickname || '',
          school_name: profile.school_name || '',
          grade: normalizedGrade,
          bio: profile.bio || ''
        },
        gradePickerIndex: getGradePickerIndex(normalizedGrade)
      });
    } catch (err) {
      console.error('load profile failed', err);
      // 即使加载失败也要显示界面，允许用户尝试保存
      this.setData({ loading: false });
    }
  },
  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({
      [`form.${field}`]: e.detail.value
    });
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
      'form.grade': gradeValue
    });
  },
  async saveProfile() {
    if (this.data.saving) return;
    const app = getApp();
    const userId = app?.globalData?.supabase?.userId;
    const accessToken =
      wx.getStorageSync('access_token') || app?.globalData?.supabase?.accessToken;
    
    console.log('saveProfile debug:', { userId, accessToken: !!accessToken, isDemo: userId === DEMO_USER_ID });
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
    const nickname = (this.data.form.nickname || '').trim() || '同学';
    const schoolName = (this.data.form.school_name || '').trim();
    const bio = (this.data.form.bio || '').trim();
    const gradeInput = (this.data.form.grade || '').trim();
    const normalizedGrade = sanitizeGrade(gradeInput);
    if (gradeInput && !normalizedGrade) {
      wx.showToast({ title: '年级仅支持：大一至博士', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...' });
    const payload = {
      nickname,
      school_name: schoolName,
      grade: normalizedGrade || null,
      bio
    };
    try {
      console.log('Saving payload:', payload);
      const result = await updateProfile(userId, payload);
      console.log('Save result:', result);
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({
        form: {
          nickname,
          school_name: schoolName,
          grade: normalizedGrade,
          bio
        },
        gradePickerIndex: getGradePickerIndex(normalizedGrade)
      });
    } catch (err) {
      console.error('save profile failed', err);
      wx.hideLoading();
      if (err?.statusCode === 401) {
        wx.showToast({ title: '登录过期，请重新登录', icon: 'none' });
      } else if (err?.message) {
        wx.showToast({ title: err.message, icon: 'none' });
      } else if (err?.error) {
        wx.showToast({ title: err.error, icon: 'none' });
      } else {
        wx.showToast({ title: '保存失败，请稍后重试', icon: 'none' });
      }
    } finally {
      this.setData({ saving: false });
    }
  },
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需要重新登录才能同步云端数据，确认退出？',
      success: (res) => {
        if (!res.confirm) return;
        wx.clearStorageSync();
        const app = getApp();
        if (app && app.globalData && app.globalData.supabase) {
          app.globalData.supabase.userId = null;
          app.globalData.supabase.accessToken = null;
        }
        wx.reLaunch({ url: '/pages/login/index' });
      }
    });
  }
});
