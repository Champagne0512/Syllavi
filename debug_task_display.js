// 任务显示调试脚本
// 在微信开发者工具控制台中运行此脚本来调试任务显示问题

// 获取必要的函数和变量
const { getStoredUserId } = require('./miniprogram/utils/supabase')

// 调试函数：检查个人页面任务统计
function debugProfileTaskStats() {
  console.log('=== 个人页面任务统计调试 ===')
  
  // 获取个人页面实例
  const pages = getCurrentPages()
  const profilePage = pages.find(page => page.route === 'pages/profile/index')
  
  if (!profilePage) {
    console.error('没有找到个人页面实例')
    return
  }
  
  console.log('个人页面当前统计数据:', profilePage.data.stats)
  
  // 重新加载统计数据
  if (profilePage.loadStats) {
    console.log('重新加载统计数据...')
    profilePage.loadStats()
      .then(() => {
        console.log('统计数据更新后:', profilePage.data.stats)
      })
      .catch(err => {
        console.error('重新加载统计数据失败:', err)
      })
  }
}

// 调试函数：检查课程与待办页面任务列表
function debugHubTasks() {
  console.log('=== 课程与待办页面任务列表调试 ===')
  
  // 获取课程与待办页面实例
  const pages = getCurrentPages()
  const hubPage = pages.find(page => page.route === 'pages/hub/index')
  
  if (!hubPage) {
    console.error('没有找到课程与待办页面实例')
    return
  }
  
  console.log('课程与待办页面当前任务数据:', {
    allTasksCount: hubPage.data.tasks?.length || 0,
    todayTasksCount: hubPage.data.todayTasks?.length || 0,
    loading: hubPage.data.loading
  })
  
  console.log('所有任务:', hubPage.data.tasks)
  console.log('今日待办任务:', hubPage.data.todayTasks)
  
  // 重新加载任务数据
  if (hubPage.loadTasks) {
    console.log('重新加载任务数据...')
    hubPage.loadTasks()
      .then(() => {
        console.log('任务数据更新后:', {
          allTasksCount: hubPage.data.tasks?.length || 0,
          todayTasksCount: hubPage.data.todayTasks?.length || 0
        })
        
        // 手动更新视图
        if (hubPage.updateViewData) {
          hubPage.updateViewData()
          console.log('视图更新后今日待办数量:', hubPage.data.todayTasks?.length || 0)
        }
      })
      .catch(err => {
        console.error('重新加载任务数据失败:', err)
      })
  }
}

