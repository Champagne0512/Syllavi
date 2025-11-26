Component({
  properties: {
    course: {
      type: Object,
      value: {}
    },
    focused: {
      type: Boolean,
      value: false
    }
  },
  methods: {
    handleTap() {
      this.triggerEvent('open', { course: this.data.course });
    },
    handleLongPress() {
      wx.vibrateShort({ type: 'light' });
      this.triggerEvent('pin', { course: this.data.course });
    }
  }
});
