const express = require('express');
const { supabase } = require('../config/database');

const router = express.Router();

// 获取概览统计数据
router.get('/overview', async (req, res) => {
  try {
    // 总用户数
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    // 总课程数
    const { count: totalCourses } = await supabase
      .from('courses')
      .select('*', { count: 'exact', head: true });

    // 总任务数
    const { count: totalTasks } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true });

    // 总专注时长
    const { data: focusData, error: focusError } = await supabase
      .from('focus_sessions')
      .select('duration');

    let totalFocusMinutes = 0;
    if (!focusError && focusData) {
      totalFocusMinutes = focusData.reduce((sum, session) => sum + (session.duration || 0), 0);
    }

    // 活跃用户数（30天内有活动的用户）
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { count: activeUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo.toISOString());

    res.json({
      success: true,
      data: {
        totalUsers: totalUsers || 0,
        totalCourses: totalCourses || 0,
        totalTasks: totalTasks || 0,
        totalFocusMinutes,
        activeUsers: activeUsers || 0
      }
    });
  } catch (error) {
    console.error('获取概览统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取概览统计失败'
    });
  }
});

// 获取用户增长趋势
router.get('/user-growth', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const { data, error } = await supabase
      .from('profiles')
      .select('created_at')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) throw error;

    // 按日期分组统计
    const dailyStats = {};
    (data || []).forEach(user => {
      const date = user.created_at.split('T')[0];
      dailyStats[date] = (dailyStats[date] || 0) + 1;
    });

    // 填充所有日期
    const result = [];
    const current = new Date(startDate);
    while (current <= new Date()) {
      const dateStr = current.toISOString().split('T')[0];
      result.push({
        date: dateStr,
        newUsers: dailyStats[dateStr] || 0
      });
      current.setDate(current.getDate() + 1);
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('获取用户增长趋势失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户增长趋势失败'
    });
  }
});

// 获取学校分布
router.get('/school-distribution', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('school_name')
      .not('school_name', 'is', null)
      .not('school_name', 'eq', '');

    if (error) throw error;

    // 统计学校分布
    const schoolStats = {};
    (data || []).forEach(user => {
      const school = user.school_name || '未知学校';
      schoolStats[school] = (schoolStats[school] || 0) + 1;
    });

    // 转换为数组并排序
    const result = Object.entries(schoolStats)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('获取学校分布失败:', error);
    res.status(500).json({
      success: false,
      message: '获取学校分布失败'
    });
  }
});

// 获取年级分布
router.get('/grade-distribution', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('grade')
      .not('grade', 'is', null)
      .not('grade', 'eq', '');

    if (error) throw error;

    // 统计年级分布
    const gradeStats = {};
    (data || []).forEach(user => {
      const grade = user.grade || '未知年级';
      gradeStats[grade] = (gradeStats[grade] || 0) + 1;
    });

    const result = Object.entries(gradeStats)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('获取年级分布失败:', error);
    res.status(500).json({
      success: false,
      message: '获取年级分布失败'
    });
  }
});

// 获取任务统计
router.get('/task-stats', async (req, res) => {
  try {
    // 总任务数
    const { count: totalTasks } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true });

    // 已完成任务数
    const { count: completedTasks } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('is_completed', true);

    // 本周新任务数
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const { count: newTasksWeek } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', weekAgo.toISOString());

    res.json({
      success: true,
      data: {
        totalTasks: totalTasks || 0,
        completedTasks: completedTasks || 0,
        pendingTasks: (totalTasks || 0) - (completedTasks || 0),
        newTasksWeek: newTasksWeek || 0
      }
    });
  } catch (error) {
    console.error('获取任务统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取任务统计失败'
    });
  }
});

// 获取专注统计
router.get('/focus-stats', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('focus_sessions')
      .select('duration, started_at');

    if (error) throw error;

    const sessions = data || [];
    const totalSessions = sessions.length;
    const totalMinutes = sessions.reduce((sum, session) => sum + (session.duration || 0), 0);
    const avgMinutes = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;

    // 本周专注次数
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const sessionsWeek = sessions.filter(session => 
      new Date(session.started_at) >= weekAgo
    ).length;

    res.json({
      success: true,
      data: {
        totalSessions,
        totalMinutes,
        avgMinutes,
        sessionsWeek
      }
    });
  } catch (error) {
    console.error('获取专注统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取专注统计失败'
    });
  }
});

// 获取功能使用统计
router.get('/feature-usage', async (req, res) => {
  try {
    // 这里可以根据实际需要添加更多功能统计
    const { count: aiUsage } = await supabase
      .from('ai_usage_logs')
      .select('*', { count: 'exact', head: true });

    const { count: resourceUploads } = await supabase
      .from('resources')
      .select('*', { count: 'exact', head: true });

    res.json({
      success: true,
      data: {
        aiUsage: aiUsage || 0,
        resourceUploads: resourceUploads || 0,
        // 可以添加更多功能统计
        courseManagement: 0,
        taskManagement: 0,
        focusUsage: 0
      }
    });
  } catch (error) {
    console.error('获取功能使用统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取功能使用统计失败'
    });
  }
});

module.exports = router;