// 调试函数：检查用户所有任务
async function debugUserAllTasks() {
  console.log('=== 用户所有任务调试 ===')
  
  try {
    // 获取用户ID
    const userId = getStoredUserId({ allowDemo: false })
    if (!userId) {
      console.error('无法获取用户ID')
      return
    }
    
    console.log('用户ID:', userId)
    
    // 获取fetchAllTasks函数
    const { fetchAllTasks } = require('./miniprogram/utils/supabase')
    
    // 获取所有任务
    const allTasks = await fetchAllTasks(userId)
    
    console.log('所有任务:', allTasks)
    
    // 按类型分类
    const personalTasks = allTasks.filter(task => task.type !== 'group_task')
    const groupTasks = allTasks.filter(task => task.type === 'group_task')
    const completedTasks = allTasks.filter(task => task.is_completed)
    const pendingTasks = allTasks.filter(task => !task.is_completed)
    
    console.log('任务分类统计:', {
      总任务数: allTasks.length,
      个人任务数: personalTasks.length,
      小组任务数: groupTasks.length,
      已完成任务数: completedTasks.length,
      未完成任务数: pendingTasks.length
    })
    
    // 检查小组任务详情
    if (groupTasks.length > 0) {
      console.log('小组任务详情:', groupTasks.map(task => ({
        id: task.id,
        title: task.title,
        completed: task.is_completed,
        groupInfo: task.groupInfo
      })))
    }
    
    // 检查今天应该显示的任务
    const today = new Date()
    const todayKey = today.getFullYear() + '-' + 
      String(today.getMonth() + 1).padStart(2, '0') + '-' + 
      String(today.getDate()).padStart(2, '0')
    
    console.log('今天日期:', todayKey)
    
    // 模拟shouldDisplayTaskOnDate函数的逻辑
    const todayStart = new Date(todayKey)
    todayStart.setHours(0, 0, 0, 0)
    const todayStartTs = todayStart.getTime()
    
    const shouldShowToday = allTasks.filter(task => {
      // 基本检查
      if (!task) return false
      
      // 已完成的任务不显示
      if (task.is_completed) return false
      
      // 解析截止日期
      const deadline = new Date(task.deadline)
      if (isNaN(deadline.getTime())) return false
      
      // 截止日期午夜时间戳
      const deadlineMidnight = new Date(deadline)
      deadlineMidnight.setHours(0, 0, 0, 0)
      const deadlineTs = deadlineMidnight.getTime()
      
      // 解析创建日期
      const createdAt = task.created_at ? new Date(task.created_at) : new Date()
      if (!isNaN(deadline.getTime())) {
        createdAt.setHours(0, 0, 0, 0)
      }
      const visibleFromTs = createdAt.getTime()
      
      // 显示条件：今天在可见开始时间和截止日期之间
      return todayStartTs >= visibleFromTs && todayStartTs <= deadlineTs
    })
    
    console.log('今天应该显示的任务:', shouldShowToday.map(task => ({
      id: task.id,
      title: task.title,
      type: task.type,
      deadline: task.deadline,
      created_at: task.created_at
    })))
    
    return {
      allTasks,
      personalTasks,
      groupTasks,
      completedTasks,
      pendingTasks,
      shouldShowToday
    }
  } catch (error) {
    console.error('调试用户任务失败:', error)
  }
}

// 调试函数：创建测试任务
async function debugCreateTestTask() {
  console.log('=== 创建测试任务调试 ===')
  
  try {
    // 获取用户ID
    const userId = getStoredUserId({ allowDemo: false })
    if (!userId) {
      console.error('无法获取用户ID')
      return
    }
    
    // 获取createTask函数
    const { createTask } = require('./miniprogram/utils/supabase')
    
    // 创建测试任务
    const testTask = {
      user_id: userId,
      type: 'homework',
      title: `[调试测试] 任务 - ${new Date().toLocaleTimeString()}`,
      description: '这是一个用于调试显示问题的测试任务',
      deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3天后
      is_completed: false,
      related_course_id: null
    }
    
    console.log('准备创建测试任务:', testTask)
    
    const result = await createTask(testTask)
    console.log('创建任务结果:', result)
    
    // 刷新任务列表
    const pages = getCurrentPages()
    const hubPage = pages.find(page => page.route === 'pages/hub/index')
    if (hubPage && hubPage.loadTasks) {
      console.log('刷新课程与待办页面任务列表...')
      await hubPage.loadTasks()
      if (hubPage.updateViewData) {
        hubPage.updateViewData()
      }
    }
    
    // 刷新个人页面统计数据
    const profilePage = pages.find(page => page.route === 'pages/profile/index')
    if (profilePage && profilePage.loadStats) {
      console.log('刷新个人页面统计数据...')
      profilePage.loadStats()
    }
    
    return result
  } catch (error) {
    console.error('创建测试任务失败:', error)
  }
}

// 主调试函数
async function runCompleteTaskDebug() {
  console.log('开始完整任务显示调试...')
  
  // 1. 检查用户所有任务
  const taskData = await debugUserAllTasks()
  
  // 2. 检查个人页面统计
  debugProfileTaskStats()
  
  // 3. 检查课程与待办页面
  debugHubTasks()
  
  // 4. 创建测试任务
  console.log('\n\n=== 创建测试任务 ===')
  await debugCreateTestTask()
  
  // 5. 再次检查
  console.log('\n\n=== 测试任务创建后再次检查 ===')
  setTimeout(() => {
    debugProfileTaskStats()
    debugHubTasks()
  }, 2000) // 等待2秒让任务创建完成
}

// 导出调试函数
module.exports = {
  debugProfileTaskStats,
  debugHubTasks,
  debugUserAllTasks,
  debugCreateTestTask,
  runCompleteTaskDebug
}