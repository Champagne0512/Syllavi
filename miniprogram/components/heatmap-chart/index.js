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
    },
    summary: {
      type: Object,
      value: {
        rangeDays: 0,
        activeDays: 0,
        totalMinutes: 0,
        avgMinutes: 0
      }
    },
    showInsights: {
      type: Boolean,
      value: true
    }
  },

  data: {
    weeks: [],
    months: [],
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    colorLevels: [
      { min: 0, color: 'rgba(135, 168, 164, 0.1)', label: '无记录' },
      { min: 1, color: 'rgba(135, 168, 164, 0.3)', label: '< 1小时' },
      { min: 60, color: 'rgba(135, 168, 164, 0.5)', label: '1-2小时' },
      { min: 120, color: 'rgba(162, 177, 138, 0.7)', label: '2-4小时' },
      { min: 240, color: 'rgba(224, 142, 121, 0.9)', label: '> 4小时' }
    ],
    insights: [],
    selectedDate: null,
    maxStreak: 0,
    currentStreak: 0
  },

  observers: {
    'data': function(data) {
      if (Array.isArray(data) && data.length > 0) {
        this.processData();
        this.generateInsights();
        this.calculateStreaks();
      } else {
        this.setData({ weeks: [], months: [], insights: [] });
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
      const data = Array.isArray(this.data.data) ? [...this.data.data] : [];
      const weeks = [];
      const months = new Set();
      
      if (!data.length) {
        // 创建空数据结构用于显示
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 365); // 显示过去一年的数据
        
        const emptyWeeks = [];
        let currentDate = new Date(startDate);
        
        while (currentDate <= today) {
          const weekData = [];
          for (let i = 0; i < 7; i++) {
            const dateStr = currentDate.toISOString().split('T')[0];
            weekData.push({
              date: dateStr,
              minutes: 0,
              isEmpty: true
            });
            currentDate.setDate(currentDate.getDate() + 1);
          }
          emptyWeeks.push(weekData);
          
          // 记录月份
          const monthDate = new Date(currentDate);
          monthDate.setDate(monthDate.getDate() - 7);
          months.add(monthDate.toLocaleDateString('zh-CN', { month: 'short' }));
        }
        
        this.setData({
          weeks: emptyWeeks,
          months: Array.from(months)
        });
        return;
      }
      
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
          minutes: item.minutes || 0,
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
        this.setData({ selectedDate: day });
        this.triggerEvent('daytap', {
          date: day.date,
          minutes: day.minutes
        });
      }
    },

    // 生成洞察
    generateInsights() {
      const data = this.data.data || [];
      const insights = [];
      
      if (data.length === 0) {
        insights.push({ type: 'empty', text: '暂无数据，开始专注后会显示投入日历' });
      } else {
        const activeDays = data.filter(item => item.minutes > 0).length;
        const totalMinutes = data.reduce((sum, item) => sum + (item.minutes || 0), 0);
        const avgMinutes = activeDays > 0 ? Math.round(totalMinutes / activeDays) : 0;
        
        // 找出最活跃的一天
        const mostActiveDay = data.reduce((max, item) => 
          (item.minutes || 0) > (max.minutes || 0) ? item : max, data[0]);
        
        insights.push({ type: 'active', text: `活跃天数 ${activeDays} 天` });
        
        if (totalMinutes > 0) {
          insights.push({ type: 'total', text: `累计专注 ${this.formatMinutes(totalMinutes)}` });
        }
        
        if (avgMinutes > 0) {
          insights.push({ type: 'average', text: `日均专注 ${this.formatMinutes(avgMinutes)}` });
        }
        
        if (mostActiveDay && mostActiveDay.minutes > 0) {
          const date = new Date(mostActiveDay.date);
          const dateStr = `${date.getMonth() + 1}月${date.getDate()}日`;
          insights.push({ 
            type: 'peak', 
            text: `最活跃 ${dateStr} ${this.formatMinutes(mostActiveDay.minutes)}` 
          });
        }
      }
      
      this.setData({ insights });
    },

    // 计算连续天数
    calculateStreaks() {
      const data = this.data.data || [];
      if (data.length === 0) {
        this.setData({ maxStreak: 0, currentStreak: 0 });
        return;
      }
      
      // 按日期排序
      const sortedData = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let maxStreak = 0;
      let currentStreak = 0;
      let tempStreak = 0;
      let lastDate = null;
      
      for (let i = 0; i < sortedData.length; i++) {
        const item = sortedData[i];
        const currentDate = new Date(item.date);
        currentDate.setHours(0, 0, 0, 0);
        
        if (item.minutes > 0) {
          if (lastDate && (currentDate - lastDate) === 86400000) { // 正好相差一天
            tempStreak++;
          } else {
            tempStreak = 1;
          }
          
          maxStreak = Math.max(maxStreak, tempStreak);
          
          // 检查是否是当前连续天数（包含今天或昨天）
          const daysDiff = Math.floor((today - currentDate) / 86400000);
          if (daysDiff <= 1) {
            currentStreak = tempStreak;
          }
          
          lastDate = currentDate;
        } else {
          tempStreak = 0;
          lastDate = null;
        }
      }
      
      this.setData({ maxStreak, currentStreak });
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
