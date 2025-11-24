import {
  DEMO_USER_ID,
  wechatLoginWithCode,
  emailPasswordLogin,
  emailPasswordSignUp
} from '../../utils/supabase';

Page({
  data: {
    wechatLoading: false,
    formLoading: false,
    authMode: 'login',
    form: {
      email: '',
      password: '',
      confirm: ''
    },
    canSubmit: false,
    errorMessage: ''
  },
  onLoad() {
    this.loadingOverlayVisible = false;
    const token = wx.getStorageSync('access_token');
    const userId =
      wx.getStorageSync('user_id') || wx.getStorageSync('syllaby_user_id');
    if (token && userId) {
      wx.switchTab({ url: '/pages/hub/index' });
    }
  },
  isFormComplete(form, mode) {
    if (!form?.email || !form?.password) return false;
    if (mode === 'register' && !form?.confirm) return false;
    return true;
  },
  setAuthMode(e) {
    const { mode } = e?.currentTarget?.dataset || {};
    if (!mode || mode === this.data.authMode) return;
    this.setData({
      authMode: mode,
      canSubmit: this.isFormComplete(this.data.form, mode),
      errorMessage: ''
    });
  },
  handleInput(e) {
    const field = e?.currentTarget?.dataset?.field;
    if (!field) return;
    const rawValue = e.detail?.value || '';
    const value =
      field === 'password' || field === 'confirm'
        ? rawValue
        : rawValue.trim();
    const nextForm = { ...this.data.form, [field]: value };
    this.setData({
      form: nextForm,
      canSubmit: this.isFormComplete(nextForm, this.data.authMode),
      errorMessage: ''
    });
  },
  async handleWechatLogin() {
    if (this.data.wechatLoading) return;
    this.setData({ wechatLoading: true, errorMessage: '' });
    this.showGlobalLoading('登录中...');
    try {
      const { code } = await wx.login();
      if (!code) {
        throw new Error('无法获取登录凭证');
      }
      const data = await wechatLoginWithCode(code);
      const stored = this.persistSession(data, data.user?.id);
      if (!stored) {
        throw new Error('无法写入会话信息');
      }
      this.clearForm();
      this.goHome();
    } catch (err) {
      console.warn('Login failed', err);
      this.showError('登录失败，可先体验 Demo');
    } finally {
      this.hideGlobalLoading();
      this.setData({ wechatLoading: false });
    }
  },
  async handleEmailAuth() {
    if (this.data.formLoading || !this.data.canSubmit) return;
    if (!this.validateForm()) return;
    this.setData({ formLoading: true });
    const isLogin = this.data.authMode === 'login';
    this.showGlobalLoading(isLogin ? '登录中...' : '注册中...');
    const email = this.data.form.email.trim().toLowerCase();
    const password = this.data.form.password;
    try {
      const response = isLogin
        ? await emailPasswordLogin(email, password)
        : await emailPasswordSignUp(email, password);
      const stored = this.persistSession(response, response?.user?.id);
      if (stored) {
        this.clearForm();
        this.showError('');
        this.goHome();
        return;
      }
      if (!isLogin) {
        this.showError('');
        wx.showModal({
          title: '注册成功',
          content: '验证邮件已发送，请完成激活后再使用邮箱登录。',
          confirmText: '好的',
          showCancel: false
        });
        this.setData({
          authMode: 'login',
          form: { email, password: '', confirm: '' },
          canSubmit: false
        });
        return;
      }
      this.showError('无法获取登录凭证，请稍后再试');
    } catch (err) {
      console.warn('Email auth failed', err);
      const errorCode =
        err?.data?.error_code || err?.error_code || err?.code || '';
      const message =
        err?.data?.error_description ||
        err?.data?.message ||
        err?.message ||
        '操作失败，请稍后再试';
      if (errorCode === 'email_address_invalid') {
        this.showError('邮箱格式或域名被限制，请更换邮箱或联系管理员添加白名单');
      } else if (/Invalid login credentials/i.test(message)) {
        this.showError('邮箱或密码不正确');
      } else if (/User already registered/i.test(message)) {
        this.showError('该邮箱已注册，请直接登录');
      } else {
        this.showError(message);
      }
    } finally {
      this.hideGlobalLoading();
      this.setData({ formLoading: false });
    }
  },
  validateForm() {
    const { authMode, form } = this.data;
    const email = form.email.trim();
    if (!email) {
      this.showError('请输入邮箱');
      return false;
    }
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!emailRegex.test(email)) {
      this.showError('请输入有效邮箱地址');
      return false;
    }
    if (!form.password || form.password.length < 6) {
      this.showError('请输入至少6位的密码');
      return false;
    }
    if (authMode === 'register' && form.password !== form.confirm) {
      this.showError('两次输入的密码不一致');
      return false;
    }
    this.showError('');
    return true;
  },
  showGlobalLoading(title = '处理中...') {
    if (this.loadingOverlayVisible) {
      wx.showLoading({ title, mask: true });
      return;
    }
    this.loadingOverlayVisible = true;
    wx.showLoading({ title, mask: true });
  },
  hideGlobalLoading() {
    if (!this.loadingOverlayVisible) return;
    this.loadingOverlayVisible = false;
    wx.hideLoading();
  },
  persistSession(sessionPayload = {}, fallbackUserId = DEMO_USER_ID) {
    if (!sessionPayload || !sessionPayload.access_token) {
      return false;
    }
    const expiresIn = sessionPayload.expires_in || 7 * 24 * 60 * 60;
    const expiresAt = Date.now() + expiresIn * 1000;
    const userId = sessionPayload.user?.id || fallbackUserId;

    wx.setStorageSync('access_token', sessionPayload.access_token);
    if (sessionPayload.refresh_token) {
      wx.setStorageSync('refresh_token', sessionPayload.refresh_token);
    }
    wx.setStorageSync('token_expires_at', expiresAt);
    wx.setStorageSync('user_id', userId);
    wx.setStorageSync('syllaby_user_id', userId);

    const app = getApp();
    if (app && app.globalData && app.globalData.supabase) {
      app.globalData.supabase.userId = userId;
      app.globalData.supabase.accessToken = sessionPayload.access_token;
    }
    return true;
  },
  clearForm() {
    this.setData({
      form: { email: '', password: '', confirm: '' },
      canSubmit: false
    });
  },
  showError(message = '') {
    this.setData({ errorMessage: message });
    if (message) {
      wx.showToast({ title: message, icon: 'none' });
    }
  },
  goHome() {
    wx.switchTab({ url: '/pages/hub/index' });
  },
  skipLogin() {
    wx.removeStorageSync('access_token');
    wx.removeStorageSync('refresh_token');
    wx.removeStorageSync('token_expires_at');
    wx.setStorageSync('user_id', DEMO_USER_ID);
    wx.setStorageSync('syllaby_user_id', DEMO_USER_ID);
    const app = getApp();
    if (app && app.globalData && app.globalData.supabase) {
      app.globalData.supabase.userId = DEMO_USER_ID;
      app.globalData.supabase.accessToken = null;
    }
    this.showError('');
    this.goHome();
  }
});
