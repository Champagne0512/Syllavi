// pages/groups/tasks.js
const app = getApp()

Page({
  data: {
    groupId: null,
    groupInfo: {},
    userRole: '',
    userId: '',
    members: [],
    tasks: [],
    taskForm: {
      title: '',
      description: '',
      mode: 'persistent',
      type: '',
      isImportant: false,
      urgent: false,
      has_specific_time: false,
      deadline_date: '',
      deadline_time: '',
      related_course_id: null
    },
    formDirty: false,
    showCreateModal: false,
    loading: true,
    initialTaskId: ''
  },

  onLoad(options) {
    console.log('tasks.js - 页面加载，参数:', options)
    const groupId = options.groupId || options.id
    if (!groupId) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      wx.navigateBack()
      return
    }
    
    this.setData({ groupId, initialTaskId: options.taskId || '' })
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
      
      await this.loadMembers()
      // 加载任务列表
      await this.loadTasks()
      
    } catch (error) {
      console.error('加载小组信息失败:', error)
      wx.showToast({ title: '加载小组信息失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  async loadMembers() {
    try {
      const { request } = require('../../utils/supabase')
      const members = await request('group_members', {
        query: `group_id=eq.${this.data.groupId}`
      })
      this.setData({ members: members || [] })
    } catch (error) {
      console.error('加载小组成员失败:', error)
      this.setData({ members: [] })
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
        let meta = task.meta || {}
        if (typeof meta === 'string') {
          try { meta = JSON.parse(meta) } catch (err) { meta = {} }
        }
        const isCompleted = task.status === 'completed'
        const hasDeadline = !!task.deadline
        const isOverdue = hasDeadline && !isCompleted && new Date(task.deadline) < new Date()
        return {
          ...task,
          meta,
          displayType: meta.type || '',
          displayMode: meta.mode || 'persistent',
          isImportant: !!meta.isImportant,
          urgent: !!meta.urgent,
          isCompleted,
          isOverdue,
          formattedDeadline: this.formatDate(task.deadline, meta)
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
  formatDate(dateString, meta = {}) {
    if (!dateString) return ''
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = date - now
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    const dateLabel = `${date.getMonth() + 1}月${date.getDate()}日`
    const timeLabel = meta.hasSpecificTime && meta.deadlineTime ? ` ${meta.deadlineTime}` : ''

    if (diffDays < 0) {
      return `${dateLabel}${timeLabel} · 已过期 ${Math.abs(diffDays)} 天`
    } else if (diffDays === 0) {
      return `${dateLabel}${timeLabel} · 今天到期`
    } else if (diffDays === 1) {
      return `${dateLabel}${timeLabel} · 明天到期`
    } else if (diffDays <= 7) {
      return `${dateLabel}${timeLabel} · ${diffDays} 天后`
    }
    return `${dateLabel}${timeLabel}`
  },

  // 显示创建任务模态框
  showCreateTask() {
    wx.vibrateShort({ type: 'light' })
    if (!this.data.members.length) {
      this.loadMembers()
    }
    this.resetTaskForm()
    this.setData({ showCreateModal: true })
  },

  hideCreateTask() {
    wx.vibrateShort({ type: 'light' })
    this.setData({ showCreateModal: false })
    this.resetTaskForm()
  },

  resetTaskForm() {
    const today = new Date().toISOString().split('T')[0]
    this.setData({
      taskForm: {
        title: '',
        description: '',
        mode: 'persistent',
        type: '',
        isImportant: false,
        urgent: false,
        has_specific_time: false,
        deadline_date: today,
        deadline_time: '',
        related_course_id: null
      },
      formDirty: false
    })
  },

  setTaskField(field, value) {
    this.setData({ [`taskForm.${field}`]: value, formDirty: true })
  },

  onTitleInput(e) {
    this.setTaskField('title', e.detail.value)
  },

  onDescriptionInput(e) {
    this.setTaskField('description', e.detail.value)
  },

  onDeadlineDateChange(e) {
    this.setTaskField('deadline_date', e.detail.value)
  },

  onDeadlineTimeChange(e) {
    this.setTaskField('deadline_time', e.detail.value)
  },

  switchTaskMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (!mode || mode === this.data.taskForm.mode) return
    const updates = {
      'taskForm.mode': mode,
      formDirty: true
    }
    if (mode === 'instant') {
      updates['taskForm.has_specific_time'] = true
      if (!this.data.taskForm.deadline_time) {
        updates['taskForm.deadline_time'] = '08:00'
      }
    }
    this.setData(updates)
  },

  toggleSpecificTime() {
    const hasSpecificTime = !this.data.taskForm.has_specific_time
    this.setData({
      'taskForm.has_specific_time': hasSpecificTime,
      formDirty: true
    })
  },

  selectTaskType(e) {
    const type = e.currentTarget.dataset.type
    const current = this.data.taskForm.type
    this.setData({
      'taskForm.type': current === type ? '' : type,
      formDirty: true
    })
  },

  toggleImportant() {
    this.setData({
      'taskForm.isImportant': !this.data.taskForm.isImportant,
      formDirty: true
    })
  },

  toggleUrgent() {
    this.setData({
      'taskForm.urgent': !this.data.taskForm.urgent,
      formDirty: true
    })
  },

  async createTask() {
    const payload = this.buildTaskPayload()
    if (!payload) return

    wx.showLoading({ title: '创建中...' })
    try {
      const { request } = require('../../utils/supabase')
      const result = await request('group_tasks', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        data: [payload]
      })

      if (!result || !result.length) {
        throw new Error('创建任务失败')
      }

      const newTask = result[0]
      await this.assignTaskToMembers(newTask.id)

      wx.showToast({ title: '任务创建成功' })
      this.hideCreateTask()
      this.loadTasks()
    } catch (error) {
      console.error('创建任务失败:', error)
      wx.showToast({ title: '创建任务失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  buildTaskPayload() {
    const { taskForm, groupId, userId } = this.data
    if (!taskForm.title.trim()) {
      wx.showToast({ title: '请输入任务标题', icon: 'none' })
      return null
    }

    if (!taskForm.deadline_date) {
      wx.showToast({ title: '请选择截止日期', icon: 'none' })
      return null
    }

    const deadlineISO = this.getDeadlineISO()

    return {
      group_id: groupId,
      created_by: userId,
      title: taskForm.title.trim(),
      description: taskForm.description.trim(),
      deadline: deadlineISO,
      status: 'pending',
      created_at: new Date().toISOString(),
      meta: {
        mode: taskForm.mode,
        type: taskForm.type,
        urgent: taskForm.urgent,
        isImportant: taskForm.isImportant,
        hasSpecificTime: taskForm.has_specific_time,
        deadlineDate: taskForm.deadline_date,
        deadlineTime: taskForm.deadline_time,
        relatedCourseId: taskForm.related_course_id
      }
    }
  },

  getDeadlineISO() {
    const { deadline_date, deadline_time, has_specific_time } = this.data.taskForm
    if (!deadline_date) return null
    if (has_specific_time && deadline_time) {
      return `${deadline_date}T${deadline_time}:00`
    }
    return `${deadline_date}T23:59:59`
  },

  async assignTaskToMembers(taskId) {
    if (!taskId) return
    const { request } = require('../../utils/supabase')
    try {
      const members = this.data.members.length ? this.data.members : await request('group_members', {
        query: `group_id=eq.${this.data.groupId}`
      })
      if (!members || !members.length) return
      const uniqueUserIds = [...new Set(members.map(member => member.user_id || member.id).filter(Boolean))]
      if (!uniqueUserIds.length) return
      const rows = uniqueUserIds.map(userId => ({
        task_id: taskId,
        user_id: userId,
        is_completed: false
      }))
      await request('group_task_members', {
        method: 'POST',
        data: rows
      })
    } catch (error) {
      console.error('为成员分配小组任务失败:', error)
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
      await request('group_task_members', {
        method: 'PATCH',
        query: `task_id=eq.${taskId}`,
        data: {
          is_completed: newStatus === 'completed',
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
            
            await request('group_task_members', {
              method: 'DELETE',
              query: `task_id=eq.${taskId}`
            })
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
        deadline_date: this.getDateAfterDays(7),
        mode: 'persistent'
      },
      {
        title: '准备小组会议材料',
        description: '准备本周小组会议的议程和相关材料',
        deadline_date: this.getDateAfterDays(2),
        mode: 'instant',
        has_specific_time: true,
        deadline_time: '09:00'
      },
      {
        title: '代码审查与优化',
        description: '对小组成员提交的代码进行审查，并提供优化建议',
        deadline_date: this.getDateAfterDays(5),
        mode: 'persistent'
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
            const payloads = sampleTasks.map(task => ({
              group_id: this.data.groupId,
              created_by: userId,
              title: task.title,
              description: task.description,
              deadline: task.has_specific_time && task.deadline_time
                ? `${task.deadline_date}T${task.deadline_time}:00`
                : `${task.deadline_date}T23:59:59`,
              status: 'pending',
              created_at: new Date().toISOString(),
              meta: {
                mode: task.mode || 'persistent',
                type: '',
                urgent: false,
                isImportant: false,
                hasSpecificTime: !!task.has_specific_time,
                deadlineDate: task.deadline_date,
                deadlineTime: task.deadline_time || '',
                relatedCourseId: null
              }
            }))
            const result = await request('group_tasks', {
              method: 'POST',
              headers: { Prefer: 'return=representation' },
              data: payloads
            })

            if (result && result.length) {
              await Promise.all(result.map(task => this.assignTaskToMembers(task.id)))
              wx.showToast({ title: `成功创建${result.length}个任务`, icon: 'success' })
              this.loadTasks()
            } else {
              throw new Error('创建任务失败')
            }
            
          } catch (error) {
            console.error('快速创建任务失败:', error)
            wx.showToast({ title: '创建失败', icon: 'none' })
          } finally {
            wx.hideLoading()
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
