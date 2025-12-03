const { SUPABASE_URL, DEMO_USER_ID, refreshToken } = require('./utils/supabase');
const { GOTHAM_FONT_SOURCE } = require('./static/fonts/gotham-base64');

let DEV_SESSION_CONFIG = null;
try {
  const devConfig = require('./dev-config');
  DEV_SESSION_CONFIG = devConfig?.DEV_SESSION || null;
} catch (err) {
  DEV_SESSION_CONFIG = null;
}

const MORANDI = {
  mistBlue: '#9BB5CE',
  dustyPink: '#C9A5A0',
  olive: '#A3B18A',
  paper: '#F7F7F5',
  ink: '#1C1C1E',
  accent: '#FF5C00',
  klein: '#1148C4'
};

App({
  globalData: {
    userInfo: null,
    supabase: null,
    currentTab: 0, // 记录当前选中的tab索引
    theme: {
      palette: MORANDI,
      blur: 'backdrop-filter: blur(18px);',
      typography: {
        display: 'DINAlternate-Bold',
        mono: 'JetBrainsMono',
        body: 'NotoSansSC'
      }
    },
    userProfile: null,
    scheduleCache: [],
    tasks: []
  },

  onLaunch() {
    this.applyDevSession();
    this.initCloud();

    // 初始化用户数据
    this.initUserData();

    // 加载字体
    this.loadGothamFont();
  },

  initCloud() {
    if (!wx.cloud || typeof wx.cloud.init !== 'function') {
      console.warn('[Cloud] 当前基础库不支持云开发');
      return;
    }

    if (this._cloudReady) {
      return;
    }

    try {
      const envId = DEV_SESSION_CONFIG?.cloudEnv || wx.cloud.DYNAMIC_CURRENT_ENV;
      wx.cloud.init({ env: envId, traceUser: true });
      this._cloudReady = true;
      console.log('[Cloud] 初始化完成', envId || 'dynamic-env');
    } catch (error) {
      console.error('[Cloud] 初始化失败', error);
    }
  },

  applyDevSession() {
    if (!DEV_SESSION_CONFIG || !DEV_SESSION_CONFIG.enabled) {
      return;
    }

    const info = wx.getAccountInfoSync ? wx.getAccountInfoSync() : null;
    const envVersion = info?.miniProgram?.envVersion || 'release';
    if (envVersion === 'release' && !DEV_SESSION_CONFIG.allowRelease) {
      return;
    }

    const existingToken = wx.getStorageSync('access_token');
    if (existingToken && !DEV_SESSION_CONFIG.forceOverride) {
      return;
    }

    const { userId, accessToken, refreshToken: refreshTok, expiresAt, expiresInSeconds } = DEV_SESSION_CONFIG;
    if (userId) {
      wx.setStorageSync('user_id', userId);
      wx.setStorageSync('syllaby_user_id', userId);
    }
    if (accessToken) {
      wx.setStorageSync('access_token', accessToken);
    }
    if (refreshTok) {
      wx.setStorageSync('refresh_token', refreshTok);
    }
    const resolvedExpiresAt = expiresAt || (expiresInSeconds ? Date.now() + expiresInSeconds * 1000 : null);
    if (resolvedExpiresAt) {
      wx.setStorageSync('token_expires_at', resolvedExpiresAt);
    }

    console.log('[DevSession] 使用 dev-config.js 中的会话信息');
  },

  // 初始化用户数据
  initUserData() {
    try {
      const storedUserId =
        wx.getStorageSync('user_id') ||
        wx.getStorageSync('syllaby_user_id') ||
        DEMO_USER_ID;
      const accessToken = wx.getStorageSync('access_token') || null;
      const refreshTok = wx.getStorageSync('refresh_token') || null;
      const expiresAt = wx.getStorageSync('token_expires_at') || null;

      console.log('初始化用户数据:', {
        userId: storedUserId,
        hasToken: !!accessToken,
        hasRefreshToken: !!refreshTok,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null
      });

      this.globalData.supabase = {
        url: SUPABASE_URL,
        userId: storedUserId,
        accessToken
      };

      // 改进的登录态管理：检查 token 有效性
      this.checkAndRefreshToken(accessToken, refreshTok, expiresAt);
    } catch (error) {
      console.error('初始化用户数据失败:', error);
      // 降级到演示模式
      this.globalData.supabase = {
        url: SUPABASE_URL,
        userId: DEMO_USER_ID,
        accessToken: null
      };
    }
  },

  // 检查并刷新 token
  async checkAndRefreshToken(accessToken, refreshToken, expiresAt) {
    // 如果没有 token，不做处理
    if (!accessToken) {
      console.log('没有 access token，跳过刷新检查');
      return;
    }

    const now = Date.now();
    const tokenExpired = expiresAt ? now >= expiresAt : false;
    const oneDay = 24 * 60 * 60 * 1000;
    const willExpireSoon = expiresAt ? (expiresAt - now) < oneDay : false;

    console.log('Token 状态检查:', {
      hasToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      expired: tokenExpired,
      willExpireSoon: willExpireSoon,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null
    });

    // 如果 token 已过期或即将过期，尝试刷新
    if (tokenExpired || willExpireSoon) {
      if (refreshToken) {
        try {
          console.log('尝试刷新 token...');
          const refreshSuccess = await this.refreshSession(refreshToken);
          if (refreshSuccess) {
            console.log('Token 刷新成功');
          } else {
            console.warn('Token 刷新失败，但保持登录状态');
          }
        } catch (err) {
          console.warn('Token 刷新异常，保持当前登录状态:', err);
          // 刷新失败时不强制登出，让用户继续使用直到下次需要认证时再处理
        }
      } else {
        console.warn('Token 需要刷新但没有 refresh token');
      }
    } else {
      console.log('Token 有效，无需刷新');
    }
  },

  // 设置当前选中的tab
  setCurrentTab(index) {
    if (typeof index === 'number' && index >= 0 && index <= 4) {
      this.globalData.currentTab = index;
      console.log(`[App] 设置当前tab: ${index}`);
    }
  },

  // 获取当前选中的tab
  getCurrentTab() {
    return this.globalData.currentTab;
  },

  // 同步所有页面的tabBar状态
  syncTabBar() {
    const pages = getCurrentPages();
    const current = pages[pages.length - 1];
    if (current && current.getTabBar && current.getTabBar()) {
      const route = current.route.startsWith('/') ? current.route.slice(1) : current.route;
      const tabMap = {
        'pages/hub/index': 0,
        'pages/knowledge/index': 1,
        'pages/groups/index': 2,
        'pages/tools/index': 3,
        'pages/profile/index': 4
      };
      const index = tabMap[route];
      if (typeof index === 'number') {
        this.setCurrentTab(index);
        current.getTabBar().setSelected(index);
      }
    }
  },

  loadGothamFont() {
    if (!wx.loadFontFace) return;
    wx.loadFontFace({
      family: 'Gotham',
      source: GOTHAM_FONT_SOURCE,
      success: () => {
        console.log('Gotham字体加载成功');
      },
      fail: (err) => {
        console.warn('Failed to load Gotham font', err);
      }
    });
  },

  preloadGothamFont() {
    this.loadGothamFont();
  },

  setFontLoadingState(loading) {
    // 设置全局字体加载状态
    this.globalData.fontLoading = loading;
    
    // 如果页面已经存在，更新页面状态
    const pages = getCurrentPages();
    if (pages.length > 0) {
      const currentPage = pages[pages.length - 1];
      if (currentPage.setData) {
        currentPage.setData({
          fontLoading: loading
        });
      }
    }
  },

  async refreshSession(refreshTok) {
    try {
      const data = await refreshToken(refreshTok);
      
      // 检查刷新是否成功
      if (!data || !data.success || !data.access_token) {
        throw new Error('Token refresh failed: No valid token received');
      }
      
      const expiresIn = data.expires_in || 7 * 24 * 60 * 60;
      const expiresAt = Date.now() + expiresIn * 1000;

      wx.setStorageSync('access_token', data.access_token);
      wx.setStorageSync('refresh_token', data.refresh_token || refreshTok);
      wx.setStorageSync('token_expires_at', expiresAt);

      if (this.globalData.supabase) {
        this.globalData.supabase.accessToken = data.access_token;
      }
      
      console.log('Token 刷新成功');
      return true;
    } catch (err) {
      console.warn('refresh session failed', err);
      
      // 刷新失败时，清除过期的 token 信息，但保留用户ID
      wx.removeStorageSync('access_token');
      wx.removeStorageSync('token_expires_at');
      
      if (this.globalData.supabase) {
        this.globalData.supabase.accessToken = null;
      }
      
      // 不要清除 refresh_token，可能后续还能使用
      return false;
    }
  }
});
