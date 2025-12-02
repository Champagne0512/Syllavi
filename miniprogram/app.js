const { SUPABASE_URL, DEMO_USER_ID, refreshToken } = require('./utils/supabase');
const { GOTHAM_FONT_SOURCE } = require('./static/fonts/gotham-base64');

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
    // 初始化云开发
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-4g8k5j2yf3c12345', // 你的云开发环境ID
        traceUser: true
      });
    }

    // 初始化用户数据
    this.initUserData();

    // 加载字体
    this.loadGothamFont();
  },

  // 初始化用户数据
  initUserData() {
    const storedUserId =
      wx.getStorageSync('user_id') ||
      wx.getStorageSync('syllaby_user_id') ||
      DEMO_USER_ID;
    const accessToken = wx.getStorageSync('access_token') || null;
    const refreshTok = wx.getStorageSync('refresh_token') || null;
    const expiresAt = wx.getStorageSync('token_expires_at') || null;

    this.globalData.supabase = {
      url: SUPABASE_URL,
      userId: storedUserId,
      accessToken
    };

    // 简单的登录态管理：发现 token 过期或即将过期时尝试刷新
    if (accessToken && expiresAt) {
      const now = Date.now();
      const diff = expiresAt - now;
      const oneDay = 24 * 60 * 60 * 1000;
      if (diff <= 0 && refreshTok) {
        // 已过期，尝试刷新
        this.refreshSession(refreshTok);
      } else if (diff > 0 && diff < oneDay && refreshTok) {
        // 24小时内过期，提前刷新
        this.refreshSession(refreshTok);
      }
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
      const expiresIn = data.expires_in || 7 * 24 * 60 * 60;
      const expiresAt = Date.now() + expiresIn * 1000;

      wx.setStorageSync('access_token', data.access_token);
      wx.setStorageSync('refresh_token', data.refresh_token || refreshTok);
      wx.setStorageSync('token_expires_at', expiresAt);

      if (this.globalData.supabase) {
        this.globalData.supabase.accessToken = data.access_token;
      }
    } catch (err) {
      console.warn('refresh session failed', err);
    }
  }
});
