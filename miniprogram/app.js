import { SUPABASE_URL, DEMO_USER_ID } from './utils/supabase';

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
    this.globalData.supabase = {
      url: SUPABASE_URL,
      userId: wx.getStorageSync('syllaby_user_id') || DEMO_USER_ID
    };
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
  }
});
