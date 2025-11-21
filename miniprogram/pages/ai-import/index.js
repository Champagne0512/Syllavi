Page({
  data: {
    image: '',
    scanning: false,
    progress: 0,
    result: null
  },
  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        const image = res.tempFiles[0].tempFilePath;
        this.setData({ image });
        this.startScanning();
      }
    });
  },
  startScanning() {
    wx.vibrateShort({ type: 'light' });
    this.setData({ scanning: true, progress: 0, result: null });
    this.scanTicker = setInterval(() => {
      const value = this.data.progress + 20;
      if (value >= 100) {
        clearInterval(this.scanTicker);
        this.finishScan();
      } else {
        this.setData({ progress: value });
      }
    }, 400);
  },
  finishScan() {
    this.setData({
      scanning: false,
      progress: 100,
      result: [
        { type: 'exam', title: 'Java 程序设计', time: '周三 14:00', place: '302' },
        { type: 'homework', title: '提交实验报告', time: '11.28 23:59', place: '线上' }
      ]
    });
    wx.vibrateShort({ type: 'medium' });
  }
});
