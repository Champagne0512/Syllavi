Component({
  properties: {
    data: {
      type: Array,
      value: []
    },
    size: {
      type: String,
      value: 'medium'
    },
    variant: {
      type: String,
      value: 'card'
    },
    showInsights: {
      type: Boolean,
      value: true
    }
  },

  data: {
    processedData: [],
    peakHours: [],
    totalMinutes: 0,
    activeHours: 0,
    maxMinutes: 0,
    insights: [],
    animationReady: false
  },

  observers: {
    'data': function(data) {
      if (Array.isArray(data) && data.length > 0) {
        this.processData(data);
      }
    }
  },

  lifetimes: {
    attached() {
      if (Array.isArray(this.properties.data) && this.properties.data.length > 0) {
        this.processData(this.properties.data);
      }
      // 触发动画
      setTimeout(() => {
        this.setData({ animationReady: true });
      }, 100);
    }
  },

  methods: {
    processData(rawData) {
      const data = rawData.map(item => ({
        hour: item.hour,
        minutes: item.minutes || 0,
        label: item.label || `${item.hour.toString().padStart(2, '0')}:00`
      }));

      const totalMinutes = data.reduce((sum, item) => sum + item.minutes, 0);
      const activeHours = data.filter(item => item.minutes > 0).length;
      const maxMinutes = Math.max(...data.map(item => item.minutes), 1);
      
      // 找出高峰时段（超过平均值1.5倍）
      const avgMinutes = totalMinutes / data.length;
      const threshold = avgMinutes * 1.5;
      const peakHours = data
        .filter(item => item.minutes > threshold)
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 3)
        .map(item => item.hour);

      // 处理数据，添加样式类
      const processedData = data.map(item => {
        const intensity = item.minutes / maxMinutes;
        let intensityClass = 'intensity-none';
        
        if (intensity > 0.8) intensityClass = 'intensity-high';
        else if (intensity > 0.5) intensityClass = 'intensity-medium';
        else if (intensity > 0.2) intensityClass = 'intensity-low';
        else if (intensity > 0) intensityClass = 'intensity-very-low';

        const isPeak = peakHours.includes(item.hour);
        
        return {
          ...item,
          intensityClass,
          isPeak,
          widthPercent: Math.round((item.minutes / maxMinutes) * 100)
        };
      });

      this.setData({
        processedData,
        peakHours,
        totalMinutes,
        activeHours,
        maxMinutes
      });

      this.generateInsights();
    },

    generateInsights() {
      const insights = [];
      
      if (this.data.totalMinutes === 0) {
        insights.push({
          type: 'empty',
          icon: '🎯',
          text: '开始专注，记录你的全天节奏'
        });
      } else {
        insights.push({
          type: 'total',
          icon: '⏱️',
          text: `今日专注 ${this.data.totalMinutes} 分钟`
        });

        if (this.data.activeHours > 0) {
          insights.push({
            type: 'active',
            icon: '📊',
            text: `${this.data.activeHours} 个活跃时段`
          });
        }

        if (this.data.peakHours.length > 0) {
          const peakLabels = this.data.peakHours
            .map(h => `${h}:00`)
            .join('、');
          insights.push({
            type: 'peak',
            icon: '🔥',
            text: `高峰时段 ${peakLabels}`
          });
        }
      }

      this.setData({ insights });
    },

    onHourTap(e) {
      const { hour, minutes, label } = e.currentTarget.dataset;
      if (minutes > 0) {
        this.triggerEvent('hourtap', {
          hour,
          data: { hour, minutes, label }
        });
      }
    },

    formatHour(hour) {
      return hour.toString().padStart(2, '0');
    }
  }
});