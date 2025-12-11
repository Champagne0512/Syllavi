const {
  DEMO_USER_ID,
  wechatLoginWithCode,
  emailPasswordLogin,
  emailPasswordSignUp
} = require('../../utils/supabase');

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
    this.checkExistingLogin();
    
    // 监听网络状态变化
    this.networkListener = (res) => {
      if (res.networkType === 'none') {
        this.showError('网络连接已断开');
      }
    };
    
    wx.onNetworkStatusChange(this.networkListener);
  },

  onUnload() {
    // 移除网络状态监听
    if (this.networkListener) {
      wx.offNetworkStatusChange(this.networkListener);
    }
  },

  onShow() {
    // 每次页面显示时重新检查登录状态
    // 这对于处理游客模式下切换到登录页面的情况很重要
    this.checkExistingLogin();
  },

  // 检查现有登录状态
  checkExistingLogin() {
    // 优先使用新的存储键名，兼容旧的键名
    const token = wx.getStorageSync('syllaby_access_token') || wx.getStorageSync('access_token');
    const refreshToken = wx.getStorageSync('syllaby_refresh_token') || wx.getStorageSync('refresh_token');
    const userId = wx.getStorageSync('syllaby_user_id') || wx.getStorageSync('user_id');
    const expiresAt = wx.getStorageSync('syllaby_token_expires_at') || wx.getStorageSync('token_expires_at');
    
    console.log('登录页面检查状态:', {
      userId,
      hasToken: !!token,
      hasRefreshToken: !!refreshToken,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null
    });
    
    // 如果没有用户信息，跳过检查
    if (!userId) {
      console.log('没有用户ID，显示登录界面');
      return;
    }
    
    // 如果是演示用户，检查来源页面再决定跳转
    if (userId === DEMO_USER_ID) {
      // 检查当前是从哪个页面跳转过来的
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      const prevPage = pages.length > 1 ? pages[pages.length - 2] : null;
      
      // 如果是从个人页面跳转过来，说明用户想要真正登录，不自动跳转
      if (prevPage && prevPage.route && prevPage.route.includes('profile')) {
        console.log('从个人页面跳转到登录，用户想要真正登录，不自动跳转');
        return;
      }
      
      // 否则按原逻辑跳转到首页
      console.log('演示用户，直接跳转首页');
      wx.switchTab({ url: '/pages/hub/index' });
      return;
    }
    
    // 检查 token 状态
    if (token) {
      const now = Date.now();
      const tokenExpired = expiresAt ? now >= expiresAt : false;
      const oneHour = 60 * 60 * 1000;
      const willExpireSoon = expiresAt ? (expiresAt - now) < oneHour : false;
      
      console.log('Token状态检查:', {
        expired: tokenExpired,
        willExpireSoon: willExpireSoon,
        timeLeft: expiresAt ? Math.floor((expiresAt - now) / 1000 / 60) + '分钟' : '未知'
      });
      
      // 如果 token 没有过期且不会很快过期，直接跳转
      if (!tokenExpired && !willExpireSoon) {
        console.log('Token有效，直接跳转首页');
        wx.switchTab({ url: '/pages/hub/index' });
        return;
      }
      
      // 如果 token 即将过期或已过期，但有 refresh token，尝试刷新
      if ((tokenExpired || willExpireSoon) && refreshToken) {
        console.log('Token需要刷新，尝试自动刷新');
        this.tryRefreshTokenAndLogin();
        return;
      }
      
      // 如果 token 过期且没有 refresh token，显示登录界面
      if (tokenExpired && !refreshToken) {
        console.log('Token已过期且无法刷新，显示登录界面');
        // 清除过期的token信息
        wx.removeStorageSync('syllaby_access_token');
        wx.removeStorageSync('access_token');
        wx.removeStorageSync('syllaby_token_expires_at');
        wx.removeStorageSync('token_expires_at');
        return;
      }
    }
    
    // 如果有 userId 但没有有效 token，可能是演示模式，需要检查来源页面
    if (!token && userId === DEMO_USER_ID) {
      // 检查当前是从哪个页面跳转过来的
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      const prevPage = pages.length > 1 ? pages[pages.length - 2] : null;
      
      // 如果是从个人页面跳转过来，说明用户想要真正登录，不自动跳转
      if (prevPage && prevPage.route && prevPage.route.includes('profile')) {
        console.log('从个人页面跳转到登录，用户想要真正登录，不自动跳转');
        return;
      }
      
      console.log('演示模式，直接跳转首页');
      wx.switchTab({ url: '/pages/hub/index' });
      return;
    }
    
    console.log('显示登录界面');
  },

  // 尝试刷新 token 并登录
  async tryRefreshTokenAndLogin() {
    const refreshToken = wx.getStorageSync('syllaby_refresh_token') || wx.getStorageSync('refresh_token');
    if (!refreshToken) {
      console.log('没有 refresh token，无法自动刷新');
      return;
    }
    
    try {
      console.log('开始自动刷新 token...');
      const { refreshToken: refreshTokenFunc } = require('../../utils/supabase');
      const result = await refreshTokenFunc();
      
      if (result && result.success) {
        console.log('自动刷新 token 成功');
        // 刷新成功后同步存储键名
        const userId = wx.getStorageSync('syllaby_user_id') || wx.getStorageSync('user_id');
        if (userId) {
          wx.setStorageSync('syllaby_user_id', userId);
          wx.setStorageSync('user_id', userId);
        }
        wx.switchTab({ url: '/pages/hub/index' });
      } else {
        console.warn('自动刷新 token 失败:', result);
        // 刷新失败时清除过期的token信息
        wx.removeStorageSync('syllaby_access_token');
        wx.removeStorageSync('access_token');
        wx.removeStorageSync('syllaby_token_expires_at');
        wx.removeStorageSync('token_expires_at');
      }
    } catch (error) {
      console.warn('自动刷新 token 异常:', error);
      // 刷新失败时清除过期的token信息
      wx.removeStorageSync('syllaby_access_token');
      wx.removeStorageSync('access_token');
      wx.removeStorageSync('syllaby_token_expires_at');
      wx.removeStorageSync('token_expires_at');
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
    
    // 检查网络连接
    const networkType = await this.checkNetworkConnection();
    if (networkType === 'none') {
      this.showError('网络不可用，请检查网络连接');
      return;
    }
    
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
      
      // 处理网络连接问题
      if (err.errMsg?.includes('request:fail') || 
          err.errMsg?.includes('timeout') ||
          err.errMsg?.includes('network')) {
        this.showError('网络连接不稳定，请检查网络后重试');
      } else {
        this.showError('登录失败，可先体验 Demo');
      }
    } finally {
      this.hideGlobalLoading();
      this.setData({ wechatLoading: false });
    }
  },
  async handleEmailAuth() {
    if (this.data.formLoading || !this.data.canSubmit) return;
    if (!this.validateForm()) return;
    
    // 检查网络连接
    const networkType = await this.checkNetworkConnection();
    if (networkType === 'none') {
      this.showError('网络不可用，请检查网络连接');
      return;
    }
    
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
      
      // 处理网络连接问题
      if (err.errMsg?.includes('request:fail') || 
          err.errMsg?.includes('timeout') ||
          err.errMsg?.includes('network')) {
        this.showError('网络连接不稳定，请检查网络后重试');
        return;
      }
      
      if (errorCode === 'email_address_invalid') {
        this.showError('邮箱格式或域名被限制，请更换邮箱或联系管理员添加白名单');
      } else if (errorCode === 'invalid_credentials' || /Invalid login credentials/i.test(message)) {
        // 提供更详细的错误信息和解决建议
        this.showError('邮箱或密码不正确');
        // 延迟显示解决建议，避免信息过载
        setTimeout(() => {
          wx.showModal({
            title: '登录失败',
            content: '可能的原因:\n1. 邮箱或密码输入有误\n2. 账户尚未激活（请检查验证邮件）\n3. 邮箱未在系统中注册',
            confirmText: '重试',
            showCancel: true,
            cancelText: '注册新账户',
            success: (modalRes) => {
              if (!modalRes.confirm) {
                // 用户选择注册新账户
                this.setData({
                  authMode: 'register',
                  form: { email: this.data.form.email, password: '', confirm: '' }
                });
              }
            }
          });
        }, 1000);
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

  // 检查网络连接状态
  checkNetworkConnection() {
    return new Promise((resolve) => {
      wx.getNetworkType({
        success: (res) => {
          resolve(res.networkType);
        },
        fail: () => {
          resolve('none'); // 如果无法检测，假设没有网络
        }
      });
    });
  },
  persistSession(sessionPayload = {}, fallbackUserId = DEMO_USER_ID) {
    if (!sessionPayload || !sessionPayload.access_token) {
      return false;
    }
    const expiresIn = sessionPayload.expires_in || 7 * 24 * 60 * 60;
    const expiresAt = Date.now() + expiresIn * 1000;
    const userId = sessionPayload.user?.id || fallbackUserId;

    // 同时保存新旧键名，确保兼容性
    wx.setStorageSync('access_token', sessionPayload.access_token);
    wx.setStorageSync('syllaby_access_token', sessionPayload.access_token);
    
    if (sessionPayload.refresh_token) {
      wx.setStorageSync('refresh_token', sessionPayload.refresh_token);
      wx.setStorageSync('syllaby_refresh_token', sessionPayload.refresh_token);
    }
    
    wx.setStorageSync('token_expires_at', expiresAt);
    wx.setStorageSync('syllaby_token_expires_at', expiresAt);
    
    wx.setStorageSync('user_id', userId);
    wx.setStorageSync('syllaby_user_id', userId);

    console.log('登录信息保存成功:', {
      userId,
      hasToken: !!sessionPayload.access_token,
      expiresAt: new Date(expiresAt).toISOString()
    });

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
    // 清除所有token信息
    wx.removeStorageSync('access_token');
    wx.removeStorageSync('syllaby_access_token');
    wx.removeStorageSync('refresh_token');
    wx.removeStorageSync('syllaby_refresh_token');
    wx.removeStorageSync('token_expires_at');
    wx.removeStorageSync('syllaby_token_expires_at');
    
    // 设置演示用户ID
    wx.setStorageSync('user_id', DEMO_USER_ID);
    wx.setStorageSync('syllaby_user_id', DEMO_USER_ID);
    
    const app = getApp();
    if (app && app.globalData && app.globalData.supabase) {
      app.globalData.supabase.userId = DEMO_USER_ID;
      app.globalData.supabase.accessToken = null;
    }
    
    console.log('切换到演示模式');
    this.showError('');
    this.goHome();
  }
});
