// 测试成就数据获取
const {
  fetchRemoteAchievementsSnapshot,
  fetchFocusStats,
  fetchFocusHeatmapRemote,
  fetchFocusDistributionRemote
} = require('./supabase');

async function testAchievementData() {
  console.log('开始测试成就数据获取...');
  
  const app = getApp();
  const userId = app?.globalData?.supabase?.userId || wx.getStorageSync('user_id');
  
  if (!userId) {
    console.error('未找到用户ID，请先登录');
    return;
  }
  
  console.log(`使用用户ID: ${userId}`);
  
  try {
    // 测试成就数据获取
    console.log('1. 测试成就数据获取...');
    const achievements = await fetchRemoteAchievementsSnapshot(userId);
    console.log('成就数据:', achievements);
    
    // 测试专注统计
    console.log('2. 测试专注统计...');
    const focusStats = await fetchFocusStats(userId);
    console.log('专注统计:', focusStats);
    
    // 测试热力图数据
    console.log('3. 测试热力图数据...');
    const heatmapData = await fetchFocusHeatmapRemote(userId, 30);
    console.log('热力图数据:', heatmapData?.length, '条记录');
    
    // 测试时段分布
    console.log('4. 测试时段分布...');
    const distributionData = await fetchFocusDistributionRemote(userId);
    console.log('时段分布数据:', distributionData?.length, '条记录');
    
    console.log('✓ 所有数据获取测试完成');
    
    return {
      success: true,
      achievements: achievements?.length || 0,
      focusStats: focusStats ? 'success' : 'failed',
      heatmapData: heatmapData?.length || 0,
      distributionData: distributionData?.length || 0
    };
    
  } catch (error) {
    console.error('测试失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 导出测试函数
module.exports = {
  testAchievementData
};