// 底部导航栏修复验证脚本
// 用于测试导航栏状态同步是否正常工作

const testTabBarSync = () => {
  console.log('=== 开始测试底部导航栏同步 ===');
  
  // 获取当前页面栈
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  
  if (!current) {
    console.error('无法获取当前页面');
    return;
  }
  
  console.log('当前页面路由:', current.route);
  
  // 获取tabBar实例
  const tabBar = current.getTabBar && current.getTabBar();
  
  if (!tabBar) {
    console.error('无法获取tabBar实例');
    return;
  }
  
  console.log('tabBar当前选中索引:', tabBar.data.selected);
  
  // 获取app实例
  const app = getApp();
  if (app && app.getCurrentTab) {
    console.log('app全局tab索引:', app.getCurrentTab());
  }
  
  // 测试同步方法
  if (app && app.syncTabBar) {
    console.log('调用全局同步方法...');
    app.syncTabBar();
    
    setTimeout(() => {
      console.log('同步后的tabBar选中索引:', tabBar.data.selected);
      console.log('同步后的app全局tab索引:', app.getCurrentTab());
      
      // 验证路由和索引是否匹配
      const routeMap = {
        'pages/hub/index': 0,
        'pages/knowledge/index': 1,
        'pages/groups/index': 2,
        'pages/tools/index': 3,
        'pages/profile/index': 4
      };
      
      const expectedIndex = routeMap[current.route];
      const actualIndex = tabBar.data.selected;
      
      if (expectedIndex === actualIndex) {
        console.log('✅ 导航栏同步正常');
      } else {
        console.error(`❌ 导航栏同步异常: 期望 ${expectedIndex}, 实际 ${actualIndex}`);
      }
    }, 200);
  }
};

// 导出测试函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testTabBarSync };
}