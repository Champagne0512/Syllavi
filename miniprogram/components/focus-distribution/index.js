Component({
  properties: {
    data: {
      type: Array,
      value: []
    },
    size: {
      type: String,
      value: 'medium' // small, medium, large
    },
    variant: {
      type: String,
      value: 'card' // card, embedded
    },
    showInsights: {
      type: Boolean,
      value: true
    },
    peakHours: {
      type: Array,
      value: []
    }
  },

  data: {
    canvasWidth: 300,
    canvasHeight: 300,
    centerX: 150,
    centerY: 150,
    radius: 100,
    innerRadius: 60,
    maxValue: 0,
    totalMinutes: 0,
    insights: [],
    selectedHour: null,
    animationProgress: 0,
    isAnimating: false
  },

  observers: {
    'data, size': function() {
      this.initCanvas();
    },
    'data': function() {
      this.generateInsights();
    }
  },

  lifetimes: {
    attached() {
      this.initCanvas();
    }
  },

  methods: {
    initCanvas() {
      const size = this.data.size || 'medium';
      const sizeMap = {
        small: { width: 200, height: 200, radius: 60, innerRadius: 35 },
        medium: { width: 300, height: 300, radius: 100, innerRadius: 60 },
        large: { width: 400, height: 400, radius: 140, innerRadius: 80 }
      };
      
      const config = sizeMap[size] || sizeMap.medium;
      const dataset = Array.isArray(this.data.data) ? this.data.data : [];
      const minutesList = dataset.map(item => (item && item.minutes) ? item.minutes : 0);
      const totalMinutes = minutesList.reduce((sum, value) => sum + value, 0);
      const rawMaxValue = minutesList.length ? Math.max.apply(null, minutesList) : 0;
      const maxValue = rawMaxValue > 0 ? rawMaxValue : 1;

      // 找出高峰时段
      const peakHours = this.findPeakHours(dataset);

      const applyLayout = (availableWidth) => {
        const minSize = config.width * 0.8;
        const maxSize = config.width * 1.2;
        const fallbackWidth = config.width;
        let resolvedWidth = fallbackWidth;
        if (typeof availableWidth === 'number' && availableWidth > 0) {
          resolvedWidth = Math.max(minSize, Math.min(availableWidth, maxSize));
        }
        const center = resolvedWidth / 2;
        const scale = resolvedWidth / config.width;

        this.setData({
          canvasWidth: resolvedWidth,
          canvasHeight: resolvedWidth,
          centerX: center,
          centerY: center,
          radius: config.radius * scale,
          innerRadius: config.innerRadius * scale,
          maxValue: maxValue,
          totalMinutes: totalMinutes,
          peakHours: peakHours
        });

        // 启动动画
        this.startAnimation();
      };

      wx.nextTick(() => {
        const query = this.createSelectorQuery().in(this);
        query.select('.chart-wrapper').boundingClientRect();
        query.exec(res => {
          const rect = Array.isArray(res) ? res[0] : null;
          const usableWidth = rect && rect.width ? rect.width - 20 : undefined;
          applyLayout(usableWidth);
        });
      });
    },

    drawChart() {
      const ctx = wx.createCanvasContext('focusChart', this);
      const { centerX, centerY, radius, innerRadius, maxValue, data, animationProgress } = this.data;
      
      // 清空画布
      ctx.clearRect(0, 0, this.data.canvasWidth, this.data.canvasHeight);
      
      // 绘制背景圆环
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.arc(centerX, centerY, innerRadius, 0, 2 * Math.PI, true);
      ctx.closePath();
      ctx.setFillStyle('rgba(135, 168, 164, 0.1)');
      ctx.fill();
      
      // 绘制24小时数据
      data.forEach((item, index) => {
        if (item.minutes > 0) {
          const startAngle = (index * 15 - 90) * Math.PI / 180; // 每小时15度，从12点开始
          const endAngle = ((index + 1) * 15 - 90) * Math.PI / 180;
          
          // 计算外半径（根据数据值动态调整）
          const normalizedValue = item.minutes / maxValue;
          const dynamicRadius = innerRadius + (radius - innerRadius) * normalizedValue * animationProgress;
          
          // 绘制扇形
          ctx.beginPath();
          ctx.arc(centerX, centerY, dynamicRadius, startAngle, endAngle);
          ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
          ctx.closePath();
          
          // 设置颜色和透明度
          const opacity = (0.3 + normalizedValue * 0.7) * animationProgress; // 0.3-1.0的透明度
          
          // 高峰时段使用特殊颜色
          const isPeakHour = this.data.peakHours.includes(index);
          if (isPeakHour) {
            ctx.setFillStyle(`rgba(224, 142, 121, ${opacity})`);
          } else {
            ctx.setFillStyle(`rgba(135, 168, 164, ${opacity})`);
          }
          ctx.fill();
          
          // 添加边框
          ctx.setStrokeStyle(`rgba(135, 168, 164, ${opacity * 0.8})`);
          ctx.setLineWidth(1);
          ctx.stroke();
        }
      });
      
      // 绘制时间标签
      ctx.setFontSize(20);
      ctx.setFillStyle('rgba(45, 52, 54, 0.8)');
      ctx.setTextAlign('center');
      ctx.setTextBaseline('middle');
      
      // 绘制主要时间点（12点、3点、6点、9点）
      const timeLabels = [
        { hour: 0, label: '0', angle: -90 },
        { hour: 6, label: '6', angle: 0 },
        { hour: 12, label: '12', angle: 90 },
        { hour: 18, label: '18', angle: 180 }
      ];
      
      timeLabels.forEach(({ label, angle }) => {
        const labelRadius = radius + 20;
        const x = centerX + labelRadius * Math.cos(angle * Math.PI / 180);
        const y = centerY + labelRadius * Math.sin(angle * Math.PI / 180);
        ctx.fillText(label, x, y);
      });
      
      // 绘制中心点
      ctx.beginPath();
      ctx.arc(centerX, centerY, 3, 0, 2 * Math.PI);
      ctx.setFillStyle('rgba(135, 168, 164, 0.8)');
      ctx.fill();
      
      // 绘制中心统计信息
      if (animationProgress > 0.5) {
        const centerOpacity = (animationProgress - 0.5) * 2;
        ctx.setFontSize(24);
        ctx.setFillStyle(`rgba(45, 52, 54, ${centerOpacity})`);
        ctx.setTextAlign('center');
        ctx.setTextBaseline('middle');
        ctx.fillText(`${this.data.totalMinutes}分`, centerX, centerY - 10);
        
        ctx.setFontSize(16);
        ctx.setFillStyle(`rgba(45, 52, 54, ${centerOpacity * 0.7})`);
        ctx.fillText('今日总计', centerX, centerY + 15);
      }
      
      ctx.draw();
    },

    // 点击事件处理
    onCanvasTap(e) {
      const { x, y } = e.detail;
      const { centerX, centerY, innerRadius, radius, data } = this.data;
      
      // 计算点击位置到中心的距离
      const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
      
      // 检查是否在圆环范围内
      if (distance >= innerRadius && distance <= radius) {
        // 计算角度
        const angle = Math.atan2(y - centerY, x - centerX);
        const degrees = (angle * 180 / Math.PI + 90 + 360) % 360;
        const hour = Math.floor(degrees / 15);
        
        if (hour >= 0 && hour < 24 && data[hour]) {
          this.setData({ selectedHour: hour });
          this.triggerEvent('hourtap', {
            hour: hour,
            data: data[hour]
          });
        }
      }
    },

    // 找出高峰时段
    findPeakHours(data) {
      if (!data || data.length === 0) return [];
      
      const avgMinutes = data.reduce((sum, item) => sum + (item.minutes || 0), 0) / data.length;
      const threshold = avgMinutes * 1.5; // 高于平均值1.5倍算高峰
      
      return data
        .map((item, index) => ({ hour: index, minutes: item.minutes || 0 }))
        .filter(item => item.minutes > threshold)
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 3)
        .map(item => item.hour);
    },

    // 生成洞察
    generateInsights() {
      const data = this.data.data || [];
      const insights = [];
      
      if (data.length === 0) {
        insights.push({ type: 'empty', text: '暂无数据，开始专注后会显示全天节奏' });
      } else {
        const totalMinutes = data.reduce((sum, item) => sum + (item.minutes || 0), 0);
        const activeHours = data.filter(item => item.minutes > 0).length;
        const peakHours = this.findPeakHours(data);
        
        if (totalMinutes > 0) {
          insights.push({ type: 'total', text: `今日专注 ${totalMinutes} 分钟` });
        }
        
        if (activeHours > 0) {
          insights.push({ type: 'active', text: `活跃时段 ${activeHours} 个` });
        }
        
        if (peakHours.length > 0) {
          const peakLabels = peakHours.map(h => `${h}:00`).join('、');
          insights.push({ type: 'peak', text: `高峰时段 ${peakLabels}` });
        }
      }
      
      this.setData({ insights });
    },

    // 启动动画
    startAnimation() {
      this.setData({ isAnimating: true, animationProgress: 0 });
      
      const animate = () => {
        if (this.data.animationProgress < 1) {
          const newProgress = Math.min(this.data.animationProgress + 0.05, 1);
          this.setData({ animationProgress: newProgress });
          this.drawChart();
          
          if (newProgress < 1) {
            setTimeout(animate, 16); // 约60fps
          } else {
            this.setData({ isAnimating: false });
          }
        }
      };
      
      setTimeout(animate, 100);
    },

    // 格式化时间
    formatHour(hour) {
      return `${hour.toString().padStart(2, '0')}:00`;
    }
  }
});
