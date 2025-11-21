import { DEMO_USER_ID, wechatLoginWithCode } from '../../utils/supabase';

Page({
  data: {
    loading: false
  },
  onLoad() {
    const token = wx.getStorageSync('access_token');
    const userId =
      wx.getStorageSync('user_id') || wx.getStorageSync('syllaby_user_id');
    if (token && userId) {
      wx.switchTab({ url: '/pages/hub/index' });
    }
  },
  async handleLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    wx.showLoading({ title: '登录中...' });
    try {
      const { code } = await wx.login();
      if (!code) {
        throw new Error('无法获取登录凭证');
      }
      const data = await wechatLoginWithCode(code);

      wx.setStorageSync('access_token', data.access_token);
      wx.setStorageSync('refresh_token', data.refresh_token || '');
      wx.setStorageSync('user_id', data.user?.id || DEMO_USER_ID);
      wx.setStorageSync('syllaby_user_id', data.user?.id || DEMO_USER_ID);

      const app = getApp();
      if (app && app.globalData && app.globalData.supabase) {
        app.globalData.supabase.userId =
          data.user?.id || app.globalData.supabase.userId;
        app.globalData.supabase.accessToken = data.access_token;
      }

      wx.hideLoading();
      wx.switchTab({ url: '/pages/hub/index' });
    } catch (err) {
      console.warn('Login failed', err);
      wx.hideLoading();
      wx.showToast({
        title: '登录失败，可先体验 Demo',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },
  skipLogin() {
    wx.setStorageSync('user_id', DEMO_USER_ID);
    wx.setStorageSync('syllaby_user_id', DEMO_USER_ID);
    wx.switchTab({ url: '/pages/hub/index' });
  }
});

