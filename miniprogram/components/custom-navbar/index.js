Component({
  properties: {
    title: {
      type: String,
      value: 'Syllaby'
    },
    subtitle: {
      type: String,
      value: 'Academic Zen'
    },
    showBack: {
      type: Boolean,
      value: false
    }
  },
  observers: {
    title(value) {
      this.normalizeTitle(value);
    }
  },
  data: {
    dateLabel: '',
    weekdayLabel: '',
    statusBarHeight: 44,
    hasRightSlot: false,
    displayTitle: 'Syllaby'
  },
  lifetimes: {
    attached() {
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      this.setData({ statusBarHeight: windowInfo.statusBarHeight || 44 });
      this.refreshDate();
      this.normalizeTitle(this.properties.title);
    }
  },
  methods: {
    refreshDate() {
      const now = new Date();
      const month = `${now.getMonth() + 1}`.padStart(2, '0');
      const day = `${now.getDate()}`.padStart(2, '0');
      const weekdayMap = ['日', '一', '二', '三', '四', '五', '六'];
      this.setData({
        dateLabel: `${month} · ${day}`,
        weekdayLabel: `周${weekdayMap[now.getDay()]}`
      });
    },
    normalizeTitle(raw) {
      const text = typeof raw === 'string' ? raw : '';
      const cleaned = text.replace(/日程管理/g, '').trim();
      this.setData({ displayTitle: cleaned || (text || 'Syllaby') });
    },
    handleBack() {
      if (getCurrentPages().length > 1) {
        wx.navigateBack({ delta: 1 });
      } else {
        wx.switchTab({ url: '/pages/tools/index' });
      }
    }
  }
});
