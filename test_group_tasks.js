// 小组任务功能测试脚本
// 使用此脚本来测试小组任务创建和分配功能

// 测试用户ID（替换为实际用户ID）
const TEST_USER_ID = 'your-user-id-here'
// 测试小组ID（替换为实际小组ID）
const TEST_GROUP_ID = 'your-group-id-here'

// 测试任务创建
async function testCreateGroupTask() {
  console.log('开始测试创建小组任务...')
  
  const taskPayload = {
    group_id: TEST_GROUP_ID,
    created_by: TEST_USER_ID,
    title: '[测试] 小组任务',
    description: '这是一个用于测试的小组任务',
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7天后
    status: 'pending',
    created_at: new Date().toISOString(),
    meta: {
      mode: 'persistent',
      type: 'test',
      urgent: false,
      isImportant: false,
      hasSpecificTime: false
    }
  }
  
  try {
    const response = await wx.request({
      url: `${SUPABASE_URL}/rest/v1/group_tasks`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${wx.getStorageSync('access_token')}`
      },
      data: [taskPayload]
    })
    
    if (response.statusCode >= 200 && response.statusCode < 300) {
      console.log('任务创建成功:', response.data)
      return response.data[0].id
    } else {
      console.error('任务创建失败:', response)
      return null
    }
  } catch (error) {
    console.error('创建任务时出错:', error)
    return null
  }
}

// 测试任务分配
async function testAssignTaskToMembers(taskId) {
  console.log('开始测试任务分配...')
  
  // 获取小组成员列表
  try {
    const membersResponse = await wx.request({
      url: `${SUPABASE_URL}/rest/v1/group_members?group_id=eq.${TEST_GROUP_ID}`,
      method: 'GET',
      header: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${wx.getStorageSync('access_token')}`
      }
    })
    
    if (membersResponse.statusCode >= 200 && membersResponse.statusCode < 300) {
      const members = membersResponse.data
      console.log('获取到的成员列表:', members)
      
      if (!members || members.length === 0) {
        console.error('没有找到小组成员')
        return false
      }
      
      // 准备分配数据
      const assignData = members.map(member => ({
        task_id: taskId,
        user_id: member.user_id,
        is_completed: false
      }))
      
      console.log('准备分配的数据:', assignData)
      
      // 执行分配
      const assignResponse = await wx.request({
        url: `${SUPABASE_URL}/rest/v1/group_task_members`,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${wx.getStorageSync('access_token')}`
        },
        data: assignData
      })
      
      if (assignResponse.statusCode >= 200 && assignResponse.statusCode < 300) {
        console.log('任务分配成功:', assignResponse.data)
        return true
      } else {
        console.error('任务分配失败:', assignResponse)
        return false
      }
    } else {
      console.error('获取成员列表失败:', membersResponse)
      return false
    }
  } catch (error) {
    console.error('分配任务时出错:', error)
    return false
  }
}

// 测试获取用户的小组任务
async function testGetUserGroupTasks() {
  console.log('开始测试获取用户的小组任务...')
  
  try {
    const response = await wx.request({
      url: `${SUPABASE_URL}/rest/v1/group_task_members?user_id=eq.${TEST_USER_ID}&select=task_id,is_completed,completed_at,assigned_at&order=assigned_at.desc`,
      method: 'GET',
      header: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${wx.getStorageSync('access_token')}`
      }
    })
    
    if (response.statusCode >= 200 && response.statusCode < 300) {
      console.log('获取到的小组任务成员记录:', response.data)
      
      if (response.data && response.data.length > 0) {
        // 获取任务详细信息
        const taskIds = response.data.map(member => member.task_id).join(',')
        const tasksResponse = await wx.request({
          url: `${SUPABASE_URL}/rest/v1/group_tasks?id=in.(${taskIds})`,
          method: 'GET',
          header: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${wx.getStorageSync('access_token')}`
          }
        })
        
        if (tasksResponse.statusCode >= 200 && tasksResponse.statusCode < 300) {
          console.log('获取到的小组任务详情:', tasksResponse.data)
          return true
        } else {
          console.error('获取任务详情失败:', tasksResponse)
          return false
        }
      } else {
        console.log('用户没有小组任务')
        return true
      }
    } else {
      console.error('获取小组任务成员记录失败:', response)
      return false
    }
  } catch (error) {
    console.error('获取小组任务时出错:', error)
    return false
  }
}

// 运行完整测试
async function runCompleteTest() {
  console.log('开始完整测试...')
  
  // 创建任务
  const taskId = await testCreateGroupTask()
  if (!taskId) {
    console.error('创建任务失败，测试中止')
    return
  }
  
  // 分配任务
  const assignResult = await testAssignTaskToMembers(taskId)
  if (!assignResult) {
    console.error('分配任务失败，测试中止')
    return
  }
  
  // 获取用户的小组任务
  const getResult = await testGetUserGroupTasks()
  if (!getResult) {
    console.error('获取小组任务失败，测试中止')
    return
  }
  
  console.log('完整测试通过！')
}

// 导出测试函数
module.exports = {
  testCreateGroupTask,
  testAssignTaskToMembers,
  testGetUserGroupTasks,
  runCompleteTest
}