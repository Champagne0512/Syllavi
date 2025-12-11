const express = require('express');
const { supabase } = require('../config/database');

const router = express.Router();

// 获取用户列表
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const offset = (page - 1) * limit;

    let query = supabase
      .from('profiles')
      .select('id, nickname, school_name, grade, avatar_url, created_at, updated_at', { count: 'exact' });

    // 搜索条件
    if (search) {
      query = query.or(`nickname.ilike.%${search}%,school_name.ilike.%${search}%,id.ilike.%${search}%`);
    }

    // 排序
    query = query.order('created_at', { ascending: false });

    // 分页
    query = query.range(offset, offset + limit - 1);

    const { data: users, error, count } = await query;

    if (error) throw error;

    // 为每个用户添加统计信息
    const usersWithStats = await Promise.all((users || []).map(async (user) => {
      // 获取用户统计数据
      const [courseCount, taskCount, focusCount] = await Promise.all([
        supabase.from('courses').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('focus_sessions').select('duration', { count: 'exact', head: true }).eq('user_id', user.id)
      ]);

      return {
        ...user,
        status: new Date(user.created_at) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) ? 'active' : 'inactive',
        stats: {
          courses_count: courseCount.count || 0,
          tasks_count: taskCount.count || 0,
          total_focus_minutes: focusCount.count || 0
        }
      };
    }));

    // 处理状态过滤
    let filteredUsers = usersWithStats || [];
    if (status === 'active') {
      filteredUsers = usersWithStats.filter(user => user.status === 'active');
    } else if (status === 'inactive') {
      filteredUsers = usersWithStats.filter(user => user.status === 'inactive');
    }

    res.json({
      success: true,
      data: {
        users: filteredUsers,
        pagination: {
          total: count || 0,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit)
        }
      }
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户列表失败'
    });
  }
});

// 获取用户详情
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 获取用户基本信息
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (userError) throw userError;

    // 获取用户课程数量
    const { count: courseCount, error: courseError } = await supabase
      .from('courses')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', id);

    if (courseError) throw courseError;

    // 获取用户任务数量
    const { count: taskCount, error: taskError } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', id);

    if (taskError) throw taskError;

    // 获取用户专注记录数量
    const { count: focusCount, error: focusError } = await supabase
      .from('focus_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', id);

    if (focusError) throw focusError;

    // 添加统计信息到用户对象
    user.stats = {
      courses_count: courseCount || 0,
      tasks_count: taskCount || 0,
      total_focus_minutes: focusCount || 0
    };

    res.json({
      success: true,
      data: {
        user,
        statistics: {
          courses: courseCount || 0,
          tasks: taskCount || 0,
          focus_sessions: focusCount || 0
        }
      }
    });
  } catch (error) {
    console.error('获取用户详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户详情失败'
    });
  }
});

// 删除用户
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 删除用户相关的所有数据（按依赖关系顺序）
    const tables = [
      'focus_sessions',
      'achievements',
      'learning_heatmap',
      'tasks',
      'course_schedules',
      'courses',
      'profiles'
    ];

    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('user_id', id);

      if (error && !error.message.includes('No rows to delete')) {
        throw error;
      }
    }

    res.json({
      success: true,
      message: '用户删除成功'
    });
  } catch (error) {
    console.error('删除用户失败:', error);
    res.status(500).json({
      success: false,
      message: '删除用户失败'
    });
  }
});

// 导出用户数据
router.get('/export/csv', async (req, res) => {
  try {
    const { search, status } = req.query;

    let query = supabase
      .from('profiles')
      .select('id, nickname, school_name, grade, avatar_url, created_at, updated_at');

    // 搜索条件
    if (search) {
      query = query.or(`nickname.ilike.%${search}%,school_name.ilike.%${search}%`);
    }

    // 排序
    query = query.order('created_at', { ascending: false });

    const { data: users, error } = await query;

    if (error) throw error;

    // 转换为CSV格式
    let csv = 'ID,昵称,学校,年级,头像URL,创建时间,更新时间\n';
    
    users.forEach(user => {
      csv += `"${user.id}","${user.nickname || ''}","${user.school_name || ''}","${user.grade || ''}","${user.avatar_url || ''}","${user.created_at}","${user.updated_at}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="users_export.csv"');
    res.send('\uFEFF' + csv); // 添加BOM以支持中文
  } catch (error) {
    console.error('导出用户数据失败:', error);
    res.status(500).json({
      success: false,
      message: '导出用户数据失败'
    });
  }
});

module.exports = router;