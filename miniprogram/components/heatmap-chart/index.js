Component({
  properties: {
    data: {
      type: Array,
      value: []
    },
    showMonths: {
      type: Boolean,
      value: true
    },
    showWeekdays: {
      type: Boolean,
      value: true
    },
    variant: {
      type: String,
      value: 'card' // card, embedded
    }
  },

  data: {
    weeks: [],
    months: [],
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    colorLevels: [
      { min: 0, color: 'rgba(135, 168, 164, 0.1)' },      // 无数据
      { min: 1, color: 'rgba(135, 168, 164, 0.3)' },      // < 1小时
      { min: 60, color: 'rgba(135, 168, 164, 0.5)' },     // 1-2小时
      { min: 120, color: 'rgba(162, 177, 138, 0.7)' },    // 2-4小时
      { min: 240, color: 'rgba(224, 142, 121, 0.9)' }     // > 4小时
    ]
  },

  observers: {
    'data': function(data) {
      if (data && data.length > 0) {
        this.processData();
      }
    }
  },

  lifetimes: {
    attached() {
      if (this.data.data && this.data.data.length > 0) {
        this.processData();
      }
    }
  },

  methods: {
    // 处理数据为周格式
    processData() {
      const data = this.data.data;
      const weeks = [];
      const months = new Set();
      
      // 按日期排序
      data.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // 找到第一个周日作为起始
      let startDate = new Date(data[0].date);
      const startDay = startDate.getDay();
      startDate.setDate(startDate.getDate() - startDay);
      
      // 按周组织数据
      let currentWeek = [];
      let currentDate = new Date(startDate);
      
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const itemDate = new Date(item.date);
        
        // 填充空白日期
        while (currentDate < itemDate) {
          const dateStr = currentDate.toISOString().split('T')[0];
          const existingData = data.find(d => d.date === dateStr);
          
          currentWeek.push({
            date: dateStr,
            minutes: existingData ? existingData.minutes : 0,
            isEmpty: !existingData
          });
          
          // 记录月份
          months.add(currentDate.toLocaleDateString('zh-CN', { month: 'short' }));
          
          currentDate.setDate(currentDate.getDate() + 1);
          
          // 如果一周结束，开始新周
          if (currentDate.getDay() === 0 && currentWeek.length === 7) {
            weeks.push([...currentWeek]);
            currentWeek = [];
          }
        }
        
        // 添加当前日期的数据
        currentWeek.push({
          date: item.date,
          minutes: item.minutes,
          isEmpty: false
        });
        
        months.add(itemDate.toLocaleDateString('zh-CN', { month: 'short' }));
        currentDate.setDate(currentDate.getDate() + 1);
        
        // 如果一周结束，开始新周
        if (currentDate.getDay() === 0 && currentWeek.length === 7) {
          weeks.push([...currentWeek]);
          currentWeek = [];
        }
      }
      
      // 添加最后一周的数据
      if (currentWeek.length > 0) {
        // 补齐到7天
        while (currentWeek.length < 7) {
          const dateStr = currentDate.toISOString().split('T')[0];
          currentWeek.push({
            date: dateStr,
            minutes: 0,
            isEmpty: true
          });
          currentDate.setDate(currentDate.getDate() + 1);
        }
        weeks.push(currentWeek);
      }
      
      this.setData({
        weeks: weeks,
        months: Array.from(months)
      });
    },

    // 获取颜色
    getColor(minutes) {
      const levels = this.data.colorLevels;
      for (let i = levels.length - 1; i >= 0; i--) {
        if (minutes >= levels[i].min) {
          return levels[i].color;
        }
      }
      return levels[0].color;
    },

    // 点击日期
    onDayTap(e) {
      const { day } = e.currentTarget.dataset;
      if (day && !day.isEmpty) {
        this.triggerEvent('daytap', {
          date: day.date,
          minutes: day.minutes
        });
      }
    },

    // 格式化时间
    formatMinutes(minutes) {
      if (minutes === 0) return '无记录';
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      
      if (hours > 0) {
        return `${hours}小时${mins}分钟`;
      } else {
        return `${mins}分钟`;
      }
    }
  }
});
