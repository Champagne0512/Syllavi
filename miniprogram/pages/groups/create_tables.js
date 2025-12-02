// 创建数据库表的工具脚本
const SUPABASE_URL = 'https://nqixahasfhwofusuwsal.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xaXhhaGFzZmh3b2Z1c3V3c2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2NjE1MjcsImV4cCI6MjA3OTIzNzUyN30.o0MpDV0Q_84iv2xY2TSNBwyaJh0BP8n8pLaIxS1ott4';

// 创建学习小组表的SQL语句
const createStudyGroupsTableSQL = `
CREATE TABLE IF NOT EXISTS study_groups (
    _id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    avatar VARCHAR(200),
    description TEXT,
    groupCode VARCHAR(20) UNIQUE NOT NULL,
    maxMembers INT DEFAULT 20,
    memberCount INT DEFAULT 1,
    createdBy VARCHAR(50) NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

const createGroupMembersTableSQL = `
CREATE TABLE IF NOT EXISTS group_members (
    _id VARCHAR(50) PRIMARY KEY,
    groupId VARCHAR(50) NOT NULL,
    userId VARCHAR(50) NOT NULL,
    role VARCHAR(20) DEFAULT 'member',
    joinedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (groupId, userId)
);
`;

// 执行SQL语句的函数
function executeSQL(sql) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/rest/v1/rpc/execute_sql`,
      method: 'POST',
      data: { sql: sql },
      header: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('SQL执行成功:', sql);
          resolve(res.data);
        } else {
          console.error('SQL执行失败:', res);
          reject(res.data || res);
        }
      },
      fail(err) {
        console.error('网络请求失败:', err);
        reject(err);
      }
    });
  });
}

// 创建所有需要的表
async function createTables() {
  try {
    console.log('开始创建学习小组相关表...');
    
    // 创建study_groups表
    await executeSQL(createStudyGroupsTableSQL);
    console.log('study_groups表创建成功');
    
    // 创建group_members表
    await executeSQL(createGroupMembersTableSQL);
    console.log('group_members表创建成功');
    
    console.log('所有表创建完成！');
    return true;
    
  } catch (error) {
    console.error('创建表时发生错误:', error);
    return false;
  }
}

// 导出函数
module.exports = {
  createTables,
  executeSQL
};