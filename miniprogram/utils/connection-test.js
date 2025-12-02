// 数据库连接测试工具
const { request, SUPABASE_URL } = require('./supabase.js');

async function testConnection() {
  console.log('开始测试数据库连接...');
  
  try {
    // 测试基本连接
    console.log('1. 测试基本连接...');
    const healthCheck = await request('', {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    console.log('✓ 基本连接正常');
    
    // 测试表访问
    console.log('2. 测试表访问...');
    try {
      const tables = await request('profiles', {
        method: 'HEAD',
        query: 'select=count(*)'
      });
      console.log('✓ 表访问正常');
    } catch (tableError) {
      console.warn('⚠ 表访问可能存在问题:', tableError.message);
    }
    
    // 测试认证
    console.log('3. 测试认证...');
    const token = wx.getStorageSync('access_token');
    if (token) {
      console.log('✓ 找到访问令牌');
    } else {
      console.warn('⚠ 未找到访问令牌，将使用匿名访问');
    }
    
    console.log('数据库连接测试完成');
    return { success: true, message: '连接测试通过' };
    
  } catch (error) {
    console.error('数据库连接测试失败:', error);
    return { success: false, error: error.message };
  }
}

async function diagnoseConnection() {
  console.log('开始诊断数据库连接问题...');
  
  const diagnosis = {
    url: SUPABASE_URL,
    urlValid: false,
    reachable: false,
    authValid: false,
    tablesAccessible: false
  };
  
  // 检查URL格式
  try {
    new URL(SUPABASE_URL);
    diagnosis.urlValid = true;
    console.log('✓ URL格式有效');
  } catch (urlError) {
    console.error('✗ URL格式无效:', urlError.message);
    return diagnosis;
  }
  
  // 测试网络可达性
  try {
    await request('', { method: 'HEAD' });
    diagnosis.reachable = true;
    console.log('✓ 服务器可达');
  } catch (networkError) {
    console.error('✗ 服务器不可达:', networkError.message);
    return diagnosis;
  }
  
  // 测试认证
  try {
    const token = wx.getStorageSync('access_token');
    if (token) {
      await request('auth/v1/user', { method: 'GET' });
      diagnosis.authValid = true;
      console.log('✓ 认证有效');
    } else {
      console.warn('⚠ 未找到认证令牌');
    }
  } catch (authError) {
    console.warn('⚠ 认证可能有问题:', authError.message);
  }
  
  // 测试表访问
  try {
    await request('profiles', { method: 'HEAD', query: 'limit=1' });
    diagnosis.tablesAccessible = true;
    console.log('✓ 表可访问');
  } catch (tableError) {
    console.warn('⚠ 表访问有问题:', tableError.message);
  }
  
  return diagnosis;
}

module.exports = {
  testConnection,
  diagnoseConnection
};