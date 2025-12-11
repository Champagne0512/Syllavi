// 小组任务调试脚本
// 在微信开发者工具控制台中运行此脚本来调试小组任务功能

// 获取必要的函数和变量
const { getStoredUserId, request } = require('./miniprogram/utils/supabase')

// 调试函数：获取用户ID
function debugUserId() {
  console.log('=== 用户ID调试 ===')
  const userId = getStoredUserId({ allowDemo: false })
  console.log('当前用户ID:', userId)
  
  // 检查本地存储中的各种用户ID键
  console.log('本地存储中的用户ID:')
  console.log('user_id:', wx.getStorageSync('user_id'))
  console.log('syllaby_user_id:', wx.getStorageSync('syllaby_user_id'))
  console.log('userId:', wx.getStorageSync('userId'))
  
  // 检查全局数据中的用户ID
  const app = getApp()
  console.log('全局数据中的用户ID:')
  console.log('app.globalData.supabase.userId:', app?.globalData?.supabase?.userId)
  console.log('app.globalData.user.id:', app?.globalData?.user?.id)
  
  return userId
}

// 调试函数：获取用户的小组
async function debugUserGroups(userId) {
  console.log('=== 用户小组调试 ===')
  try {
    // 获取用户加入的小组
    const groups = await request('group_members', {
      query: `user_id=eq.${userId}`
    })
    
    console.log('用户加入的小组:', groups)
    
    if (groups && groups.length > 0) {
      // 获取小组详情
      const groupIds = groups.map(g => g.group_id).join(',')
      const groupDetails = await request('study_groups', {
        query: `id=in.(${groupIds})`
      })
      
      console.log('小组详情:', groupDetails)
      
      return groupDetails
    }
    
    return []
  } catch (error) {
    console.error('获取用户小组失败:', error)
    return []
  }
}

// 调试函数：获取小组任务
async function debugGroupTasks(groupId) {
  console.log('=== 小组任务调试 ===')
  try {
    // 获取小组任务
    const tasks = await request('group_tasks', {
      query: `group_id=eq.${groupId}&order=created_at.desc`
    })
    
    console.log('小组任务列表:', tasks)
    
    if (tasks && tasks.length > 0) {
      // 获取任务成员分配情况
      const taskIds = tasks.map(t => t.id).join(',')
      const taskMembers = await request('group_task_members', {
        query: `task_id=in.(${taskIds})`
      })
      
      console.log('任务成员分配情况:', taskMembers)
      
      // 按任务分组显示
      const tasksWithMembers = tasks.map(task => {
        const members = taskMembers.filter(m => m.task_id === task.id)
        return {
          ...task,
          members: members
        }
      })
      
      console.log('带成员信息的小组任务:', tasksWithMembers)
      
      return tasksWithMembers
    }
    
    return []
  } catch (error) {
    console.error('获取小组任务失败:', error)
    return []
  }
}

// 调试函数：获取用户的小组任务
async function debugUserGroupTasks(userId) {
  console.log('=== 用户小组任务调试 ===')
  try {
    // 获取用户的小组任务分配记录
    const userTaskMembers = await request('group_task_members', {
      query: `user_id=eq.${userId}&select=task_id,is_completed,completed_at,assigned_at&order=assigned_at.desc`
    })
    
    console.log('用户的小组任务分配记录:', userTaskMembers)
    
    if (userTaskMembers && userTaskMembers.length > 0) {
      // 获取任务详情
      const taskIds = userTaskMembers.map(m => m.task_id).join(',')
      const tasks = await request('group_tasks', {
        query: `id=in.(${taskIds})&select=id,title,description,deadline,group_id,created_by`
      })
      
      console.log('任务详情:', tasks)
      
      // 获取小组信息
      const groupIds = [...new Set(tasks.map(t => t.group_id))].join(',')
      if (groupIds) {
        const groups = await request('study_groups', {
          query: `id=in.(${groupIds})&select=id,name`
        })
        
        console.log('小组信息:', groups)
        
        // 组合数据
        const tasksWithGroups = tasks.map(task => {
          const group = groups.find(g => g.id === task.group_id)
          return {
            ...task,
            groupName: group ? group.name : '未知小组'
          }
        })
        
        console.log('带小组信息的任务:', tasksWithGroups)
        
        return tasksWithGroups
      }
      
      return tasks
    }
    
    return []
  } catch (error) {
    console.error('获取用户小组任务失败:', error)
    return []
  }
}

