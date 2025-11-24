import { SUPABASE_URL, DEMO_USER_ID, refreshToken } from './utils/supabase';
import { GOTHAM_FONT_SOURCE } from './static/fonts/gotham-base64';

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
  onLaunch() {
    this.preloadGothamFont();
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
  globalData: {
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
  preloadGothamFont() {
    if (!wx.loadFontFace) return;
    wx.loadFontFace({
      family: 'Gotham',
      source: GOTHAM_FONT_SOURCE,
      success: () => {
        // font loaded
      },
      fail: (err) => {
        console.warn('Failed to load Gotham font', err);
      }
    });
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
