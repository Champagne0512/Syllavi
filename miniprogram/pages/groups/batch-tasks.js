// pages/groups/batch-tasks.js - 组长批量安排小组待办目标
const app = getApp()
const { request } = require('../../utils/supabase')

Page({
  data: {
    groupId: '',
    groupInfo: null,
    members: [],
    
    // 任务表单数据
    taskForm: {
      title: '',
      description: '',
      deadline: '',
      assignToAll: true,
      selectedMembers: []
    },
    
    loading: true,
    submitting: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ groupId: options.id })
      this.loadGroupData()
    }
  },

  async loadGroupData() {
    try {
      this.setData({ loading: true })
      
      // 获取真实的用户ID
      const userId = app.globalData?.user?.id || wx.getStorageSync('userId') || app.globalData?.supabase?.userId
      
      // 确保用户ID存在
      if (!userId) {
        wx.showToast({ title: '请先登录', icon: 'none' })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
        return
      }
      
      // 加载小组信息
      const groupInfo = await request('study_groups', {
        query: `id=eq.${this.data.groupId}`
      })
      
      if (!groupInfo || groupInfo.length === 0) {
        wx.showToast({ title: '小组不存在', icon: 'none' })
        wx.navigateBack()
        return
      }
      
      this.setData({ groupInfo: groupInfo[0] })
      
      // 检查用户是否是组长
      const memberInfo = await request('group_members', {
        query: `group_id=eq.${this.data.groupId}&user_id=eq.${userId}`
      })
      
      if (!memberInfo || memberInfo.length === 0 || !['leader', 'deputy_leader'].includes(memberInfo[0].role)) {
        wx.showToast({ title: '只有组长可以安排任务', icon: 'none' })
        wx.navigateBack()
        return
      }
      
      // 加载成员列表
      await this.loadMembers()
      
      this.setData({ loading: false })
      
    } catch (error) {
      console.error('加载小组数据失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  async loadMembers() {
    try {
      // 获取成员信息，关联用户表获取真实用户数据
      const members = await request('group_members', {
        query: `group_id=eq.${this.data.groupId}&order=joined_at.asc`,
        headers: {
          // 添加关联查询参数，获取用户信息
          'Select': 'id,role,joined_at,user_id,profiles:nickname,profiles:avatar_url'
        }
      })
      
      console.log('batch-tasks.js - 成员列表加载结果:', members)
      
      // 格式化成员数据，添加选择状态，确保显示真实用户信息
      const formattedMembers = (members || []).map(member => ({
        id: member.id,
        user_id: member.user_id,
        role: member.role,
        joined_at: member.joined_at,
        nickname: member.profiles?.nickname || `用户${member.user_id?.slice(-6) || ''}`,
        avatar_url: member.profiles?.avatar_url || '/assets/images/default-avatar.png',
        selected: false
      }))
      
      this.setData({ 
        members: formattedMembers,
        'taskForm.selectedMembers': []
      })
      
    } catch (error) {
      console.error('加载成员列表失败:', error)
      // 尝试备用方法获取成员信息
      try {
        const basicMembers = await request('group_members', {
          query: `group_id=eq.${this.data.groupId}&order=joined_at.asc`
        })
        
        const formattedMembers = (basicMembers || []).map(member => ({
          id: member.id,
          user_id: member.user_id,
          role: member.role,
          joined_at: member.joined_at,
          nickname: `用户${member.user_id?.slice(-6) || ''}`,
          avatar_url: '/assets/images/default-avatar.png',
          selected: false
        }))
        
        this.setData({ 
          members: formattedMembers,
          'taskForm.selectedMembers': []
        })
      } catch (fallbackError) {
        console.error('备用方法获取成员信息也失败:', fallbackError)
        this.setData({ 
          members: [],
          'taskForm.selectedMembers': []
        })
      }
    }
  },

  // 输入框变化处理
  onInputChange(e) {
    const { field } = e.currentTarget.dataset
    const value = e.detail.value
    
    this.setData({
      [`taskForm.${field}`]: value
    })
  },

  // 日期选择
  onDateChange(e) {
    this.setData({
      'taskForm.deadline': e.detail.value
    })
  },

  // 切换分配给全体成员
  onAssignToAllChange(e) {
    // 添加触感反馈
    wx.vibrateShort({ type: 'light' })
    
    const assignToAll = e.detail.value
    
    this.setData({
      'taskForm.assignToAll': assignToAll,
      'taskForm.selectedMembers': assignToAll ? [] : this.data.taskForm.selectedMembers
    })
    
    // 如果是分配给全体成员，清空选中状态
    if (assignToAll) {
      const members = this.data.members.map(member => ({
        ...member,
        selected: false
      }))
      this.setData({ members })
    }
  },

  // 选择/取消选择成员
  onMemberSelect(e) {
    // 添加触感反馈
    wx.vibrateShort({ type: 'light' })
    
    if (this.data.taskForm.assignToAll) return
    
    const index = e.currentTarget.dataset.index
    const members = [...this.data.members]
    members[index].selected = !members[index].selected
    
    const selectedMembers = members
      .filter(member => member.selected)
      .map(member => member.user_id)
    
    this.setData({
      members,
      'taskForm.selectedMembers': selectedMembers
    })
  },

  // 验证表单
  validateForm() {
    const { title, deadline, assignToAll, selectedMembers } = this.data.taskForm
    
    if (!title.trim()) {
      wx.showToast({ title: '请输入任务标题', icon: 'none' })
      return false
    }
    
    if (!deadline) {
      wx.showToast({ title: '请选择截止日期', icon: 'none' })
      return false
    }
    
    if (!assignToAll && selectedMembers.length === 0) {
      wx.showToast({ title: '请选择要分配的成员', icon: 'none' })
      return false
    }
    
    return true
  },

  // 测试数据库连接和表
  async testDatabaseConnection() {
    try {
      console.log('测试数据库连接...')
      
      // 测试获取小组信息
      const groupTest = await request('study_groups', {
        query: `id=eq.${this.data.groupId}&limit=1`
      })
      
      console.log('小组连接测试结果:', groupTest ? '成功' : '失败')
      
      // 测试获取小组成员
      const membersTest = await request('group_members', {
        query: `group_id=eq.${this.data.groupId}&limit=1`
      })
      
      console.log('成员连接测试结果:', membersTest ? '成功' : '失败')
      
      // 测试获取任务表结构（不插入数据）
      const tasksTest = await request('group_tasks', {
        query: `id=eq.00000000-0000-0000-0000-000000000000&limit=1`
      })
      
      console.log('任务表连接测试结果:', Array.isArray(tasksTest) ? '成功' : '失败')
      
      return true
    } catch (error) {
      console.error('数据库连接测试失败:', error)
      return false
    }
  },

  // 批量创建任务
  async createBatchTasks() {
    // 添加触感反馈
    wx.vibrateShort({ type: 'medium' })
    
    if (!this.validateForm()) return
    
    try {
      this.setData({ submitting: true })
      wx.showLoading({ title: '创建任务中...' })
      
      const { title, description, deadline, assignToAll, selectedMembers } = this.data.taskForm
      // 获取真实的用户ID
      const userId = app.globalData?.user?.id || wx.getStorageSync('userId') || app.globalData?.supabase?.userId
      
      // 确保用户ID存在
      if (!userId) {
        wx.hideLoading()
        wx.showToast({ title: '请先登录', icon: 'none' })
        return
      }
      
      // 先测试数据库连接
      const dbConnected = await this.testDatabaseConnection()
      if (!dbConnected) {
        wx.hideLoading()
        wx.showToast({ title: '数据库连接失败，请稍后再试', icon: 'none' })
        return
      }
      
      // 确定要分配的成员
      let targetMembers = []
      if (assignToAll) {
        targetMembers = this.data.members.map(member => member.user_id)
      } else {
        targetMembers = selectedMembers
      }
      
      // 先创建任务主体
      const taskData = {
        group_id: this.data.groupId,
        title: title.trim(),
        description: description.trim(),
        deadline: deadline,
        created_by: userId
      }
      
      console.log('创建任务主体数据:', taskData)
      console.log('当前用户ID:', userId)
      console.log('当前小组ID:', this.data.groupId)
      
      // 检查用户ID是否有效
      if (!userId || userId === 'demo-user') {
        console.warn('用户ID无效:', userId)
        throw new Error('用户登录状态无效，请重新登录')
      }
      
      // 尝试使用小组任务表（如果可用）
      try {
        // 创建任务主体
        const taskResult = await request('group_tasks', {
          method: 'POST',
          data: taskData,
          headers: {
            Prefer: 'return=representation'
          }
        })
        
        console.log('创建任务主体响应:', taskResult)
        
        if (!taskResult || taskResult.length === 0) {
          console.error('创建任务失败，响应为空:', taskResult)
          throw new Error('创建任务失败: 服务器未返回有效响应')
        }
        
        const taskId = taskResult[0].id
        console.log('任务创建成功，ID:', taskId)
        
        // 为每个成员创建任务关联
        const taskMembers = targetMembers.map(memberId => ({
          task_id: taskId,
          user_id: memberId,
          is_completed: false
        }))
        
        console.log('创建任务成员关联数据:', taskMembers)
        
        // 批量创建任务成员关联
        const membersResult = await request('group_task_members', {
          method: 'POST',
          data: taskMembers
        })
        
        console.log('任务成员关联创建结果:', membersResult)
        
        wx.hideLoading()
        
        if (membersResult && membersResult.length > 0) {
          wx.showToast({
            title: `成功创建任务，分配给${membersResult.length}个成员`,
            icon: 'success',
            duration: 2000
          })
          
          // 设置强制刷新标志
          wx.setStorageSync('force_refresh_tasks', true);
          
          // 设置强制刷新标志
          wx.setStorageSync('force_refresh_tasks', true);
          
          // 延迟返回上一页
          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
          return
        } else {
          throw new Error('创建任务成员关联失败')
        }
      } catch (groupTaskError) {
        console.warn('小组任务表不可用，尝试使用个人任务表:', groupTaskError)
        
        // 如果小组任务表不可用，则创建个人任务并标记为小组任务
        const personalTasks = targetMembers.map(memberId => ({
          user_id: memberId,
          type: 'homework',
          title: `[小组任务] ${title.trim()}`,
          description: `${description.trim()}\n\n小组ID: ${this.data.groupId}\n分配给: ${this.data.groupInfo?.name || '学习小组'}`,
          deadline: deadline,
          is_completed: false,
          progress: 0,
          related_course_id: null
        }))
        
        console.log('创建个人任务数据:', personalTasks)
        console.log('当前用户ID:', userId)
        console.log('目标成员列表:', targetMembers)
        console.log('任务标题示例:', personalTasks[0]?.title)
        console.log('任务描述示例:', personalTasks[0]?.description)
        
        // 先尝试创建包含 group_id 和 is_group_task 字段的任务
        try {
          // 第一次尝试：包含所有字段
          const tasksWithGroupFields = personalTasks.map(task => ({
            ...task,
            group_id: this.data.groupId,
            is_group_task: true
          }))
          
          console.log('尝试创建包含小组字段的任务:', tasksWithGroupFields)
          
          const tasksResult = await request('tasks', {
            method: 'POST',
            data: tasksWithGroupFields,
            headers: {
              Prefer: 'return=representation'
            }
          })
          
          console.log('包含小组字段的任务创建结果:', tasksResult)
          
          if (tasksResult && tasksResult.length > 0) {
            wx.hideLoading()
            wx.showToast({
              title: `成功创建${tasksResult.length}个小组任务`,
              icon: 'success',
              duration: 2000
            })
            
            // 设置强制刷新标志
            wx.setStorageSync('force_refresh_tasks', true);
            
            setTimeout(() => {
              wx.navigateBack()
            }, 1500)
            return
          }
        } catch (groupFieldError) {
          console.warn('创建包含小组字段的任务失败，尝试不包含这些字段:', groupFieldError)
        }
        
        // 第二次尝试：不包含 group_id 和 is_group_task 字段
        console.log('尝试创建不包含小组字段的任务:', personalTasks)
        
        const tasksResult = await request('tasks', {
          method: 'POST',
          data: personalTasks,
          headers: {
            Prefer: 'return=representation'
          }
        })
        
        console.log('不包含小组字段的任务创建结果:', tasksResult)
        
        wx.hideLoading()
        
        if (tasksResult && tasksResult.length > 0) {
          wx.showToast({
            title: `成功创建${tasksResult.length}个小组任务`,
            icon: 'success',
            duration: 2000
          })
          
          // 设置强制刷新标志
          wx.setStorageSync('force_refresh_tasks', true);
          
          // 设置强制刷新标志
          wx.setStorageSync('force_refresh_tasks', true);
          
          // 延迟返回上一页
          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
        } else {
          throw new Error('创建个人任务失败')
        }
      }
      
    } catch (error) {
      console.error('批量创建任务失败:', error)
      wx.hideLoading()
      wx.showToast({
        title: `创建失败: ${error.message || '未知错误'}`,
        icon: 'none',
        duration: 3000
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // 快速填写示例任务
  fillExampleTask() {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]
    
    this.setData({
      taskForm: {
        title: '完成PBL项目第一阶段',
        description: '请完成小组项目的需求分析和方案设计，包括功能列表和技术选型。',
        deadline: tomorrowStr,
        assignToAll: true,
        selectedMembers: []
      }
    })
    
    wx.showToast({
      title: '已填充示例任务',
      icon: 'success',
      duration: 1500
    })
  },

  // 重置表单
  resetForm() {
    this.setData({
      taskForm: {
        title: '',
        description: '',
        deadline: '',
        assignToAll: true,
        selectedMembers: []
      }
    })
    
    // 重置成员选择状态
    const members = this.data.members.map(member => ({
      ...member,
      selected: false
    }))
    this.setData({ members })
  }
})