// 调试函数：创建测试任务
async function debugCreateTask(userId, groupId) {
  console.log('=== 创建测试任务调试 ===')
  
  const taskPayload = {
    group_id: groupId,
    created_by: userId,
    title: '[调试测试] 小组任务',
    description: '这是一个用于调试测试的小组任务',
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7天后
    status: 'pending',
    created_at: new Date().toISOString(),
    meta: {
      mode: 'persistent',
      type: 'debug',
      urgent: false,
      isImportant: false,
      hasSpecificTime: false
    }
  }
  
  try {
    console.log('准备创建的任务:', taskPayload)
    
    const result = await request('group_tasks', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      data: [taskPayload]
    })
    
    console.log('创建任务结果:', result)
    
    if (result && result.length > 0) {
      const newTask = result[0]
      console.log('任务创建成功，任务ID:', newTask.id)
      
      // 尝试分配任务
      const assignResult = await debugAssignTask(newTask.id, groupId)
      
      return {
        task: newTask,
        assignResult
      }
    } else {
      console.error('创建任务失败，没有返回有效结果')
      return null
    }
  } catch (error) {
    console.error('创建任务失败:', error)
    return null
  }
}

// 调试函数：分配任务给成员
async function debugAssignTask(taskId, groupId) {
  console.log('=== 分配任务调试 ===')
  
  try {
    // 获取成员列表
    const members = await request('group_members', {
      query: `group_id=eq.${groupId}`
    })
    
    console.log('小组成员列表:', members)
    
    if (!members || members.length === 0) {
      console.error('没有找到小组成员')
      return false
    }
    
    // 确保我们提取到了正确的用户ID
    const uniqueUserIds = [...new Set(members.map(member => {
      // 尝试多个可能的用户ID字段
      const userId = member.user_id || member.id || member.userId || null
      if (userId) {
        console.log('成员信息:', member, '提取的用户ID:', userId)
      }
      return userId
    }).filter(Boolean))]
    
    console.log('提取到的用户ID列表:', uniqueUserIds)
    
    if (!uniqueUserIds.length) {
      console.error('没有有效的用户ID')
      return false
    }
    
    const rows = uniqueUserIds.map(userId => ({
      task_id: taskId,
      user_id: userId,
      is_completed: false
    }))
    
    console.log('准备插入的数据:', rows)
    
    // 插入任务成员分配记录
    const result = await request('group_task_members', {
      method: 'POST',
      data: rows
    })
    
    console.log('插入结果:', result)
    
    // 检查插入结果
    if (result && (Array.isArray(result) ? result.length > 0 : result)) {
      console.log('任务分配成功，分配给', uniqueUserIds.length, '个成员')
      return true
    } else {
      console.error('任务分配失败，没有返回有效结果')
      return false
    }
  } catch (error) {
    console.error('分配任务失败:', error)
    return false
  }
}

// 主调试函数
async function runFullDebug() {
  console.log('开始完整调试...')
  
  // 1. 获取用户ID
  const userId = debugUserId()
  if (!userId) {
    console.error('无法获取用户ID，调试中止')
    return
  }
  
  // 2. 获取用户小组
  const groups = await debugUserGroups(userId)
  if (!groups || groups.length === 0) {
    console.error('用户没有加入任何小组，调试中止')
    return
  }
  
  // 3. 获取小组任务
  const groupId = groups[0].id
  const tasks = await debugGroupTasks(groupId)
  
  // 4. 获取用户的小组任务
  const userTasks = await debugUserGroupTasks(userId)
  
  // 5. 创建测试任务
  console.log('\n\n=== 创建测试任务 ===')
  const testResult = await debugCreateTask(userId, groupId)
  
  // 6. 再次检查用户的小组任务
  console.log('\n\n=== 再次检查用户的小组任务 ===')
  const updatedUserTasks = await debugUserGroupTasks(userId)
  
  console.log('\n\n=== 调试完成 ===')
  console.log('原始用户小组任务数量:', userTasks.length)
  console.log('测试任务创建结果:', testResult)
  console.log('更新后用户小组任务数量:', updatedUserTasks.length)
}

// 导出调试函数
module.exports = {
  debugUserId,
  debugUserGroups,
  debugGroupTasks,
  debugUserGroupTasks,
  debugCreateTask,
  debugAssignTask,
  runFullDebug
}