// 数据库重置脚本
// 使用说明：
// 1. 在 Supabase 控制台中的 SQL 编辑器执行 010_reset_study_groups.sql
// 2. 或者在本地运行此脚本（需要配置环境变量）

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

// 如果在本地运行，需要配置环境变量
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.log('请在 Supabase 控制台的 SQL 编辑器中执行 010_reset_study_groups.sql 文件');
  console.log('文件路径: ./sql/010_reset_study_groups.sql');
  console.log('');
  console.log('执行步骤：');
  console.log('1. 登录 Supabase 控制台');
  console.log('2. 进入你的项目');
  console.log('3. 点击左侧菜单的 "SQL Editor"');
  console.log('4. 复制粘贴 010_reset_study_groups.sql 的内容');
  console.log('5. 点击 "RUN" 执行');
  process.exit(0);
}

// 本地执行代码（配置了环境变量时使用）
const resetDatabase = async () => {
  try {
    console.log('开始重置数据库...');
    
    // 读取 SQL 文件
    const fs = require('fs');
    const path = require('path');
    const sqlFilePath = path.join(__dirname, '../sql/010_reset_study_groups.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    
    console.log('SQL 文件已读取，准备执行...');
    
    // 这里可以添加通过 API 执行 SQL 的逻辑
    // 但 Supabase 通常不支持通过 REST API 执行 DDL 语句
    
    console.log('请在 Supabase 控制台的 SQL 编辑器中执行以下 SQL：');
    console.log('='.repeat(60));
    console.log(sqlContent);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('重置数据库失败:', error);
  }
};

resetDatabase();