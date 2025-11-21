Component({
  properties: {
    title: {
      type: String,
      value: 'Syllaby'
    },
    subtitle: {
      type: String,
      value: 'Academic Zen'
    }
  },
  data: {
    dateLabel: '',
    weekdayLabel: '',
    statusBarHeight: 44
  },
  lifetimes: {
    attached() {
      const info = wx.getSystemInfoSync();
      this.setData({ statusBarHeight: info.statusBarHeight || 44 });
      this.refreshDate();
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
    }
  }
});
