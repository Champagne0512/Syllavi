const express = require('express');
const { supabase } = require('../config/database');

const router = express.Router();

// 获取课程列表
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const school = req.query.school || '';
    const offset = (page - 1) * limit;

    let query = supabase
      .from('courses')
      .select(`
        *,
        profiles!courses_user_id_fkey (
          nickname,
          school_name,
          grade
        )
      `, { count: 'exact' });

    // 搜索条件
    if (search) {
      query = query.or(`name.ilike.%${search}%,teacher.ilike.%${search}%,location.ilike.%${search}%`);
    }

    // 学校过滤
    if (school) {
      query = query.eq('profiles.school_name', school);
    }

    // 排序
    query = query.order('created_at', { ascending: false });

    // 分页
    query = query.range(offset, offset + limit - 1);

    const { data: courses, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: {
        courses: courses || [],
        total: count || 0,
        page,
        limit
      }
    });
  } catch (error) {
    console.error('获取课程列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取课程列表失败'
    });
  }
});

// 获取课程详情
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 获取课程基本信息
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select(`
        *,
        profiles!courses_user_id_fkey (
          nickname,
          school_name,
          grade
        )
      `)
      .eq('id', id)
      .single();

    if (courseError) throw courseError;

    // 获取课程安排
    const { data: schedules, error: scheduleError } = await supabase
      .from('course_schedules')
      .select('*')
      .eq('course_id', id)
      .order('day_of_week', { ascending: true });

    if (scheduleError) throw scheduleError;

    res.json({
      success: true,
      data: {
        course,
        schedules: schedules || []
      }
    });
  } catch (error) {
    console.error('获取课程详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取课程详情失败'
    });
  }
});

// 获取课程统计数据
router.get('/stats/overview', async (req, res) => {
  try {
    // 总课程数
    const { count: totalCourses } = await supabase
      .from('courses')
      .select('*', { count: 'exact', head: true });

    // 按学校分组统计
    const { data: schoolStats } = await supabase
      .from('courses')
      .select('profiles!courses_user_id_fkey(school_name)')
      .then(({ data, error }) => {
        if (error) throw error;
        const schools = {};
        data.forEach(course => {
          const school = course.profiles?.school_name || '未知';
          schools[school] = (schools[school] || 0) + 1;
        });
        return Object.entries(schools).map(([name, count]) => ({ name, count }));
      });

    // 热门课程名称
    const { data: popularCourses } = await supabase
      .from('courses')
      .select('name')
      .then(({ data, error }) => {
        if (error) throw error;
        const courseNames = {};
        data.forEach(course => {
          courseNames[course.name] = (courseNames[course.name] || 0) + 1;
        });
        return Object.entries(courseNames)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
      });

    res.json({
      success: true,
      data: {
        totalCourses: totalCourses || 0,
        schoolStats: schoolStats || [],
        popularCourses: popularCourses || []
      }
    });
  } catch (error) {
    console.error('获取课程统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取课程统计失败'
    });
  }
});

// 删除课程
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 先删除相关的课程安排
    await supabase
      .from('course_schedules')
      .delete()
      .eq('course_id', id);

    // 删除课程
    const { error } = await supabase
      .from('courses')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: '课程删除成功'
    });
  } catch (error) {
    console.error('删除课程失败:', error);
    res.status(500).json({
      success: false,
      message: '删除课程失败'
    });
  }
});

// 导出课程数据
router.get('/export/csv', async (req, res) => {
  try {
    const { search, school } = req.query;

    let query = supabase
      .from('courses')
      .select(`
        name,
        color,
        location,
        teacher,
        credits,
        created_at,
        profiles!courses_user_id_fkey (
          nickname,
          school_name,
          grade
        )
      `);

    // 搜索条件
    if (search) {
      query = query.or(`name.ilike.%${search}%,teacher.ilike.%${search}%,location.ilike.%${search}%`);
    }

    // 学校过滤
    if (school) {
      query = query.eq('profiles.school_name', school);
    }

    const { data: courses, error } = await query;

    if (error) throw error;

    // 转换为CSV格式
    let csv = '课程名称,颜色,地点,教师,学分,用户昵称,学校,年级,创建时间\n';
    
    courses.forEach(course => {
      csv += `"${course.name}","${course.color}","${course.location || ''}","${course.teacher || ''}","${course.credits || ''}","${course.profiles?.nickname || ''}","${course.profiles?.school_name || ''}","${course.profiles?.grade || ''}","${course.created_at}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="courses_export.csv"');
    res.send('\uFEFF' + csv);
  } catch (error) {
    console.error('导出课程数据失败:', error);
    res.status(500).json({
      success: false,
      message: '导出课程数据失败'
    });
  }
});

module.exports = router;