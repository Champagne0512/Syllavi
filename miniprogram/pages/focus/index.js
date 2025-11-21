const gradients = [
  ['#92B4EC', '#F7F7F5'],
  ['#F4C095', '#1C1C1E'],
  ['#1148C4', '#FF5C00']
];

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
};

Page({
  data: {
    gradients,
    minutes: 45,
    remaining: 45 * 60,
    displayTime: formatTime(45 * 60),
    running: false,
    gradientIndex: 0,
    courseName: '',
    summaryCard: null
  },
  onLoad(query) {
    if (query.course) {
      this.setData({ courseName: decodeURIComponent(query.course) });
    }
    this.rollGradient();
  },
  onUnload() {
    clearInterval(this.timer);
    clearInterval(this.gradientTicker);
  },
  rollGradient() {
    const gradientIndex = (this.data.gradientIndex + 1) % gradients.length;
    this.setData({ gradientIndex });
  },
  startFocus() {
    if (this.data.running) return;
    wx.vibrateShort({ type: 'light' });
    this.setData({ running: true });
    this.gradientTicker = setInterval(() => this.rollGradient(), 15000);
    this.timer = setInterval(() => {
      const left = this.data.remaining - 1;
      if (left <= 0) {
        this.finishSession();
        return;
      }
      this.setData({ remaining: left, displayTime: formatTime(left) });
    }, 1000);
  },
  finishSession() {
    clearInterval(this.timer);
    clearInterval(this.gradientTicker);
    this.setData({
      running: false,
      summaryCard: {
        focus: ((this.data.minutes * 60 - this.data.remaining) / 60).toFixed(1),
        streak: Math.floor(Math.random() * 4) + 1
      },
      remaining: this.data.minutes * 60,
      displayTime: formatTime(this.data.minutes * 60)
    });
    wx.vibrateShort({ type: 'medium' });
  },
  stopFocus() {
    clearInterval(this.timer);
    clearInterval(this.gradientTicker);
    this.setData({
      running: false,
      remaining: this.data.minutes * 60,
      displayTime: formatTime(this.data.minutes * 60)
    });
  },
  adjustMinutes(e) {
    const minutes = e.detail.value;
    this.setData({ minutes, remaining: minutes * 60, displayTime: formatTime(minutes * 60) });
  }
});
