import { fetchProfile, updateProfile } from '../../utils/supabase';

Page({
  data: {
    loading: true,
    saving: false,
    form: {
      nickname: '',
      school_name: '',
      grade: ''
    }
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
      this.setData({
        loading: false,
        form: {
          nickname: profile.nickname || '',
          school_name: profile.school_name || '',
          grade: profile.grade || ''
        }
      });
    } catch (err) {
      console.warn('load profile failed', err);
      this.setData({ loading: false });
    }
  },
  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({
      [`form.${field}`]: e.detail.value
    });
  },
  async saveProfile() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...' });
    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      await updateProfile(userId, this.data.form);
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (err) {
      console.warn('save profile failed', err);
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'none' });
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

