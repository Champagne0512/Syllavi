Component({
  properties: {
    pattern: {
      type: String,
      value: 'accent'
    }
  },
  data: {
    expanded: false,
    itemAnimation: null
  },
  methods: {
    // 切换菜单状态
    toggleMenu() {
      // 触感反馈
      wx.vibrateShort({ type: 'light' });
      
      const expanded = !this.data.expanded;
      this.setData({ expanded });
      
      if (expanded) {
        // 创建菜单项动画
        this.createItemAnimation();
      }
    },
    
    // 关闭菜单
    closeMenu() {
      this.setData({ expanded: false });
    },
    
    // 创建菜单项动画
    createItemAnimation() {
      const animation = wx.createAnimation({
        duration: 300,
        timingFunction: 'ease-out'
      });
      
      this.setData({ itemAnimation: animation.export() });
    },
    
    // 防止触摸事件穿透
    preventTouch() {
      return;
    },
    
    // 添加项目
    addItem() {
      wx.vibrateShort({ type: 'light' });
      this.closeMenu();
      
      // 显示添加选项
      wx.showActionSheet({
        itemList: ['添加课程', '添加待办事项'],
        success: (res) => {
          if (res.tapIndex === 0) {
            // 添加课程逻辑
            wx.showToast({
              title: '添加课程功能',
              icon: 'none'
            });
          } else if (res.tapIndex === 1) {
            // 添加待办事项逻辑
            wx.showToast({
              title: '添加待办事项功能',
              icon: 'none'
            });
          }
        },
        fail: () => {
          // 用户取消选择
        }
      });
    },
    
    // 智能导入
    goAiUpload() {
      wx.vibrateShort({ type: 'light' });
      this.closeMenu();
      
      // 获取当前页面实例，调用扫描功能
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      
      if (currentPage && currentPage.handleScanImage) {
        // 如果当前页面有扫描功能，直接调用
        currentPage.handleScanImage();
      } else {
        // 否则导航到AI导入页面
        wx.navigateTo({ 
          url: '/pages/ai-import/index',
          success: () => {
            console.log('导航到AI导入页面');
          },
          fail: (err) => {
            console.error('导航失败:', err);
            wx.showToast({
              title: '导航失败',
              icon: 'error'
            });
          }
        });
      }
    }
  }
});
