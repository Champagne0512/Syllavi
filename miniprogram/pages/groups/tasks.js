// pages/groups/tasks.js
const app = getApp()

Page({
  data: {
    groupId: null,
    groupInfo: {},
    userRole: '',
    tasks: [],
    newTaskTitle: '',
    newTaskDescription: '',
    newTaskDeadline: '',
    showCreateModal: false,
    loading: true
  },

  onLoad(options) {
    console.log('tasks.js - 页面加载，参数:', options)
    const { groupId } = options
    if (!groupId) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      wx.navigateBack()
      return
    }
    
    this.setData({ groupId })
    this.loadGroupInfo()
  },

  // 返回上一页
  goBack() {
    // 添加触感反馈
    wx.vibrateShort({ type: 'light' })
    wx.navigateBack()
  },

  // 刷新任务列表
  refreshTasks() {
    // 添加触感反馈
    wx.vibrateShort({ type: 'light' })
    
    wx.showLoading({ title: '刷新中...' })
    this.loadTasks()
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: '刷新成功', icon: 'success' })
      })
      .catch(() => {
        wx.hideLoading()
        wx.showToast({ title: '刷新失败', icon: 'none' })
      })
  },

  // 加载小组信息
  async loadGroupInfo() {
    try {
      const { request } = require('../../utils/supabase')
      
      // 获取用户ID
      const userId = app.globalData?.user?.id || wx.getStorageSync('userId') || app.globalData?.supabase?.userId
      
      if (!userId) {
        wx.showToast({ title: '请先登录', icon: 'none' })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
        return
      }
      
      // 获取小组信息
      const groupInfo = await request('study_groups', {
        query: `id=eq.${this.data.groupId}`
      })
      
      if (!groupInfo || groupInfo.length === 0) {
        wx.showToast({ title: '小组不存在', icon: 'none' })
        wx.navigateBack()
        return
      }
      
      // 获取用户在小组中的角色
      const memberInfo = await request('group_members', {
        query: `group_id=eq.${this.data.groupId}&user_id=eq.${userId}`
      })
      
      const userRole = memberInfo && memberInfo.length > 0 ? memberInfo[0].role : 'non_member'
      
      this.setData({ 
        groupInfo: groupInfo[0],
        userRole,
        userId
      })
      
      // 加载任务列表
      await this.loadTasks()
      
    } catch (error) {
      console.error('加载小组信息失败:', error)
      wx.showToast({ title: '加载小组信息失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  // 加载任务列表
  async loadTasks() {
    try {
      const { request } = require('../../utils/supabase')
      
      // 获取任务列表
      const tasks = await request('group_tasks', {
        query: `group_id=eq.${this.data.groupId}&order=created_at.desc`
      })
      
      console.log('tasks.js - 任务列表加载结果:', tasks)
      
      // 格式化任务数据
      const formattedTasks = (tasks || []).map(task => {
        // 计算任务状态和进度
        const isCompleted = task.status === 'completed'
        const isOverdue = !isCompleted && new Date(task.deadline) < new Date()
        
        return {
          ...task,
          isCompleted,
          isOverdue,
          formattedDeadline: this.formatDate(task.deadline)
        }
      })
      
      // 计算统计信息
      const taskStats = {
        total: formattedTasks.length,
        completed: formattedTasks.filter(t => t.isCompleted).length,
        pending: formattedTasks.filter(t => !t.isCompleted && !t.isOverdue).length,
        overdue: formattedTasks.filter(t => t.isOverdue).length
      }
      
      this.setData({ 
        tasks: formattedTasks,
        taskStats,
        loading: false
      })
      
      return formattedTasks
      
    } catch (error) {
      console.error('加载任务失败:', error)
      this.setData({ 
        tasks: [],
        taskStats: {
          total: 0,
          completed: 0,
          pending: 0,
          overdue: 0
        },
        loading: false
      })
      return []
    }
  },
  
  // 格式化日期
  formatDate(dateString) {
    if (!dateString) return ''
    
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = date - now
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays < 0) {
      return `已过期 ${Math.abs(diffDays)} 天`
    } else if (diffDays === 0) {
      return '今天到期'
    } else if (diffDays === 1) {
      return '明天到期'
    } else if (diffDays <= 7) {
      return `${diffDays} 天后到期`
    } else {
      return `${date.getMonth() + 1}月${date.getDate()}日到期`
    }
  },

  // 显示创建任务模态框
  showCreateTask() {
    this.setData({ showCreateModal: true })
  },

  // 隐藏创建任务模态框
  hideCreateTask() {
    this.setData({ 
      showCreateModal: false,
      newTaskTitle: '',
      newTaskDescription: '',
      newTaskDeadline: ''
    })
  },

  // 输入处理
  onTitleInput(e) {
    this.setData({ newTaskTitle: e.detail.value })
  },

  onDescriptionInput(e) {
    this.setData({ newTaskDescription: e.detail.value })
  },

  onDeadlineChange(e) {
    this.setData({ newTaskDeadline: e.detail.value })
  },

  // 创建新任务
  async createTask() {
    const { newTaskTitle, newTaskDescription, newTaskDeadline, groupId, userId } = this.data
    
    if (!newTaskTitle.trim()) {
      wx.showToast({ title: '请输入任务标题', icon: 'none' })
      return
    }

    wx.showLoading({ title: '创建中...' })
    
    try {
      const { request } = require('../../utils/supabase')
      
      // 创建任务
      const result = await request('group_tasks', {
        method: 'POST',
        data: [{
          group_id: groupId,
          title: newTaskTitle.trim(),
          description: newTaskDescription.trim(),
          deadline: newTaskDeadline,
          created_by: userId,
          status: 'pending',
          created_at: new Date().toISOString()
        }]
      })
      
      wx.hideLoading()
      
      if (result && result.length > 0) {
        wx.showToast({ title: '任务创建成功' })
        this.hideCreateTask()
        
        // 重新加载任务列表
        this.loadTasks()
      } else {
        throw new Error('创建任务失败')
      }
      
    } catch (error) {
      console.error('创建任务失败:', error)
      wx.hideLoading()
      wx.showToast({ title: '创建任务失败', icon: 'none' })
    }
  },

  // 标记任务完成/未完成
  async toggleTaskStatus(e) {
    // 添加触感反馈
    wx.vibrateShort({ type: 'medium' })
    
    const taskId = e.currentTarget.dataset.id
    const taskIndex = e.currentTarget.dataset.index
    const currentStatus = e.currentTarget.dataset.status
    
    try {
      const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'
      
      wx.showLoading({ title: '更新中...' })
      
      const { request } = require('../../utils/supabase')
      
      const result = await request('group_tasks', {
        method: 'PATCH',
        query: `id=eq.${taskId}`,
        data: {
          status: newStatus,
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null
        }
      })
      
      wx.hideLoading()
      
      if (result) {
        // 更新本地任务状态
        const tasks = [...this.data.tasks]
        tasks[taskIndex].status = newStatus
        tasks[taskIndex].completed_at = newStatus === 'completed' ? new Date().toISOString() : null
        tasks[taskIndex].isCompleted = newStatus === 'completed'
        
        this.setData({ tasks })
        
        // 重新加载统计信息
        this.loadTasks()
        
        wx.showToast({
          title: newStatus === 'completed' ? '任务已完成' : '任务标记为未完成',
          icon: 'success'
        })
      }
      
    } catch (error) {
      console.error('更新任务状态失败:', error)
      wx.hideLoading()
      wx.showToast({ title: '更新失败', icon: 'none' })
    }
  },

  // 删除任务
  async deleteTask(e) {
    const taskId = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个任务吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' })
          
          try {
            const { request } = require('../../utils/supabase')
            
            const result = await request('group_tasks', {
              method: 'DELETE',
              query: `id=eq.${taskId}`
            })
            
            wx.hideLoading()
            
            wx.showToast({ title: '删除成功', icon: 'success' })
            
            // 重新加载任务列表
            this.loadTasks()
            
          } catch (error) {
            console.error('删除任务失败:', error)
            wx.hideLoading()
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  },

  // 查看任务详情
  viewTaskDetail(e) {
    // 添加触感反馈
    wx.vibrateShort({ type: 'light' })
    
    const taskId = e.currentTarget.dataset.id
    const task = this.data.tasks.find(t => t.id === taskId)
    
    // 跳转到任务详情页面
    wx.navigateTo({
      url: `/pages/groups/task-detail?taskId=${taskId}&groupId=${this.data.groupId}&fromGroup=true`
    })
  },

  // 快速创建多个任务
  quickCreateTasks() {
    const userId = this.data.userId
    
    const sampleTasks = [
      {
        title: '完成小组项目需求文档',
        description: '整理并完成项目需求分析文档，包括功能规格和技术要求',
        deadline: this.getDateAfterDays(7)
      },
      {
        title: '准备小组会议材料',
        description: '准备本周小组会议的议程和相关材料',
        deadline: this.getDateAfterDays(2)
      },
      {
        title: '代码审查与优化',
        description: '对小组成员提交的代码进行审查，并提供优化建议',
        deadline: this.getDateAfterDays(5)
      }
    ]
    
    wx.showModal({
      title: '快速创建示例任务',
      content: '是否要创建3个示例任务？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '创建中...' })
          
          try {
            const { request } = require('../../utils/supabase')
            
            // 为每个示例任务添加必要字段
            const formattedTasks = sampleTasks.map(task => ({
              group_id: this.data.groupId,
              title: task.title,
              description: task.description,
              deadline: task.deadline,
              created_by: userId,
              status: 'pending',
              created_at: new Date().toISOString()
            }))
            
            // 批量创建任务
            const result = await request('group_tasks', {
              method: 'POST',
              data: formattedTasks
            })
            
            wx.hideLoading()
            
            if (result && result.length > 0) {
              wx.showToast({ 
                title: `成功创建${result.length}个任务`, 
                icon: 'success' 
              })
              
              // 重新加载任务列表
              this.loadTasks()
            } else {
              throw new Error('创建任务失败')
            }
            
          } catch (error) {
            console.error('快速创建任务失败:', error)
            wx.hideLoading()
            wx.showToast({ title: '创建失败', icon: 'none' })
          }
        }
      }
    })
  },
  
  // 获取指定天数后的日期
  getDateAfterDays(days) {
    const date = new Date()
    date.setDate(date.getDate() + days)
    return date.toISOString().split('T')[0]
  }
})