Component({
  data: {
    selected: 0,
    list: [
      { pagePath: 'pages/hub/index', text: '课程与待办' },
      { pagePath: 'pages/knowledge/index', text: '资料' },
      { pagePath: 'pages/groups/index', text: '学习小组' },
      { pagePath: 'pages/tools/index', text: '专注' },
      { pagePath: 'pages/profile/index', text: '个人' }
    ],
    safeBottom: 0
  },
  lifetimes: {
    attached() {
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const safeBottom = windowInfo.safeArea?.bottom
        ? windowInfo.screenHeight - windowInfo.safeArea.bottom
        : windowInfo.safeArea?.bottomInset || 0;
      this.setData({ safeBottom });
      this.syncSelected();
      
      // 监听页面显示事件
      this.pageShowListener = this.syncSelected.bind(this);
    },
    detached() {
      // 清理监听器
      this.pageShowListener = null;
    }
  },
  methods: {
    switchTab(e) {
      const { index, path } = e.currentTarget.dataset;
      console.log(`[TabBar] 切换到索引 ${index}, 路径: ${path}`);
      
      // 立即更新选中状态，避免延迟
      this.setData({ selected: index });
      
      // 更新全局状态
      const app = getApp();
      if (app && app.setCurrentTab) {
        app.setCurrentTab(index);
      }
      
      wx.vibrateShort({ type: 'light' });
      const target = path?.startsWith('/') ? path : `/${path}`;
      wx.switchTab({
        url: target,
        success: () => {
          console.log(`[TabBar] 成功切换到: ${target}`);
          // 切换成功后再次同步，确保状态一致
          setTimeout(() => {
            this.syncSelected();
          }, 100);
        },
        fail(err) {
          console.error('[TabBar] switchTab failed', err);
          // 失败时恢复原状态
          this.syncSelected();
        }
      });
    },
    setSelected(index) {
      if (typeof index === 'number' && index >= 0 && index < this.data.list.length) {
        console.log(`[TabBar] 设置选中索引: ${index}`);
        this.setData({ selected: index });
        
        // 同时更新全局状态
        const app = getApp();
        if (app && app.setCurrentTab) {
          app.setCurrentTab(index);
        }
      }
    },
    syncSelected() {
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      if (!current || !current.route) return;
      
      const route = current.route.startsWith('/') ? current.route.slice(1) : current.route;
      const matchedIndex = this.data.list.findIndex((item) => item.pagePath === route);
      
      if (matchedIndex >= 0) {
        if (matchedIndex !== this.data.selected) {
          console.log(`[TabBar] 同步选中状态: ${this.data.selected} -> ${matchedIndex}, 路由: ${route}`);
          this.setData({ selected: matchedIndex });
          
          // 同时更新全局状态
          const app = getApp();
          if (app && app.setCurrentTab) {
            app.setCurrentTab(matchedIndex);
          }
        }
      } else {
        console.warn(`[TabBar] 未找到匹配的路由: ${route}`);
      }
    },
    
    // 强制刷新方法，用于调试
    forceSync() {
      console.log('[TabBar] 强制同步状态');
      this.syncSelected();
    }
  }
});
