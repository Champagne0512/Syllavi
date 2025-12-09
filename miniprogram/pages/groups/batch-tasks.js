// pages/groups/batch-tasks.js - 组长批量安排小组待办目标
const app = getApp()
const { request } = require('../../utils/supabase')

const IMPORTANT_EVENT_TYPES = new Set(['exam', 'deadline', 'holiday', 'birthday', 'anniversary'])
const GROUP_META_PREFIX = '__SYLLAVI_GROUP_META__:'

const EVENT_OPTIONS = [
  { key: 'exam', label: '考试', icon: '📝' },
  { key: 'deadline', label: '截止', icon: '⏰' },
  { key: 'holiday', label: '假期', icon: '🎉' },
  { key: 'birthday', label: '生日', icon: '🎂' },
  { key: 'anniversary', label: '纪念', icon: '💝' }
]

function createEmptyTaskForm() {
  const today = new Date()
  const dateStr = today.toISOString().split('T')[0]
  return {
    mode: 'persistent',
    title: '',
    description: '',
    deadline_date: dateStr,
    deadline_time: '23:59',
    has_specific_time: false,
    type: '',
    urgent: false,
    assignToAll: true,
    selectedMembers: [],
    deadline: ''
  }
}

Page({
  data: {
    groupId: '',
    groupInfo: null,
    members: [],
    taskForm: createEmptyTaskForm(),
    eventOptions: EVENT_OPTIONS,
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

      const userId = app.globalData?.user?.id || wx.getStorageSync('userId') || app.globalData?.supabase?.userId
      if (!userId) {
        wx.showToast({ title: '请先登录', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }

      const groupInfo = await request('study_groups', { query: `id=eq.${this.data.groupId}` })
      if (!groupInfo || groupInfo.length === 0) {
        wx.showToast({ title: '小组不存在', icon: 'none' })
        wx.navigateBack()
        return
      }

      this.setData({ groupInfo: groupInfo[0] })

      const memberInfo = await request('group_members', { query: `group_id=eq.${this.data.groupId}&user_id=eq.${userId}` })
      const role = memberInfo && memberInfo.length > 0 ? memberInfo[0].role : 'member'
      if (!['leader', 'deputy_leader'].includes(role)) {
        wx.showToast({ title: '只有组长可以安排任务', icon: 'none' })
        wx.navigateBack()
        return
      }

      await this.loadMembers()
      this.resetForm()
      this.setData({ loading: false })
    } catch (error) {
      console.error('加载小组数据失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  async loadMembers() {
    try {
      const members = await request('group_members', {
        query: `group_id=eq.${this.data.groupId}&order=joined_at.asc`,
        headers: { Select: 'id,role,joined_at,user_id,profiles:nickname,profiles:avatar_url' }
      })

      const selectedSet = new Set(this.data.taskForm.selectedMembers)
      const formatted = (members || []).map(member => ({
        id: member.id,
        user_id: member.user_id,
        role: member.role,
        joined_at: member.joined_at,
        nickname: member.profiles?.nickname || `用户${member.user_id?.slice(-6) || ''}`,
        avatar_url: member.profiles?.avatar_url || '/static/default-avatar.png',
        selected: selectedSet.has(member.user_id)
      }))

      this.setData({ members: formatted })
    } catch (error) {
      console.error('加载成员列表失败:', error)
      this.setData({ members: [] })
    }
  },

  resetForm() {
    this.setData({ taskForm: createEmptyTaskForm() }, () => {
      this.updateDeadline()
    })
  },

  onInputChange(e) {
    const { field } = e.currentTarget.dataset
    this.updateTaskForm(field, e.detail.value)
  },

  updateTaskForm(field, value) {
    this.setData({ [`taskForm.${field}`]: value }, () => {
      if (field === 'deadline_date' || field === 'deadline_time' || field === 'mode' || field === 'has_specific_time') {
        this.updateDeadline()
      }
    })
  },

  onDateChange(e) {
    this.updateTaskForm('deadline_date', e.detail.value)
  },

  onTimeChange(e) {
    this.updateTaskForm('deadline_time', e.detail.value)
  },

  switchTaskMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (!mode || mode === this.data.taskForm.mode) return
    const updates = { 'taskForm.mode': mode }
    if (mode === 'instant') {
      updates['taskForm.has_specific_time'] = true
      if (!this.data.taskForm.deadline_time || this.data.taskForm.deadline_time === '23:59') {
        updates['taskForm.deadline_time'] = '08:00'
      }
    } else {
      updates['taskForm.has_specific_time'] = false
      updates['taskForm.deadline_time'] = '23:59'
    }
    this.setData(updates, () => this.updateDeadline())
    wx.vibrateShort({ type: 'light' })
  },

  toggleSpecificTime() {
    if (this.data.taskForm.mode === 'instant') return
    this.setData({
      'taskForm.has_specific_time': !this.data.taskForm.has_specific_time
    }, () => this.updateDeadline())
    wx.vibrateShort({ type: 'light' })
  },

  selectEventType(e) {
    const type = e.currentTarget.dataset.type
    const current = this.data.taskForm.type
    this.setData({
      'taskForm.type': current === type ? '' : type,
      'taskForm.urgent': type ? false : this.data.taskForm.urgent
    })
    wx.vibrateShort({ type: 'light' })
  },

  toggleUrgent() {
    this.setData({
      'taskForm.urgent': !this.data.taskForm.urgent,
      'taskForm.type': ''
    })
    wx.vibrateShort({ type: 'light' })
  },

  onAssignToAllChange(e) {
    const assignToAll = !!e.detail.value
    this.setData({
      'taskForm.assignToAll': assignToAll,
      'taskForm.selectedMembers': assignToAll ? [] : this.data.taskForm.selectedMembers
    })
    if (assignToAll) {
      this.setData({
        members: this.data.members.map(member => ({ ...member, selected: false }))
      })
    }
    wx.vibrateShort({ type: 'light' })
  },

  onMemberSelect(e) {
    if (this.data.taskForm.assignToAll) return
    const index = e.currentTarget.dataset.index
    const members = [...this.data.members]
    members[index].selected = !members[index].selected
    const selectedMembers = members.filter(member => member.selected).map(member => member.user_id)
    this.setData({
      members,
      'taskForm.selectedMembers': selectedMembers
    })
    wx.vibrateShort({ type: 'light' })
  },

  updateDeadline() {
    const deadline = this.getDeadlineISO()
    this.setData({ 'taskForm.deadline': deadline })
  },

  getDeadlineISO() {
    const { deadline_date, deadline_time, has_specific_time, mode } = this.data.taskForm
    if (!deadline_date) return ''
    let timeStr = '23:59'
    if (mode === 'instant') {
      timeStr = deadline_time || '08:00'
    } else if (has_specific_time && deadline_time) {
      timeStr = deadline_time
    }
    return `${deadline_date}T${timeStr}:00`
  },

  validateForm() {
    const { title, deadline_date, deadline_time, mode, assignToAll, selectedMembers } = this.data.taskForm
    if (!title.trim()) {
      wx.showToast({ title: '请输入任务标题', icon: 'none' })
      return false
    }
    if (!deadline_date) {
      wx.showToast({ title: '请选择截止日期', icon: 'none' })
      return false
    }
    if (mode === 'instant' && !deadline_time) {
      wx.showToast({ title: '请输入具体时间', icon: 'none' })
      return false
    }
    if (!assignToAll && selectedMembers.length === 0) {
      wx.showToast({ title: '请选择要分配的成员', icon: 'none' })
      return false
    }
    return true
  },

  buildTaskMeta() {
    const { mode, deadline_date, deadline_time, has_specific_time, type, urgent } = this.data.taskForm
    return {
      mode,
      deadlineDate: deadline_date,
      deadlineTime: deadline_time,
      hasSpecificTime: has_specific_time,
      eventType: type || null,
      urgent: !!urgent,
      isImportant: !!type
    }
  },

  async createBatchTasks() {
    wx.vibrateShort({ type: 'medium' })
    if (!this.validateForm()) return

    try {
      this.setData({ submitting: true })
      wx.showLoading({ title: '创建任务中...' })

      const userId = app.globalData?.user?.id || wx.getStorageSync('userId') || app.globalData?.supabase?.userId
      if (!userId) {
        wx.hideLoading()
        wx.showToast({ title: '请先登录', icon: 'none' })
        return
      }

      const meta = this.buildTaskMeta()
      const deadlineISO = this.data.taskForm.deadline || this.getDeadlineISO()
      const targetMembers = this.data.taskForm.assignToAll
        ? this.data.members.map(member => member.user_id)
        : this.data.taskForm.selectedMembers

      const taskData = {
        group_id: this.data.groupId,
        title: this.data.taskForm.title.trim(),
        description: this.data.taskForm.description.trim(),
        deadline: deadlineISO,
        created_by: userId,
        status: 'pending',
        meta
      }

      const taskResult = await request('group_tasks', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        data: [taskData]
      })

      if (!taskResult || !taskResult.length) {
        throw new Error('创建任务失败: 无效响应')
      }

      const taskId = taskResult[0].id

      const uniqueMembers = [...new Set(targetMembers.filter(Boolean))]
      const memberRows = uniqueMembers.map(memberId => ({
        task_id: taskId,
        user_id: memberId,
        is_completed: false
      }))

      if (memberRows.length) {
        await request('group_task_members', {
          method: 'POST',
          data: memberRows
        })
      }

      wx.hideLoading()
      wx.showToast({
        title: `成功分配给${memberRows.length}人`,
        icon: 'success',
        duration: 2000
      })

      wx.setStorageSync('force_refresh_tasks', true)
      setTimeout(() => wx.navigateBack(), 1200)
    } catch (error) {
      console.warn('小组任务表不可用，尝试使用个人任务表:', error)
      try {
        await this.createFallbackTasks()
        wx.hideLoading()
        wx.showToast({ title: '已同步到个人待办', icon: 'success' })
        wx.setStorageSync('force_refresh_tasks', true)
        setTimeout(() => wx.navigateBack(), 1200)
      } catch (fallbackError) {
        console.error('创建小组任务失败:', fallbackError)
        wx.hideLoading()
        wx.showToast({
          title: `创建失败: ${fallbackError.message || '未知错误'}`,
          icon: 'none'
        })
      }
    } finally {
      this.setData({ submitting: false })
    }
  },

  async createFallbackTasks() {
    const deadlineISO = this.data.taskForm.deadline || this.getDeadlineISO()
    const meta = this.buildTaskMeta()
    const description = this.data.taskForm.description.trim()
    const contextLines = [
      description,
      `小组ID: ${this.data.groupId}`,
      `分配给: ${this.data.groupInfo?.name || '学习小组'}`,
      `${GROUP_META_PREFIX}${JSON.stringify(meta)}`
    ].filter(Boolean)
    const mergedDescription = contextLines.join('\n')
    const userId = app.globalData?.user?.id || wx.getStorageSync('userId') || app.globalData?.supabase?.userId

    const buildPayloads = (withGroupFields = true) => {
      const baseMembers = this.data.taskForm.assignToAll
        ? this.data.members.map(member => member.user_id)
        : this.data.taskForm.selectedMembers
      const uniqueMembers = [...new Set(baseMembers.filter(Boolean))]
      return uniqueMembers.map(memberId => {
        const payload = {
          user_id: memberId,
          type: this.data.taskForm.mode === 'persistent' ? 'homework' : 'exam',
          title: `[小组任务] ${this.data.taskForm.title.trim()}`,
          description: mergedDescription,
          deadline: deadlineISO,
          is_completed: false,
          related_course_id: null,
          event_type: this.data.taskForm.type || null,
          is_important: !!this.data.taskForm.type
        }
        if (withGroupFields) {
          payload.group_id = this.data.groupId
          payload.is_group_task = true
          payload.created_by = userId
        }
        return payload
      })
    }

    try {
      await request('tasks', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        data: buildPayloads(true)
      })
      return
    } catch (error) {
      console.warn('包含 group_id 字段创建失败，尝试降级:', error)
    }

    await request('tasks', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      data: buildPayloads(false)
    })
  },

  fillExampleTask() {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateStr = tomorrow.toISOString().split('T')[0]
    this.setData({
      taskForm: {
        ...this.data.taskForm,
        title: '完成阶段性复盘',
        description: '同步项目进度，归档阶段性成果。',
        deadline_date: dateStr,
        deadline_time: '18:00',
        mode: 'persistent',
        has_specific_time: false,
        type: '',
        urgent: false
      }
    }, () => this.updateDeadline())
    wx.showToast({ title: '已填入示例', icon: 'success' })
  }
})
