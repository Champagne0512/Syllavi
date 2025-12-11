const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// 创建客户端（使用service key以获得完整权限）
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// 测试连接
async function testConnection() {
  try {
    const { data, error } = await supabase.from('profiles').select('count').limit(1);
    if (error) throw error;
    console.log('✅ 数据库连接成功');
    return true;
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message);
    return false;
  }
}

// 简化的查询函数
async function query(table, options = {}) {
  try {
    const { select = '*', filters = {}, orderBy, limit = 50, offset = 0 } = options;
    
    let query = supabase.from(table).select(select, { count: 'exact' });
    
    // 添加过滤条件
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query = query.eq(key, value);
      }
    });
    
    // 添加排序
    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending !== false });
    }
    
    // 添加分页
    query = query.range(offset, offset + limit - 1);
    
    const { data, error, count } = await query;
    
    if (error) throw error;
    
    return {
      rows: data || [],
      rowCount: count || 0,
      success: true
    };
  } catch (error) {
    console.error('查询错误:', error);
    return {
      rows: [],
      rowCount: 0,
      success: false,
      error: error.message
    };
  }
}

// 插入数据
async function insert(table, data) {
  try {
    const { data: result, error } = await supabase.from(table).insert(data);
    
    if (error) throw error;
    
    return {
      rows: result || [],
      success: true
    };
  } catch (error) {
    console.error('插入错误:', error);
    return {
      rows: [],
      success: false,
      error: error.message
    };
  }
}

// 更新数据
async function update(table, filters, data) {
  try {
    let query = supabase.from(table).update(data);
    
    // 添加过滤条件
    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });
    
    const { data: result, error } = await query.select();
    
    if (error) throw error;
    
    return {
      rows: result || [],
      success: true
    };
  } catch (error) {
    console.error('更新错误:', error);
    return {
      rows: [],
      success: false,
      error: error.message
    };
  }
}

// 删除数据
async function remove(table, filters) {
  try {
    let query = supabase.from(table).delete();
    
    // 添加过滤条件
    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });
    
    const { data: result, error } = await query.select();
    
    if (error) throw error;
    
    return {
      rows: result || [],
      success: true
    };
  } catch (error) {
    console.error('删除错误:', error);
    return {
      rows: [],
      success: false,
      error: error.message
    };
  }
}

// 初始化时测试连接
testConnection();

module.exports = {
  supabase,
  query,
  insert,
  update,
  remove,
  testConnection
};