// pages/groups/detail.js
const app = getApp()
const { request } = require('../../utils/supabase')

Page({
  data: {
    groupId: '',
    groupInfo: null,
    creatorName: '',
    members: [],
    tasks: [],
    loading: true,
    isMember: false,
    userRole: '',
    currentTab: 'info'
  },

  onLoad(options) {
    console.log('detail.js - 页面加载，参数:', options)
    if (options.id) {
      this.setData({ groupId: options.id })
      this.loadGroupDetail()
    } else {
      console.error('detail.js - 缺少小组ID参数')
      wx.showToast({ title: '参数错误', icon: 'none' })
      wx.navigateBack()
    }
  },

  // 返回上一页
  goBack() {
    // 添加触感反馈
    wx.vibrateShort({ type: 'light' })
    wx.navigateBack()
  },

  onPullDownRefresh() {
    this.loadGroupDetail().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadGroupDetail() {
    try {
      this.setData({ loading: true })
      
      // 获取用户ID - 从全局数据和本地存储中获取，确保使用真实用户ID
      let userId = app.globalData?.user?.id || wx.getStorageSync('userId') || app.globalData?.supabase?.userId
      
      // 如果仍然没有获取到用户ID，提示用户登录
      if (!userId) {
        wx.showToast({ title: '请先登录', icon: 'none' })
        setTimeout(() => {
          wx.navigateTo({
            url: '/pages/login/login'
          })
        }, 1500)
        return
      }
      
      console.log('detail.js - 使用用户ID:', userId)
      console.log('detail.js - 小组ID:', this.data.groupId)
      
      // 直接查询小组详情
      const groupInfo = await request('study_groups', {
        query: `id=eq.${this.data.groupId}`
      })
      
      console.log('detail.js - 小组信息查询结果:', groupInfo)
      
      if (!groupInfo || groupInfo.length === 0) {
        wx.showToast({ title: '小组不存在', icon: 'none' })
        wx.navigateBack()
        return
      }

      const group = groupInfo[0]
      let creatorName = ''
      try {
        const creatorProfile = await request('profiles', {
          query: `id=eq.${group.created_by}&select=id,nickname,username,full_name`
        })
        if (creatorProfile && creatorProfile.length > 0) {
          const profile = creatorProfile[0]
          creatorName = profile.nickname || profile.username || profile.full_name || ''
        }
      } catch (creatorErr) {
        console.warn('获取创建者信息失败:', creatorErr)
      }
      
      // 检查用户是否是创建者（创建者自动为组长）
      let isMember = false
      let userRole = 'non_member'
      
      console.log('detail.js - 小组创建者:', group.created_by, '当前用户:', userId)
      
      // 如果是小组创建者，自动设置为组长
      if (group.created_by === userId) {
        console.log('detail.js - 用户是小组创建者，自动设为组长')
        isMember = true
        userRole = 'leader'
        
        // 确保创建者在成员表中有记录（如果还没有的话）
        const membership = await request('group_members', {
          query: `group_id=eq.${this.data.groupId}&user_id=eq.${userId}`
        })
        
        if (!membership || membership.length === 0) {
          console.log('detail.js - 创建者不在成员表中，自动添加')
          try {
            await request('group_members', {
              method: 'POST',
              data: [{
                group_id: this.data.groupId,
                user_id: userId,
                role: 'leader'
              }]
            })
          } catch (err) {
            console.error('添加创建者到成员表失败:', err)
            // 不阻断流程，用户已被识别为组长
          }
        }
      } else {
        // 不是创建者，检查是否是成员
        const membership = await request('group_members', {
          query: `group_id=eq.${this.data.groupId}&user_id=eq.${userId}`
        })
        
        console.log('detail.js - 成员关系查询结果:', membership)
        
        isMember = membership && membership.length > 0
        userRole = isMember ? membership[0].role : 'non_member'
      }
      
      console.log('detail.js - 是否成员:', isMember, '角色:', userRole)
      
      this.setData({
        groupInfo: group,
        creatorName,
        isMember,
        userRole
      })

      // 如果是成员，加载成员列表和任务
      if (isMember) {
        await Promise.all([
          this.loadMembers(),
          this.loadTasks()
        ])
      }

      this.setData({ loading: false })

    } catch (error) {
      console.error('加载小组详情失败:', error)
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
      
      console.log('detail.js - 成员列表加载结果:', members)

      // 处理成员数据，确保显示真实用户信息
      const formattedMembers = (members || []).map(member => ({
        id: member.id,
        user_id: member.user_id,
        role: member.role,
        joined_at: member.joined_at,
        nickname: member.profiles?.nickname || `用户${member.user_id?.slice(-6) || ''}`,
        avatar_url: member.profiles?.avatar_url || '/static/default-avatar.png'
      }))

      this.setData({ 
        members: formattedMembers 
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
          avatar_url: '/static/default-avatar.png'
        }))
        
        this.setData({ 
          members: formattedMembers 
        })
      } catch (fallbackError) {
        console.error('备用方法获取成员信息也失败:', fallbackError)
        this.setData({ 
          members: [] 
        })
      }
    }
  },

  async loadTasks() {
    try {
      // 获取真实的用户ID
      const userId = app.globalData?.user?.id || wx.getStorageSync('userId') || app.globalData?.supabase?.userId
      
      // 获取小组任务列表
      const tasks = await request('group_tasks', {
        query: `group_id=eq.${this.data.groupId}&order=created_at.desc`
      })

      console.log('detail.js - 任务列表加载结果:', tasks)

      // 计算任务统计信息
      const taskStats = {
        total: tasks ? tasks.length : 0,
        completed: tasks ? tasks.filter(t => t.status === 'completed').length : 0,
        pending: tasks ? tasks.filter(t => t.status === 'pending').length : 0,
        myTotal: tasks ? tasks.filter(t => t.assigned_to === userId).length : 0,
        myCompleted: tasks ? tasks.filter(t => t.assigned_to === userId && t.status === 'completed').length : 0
      }

      // 格式化任务数据，添加是否属于当前用户的标识
      const formattedTasks = (tasks || []).map(task => ({
        ...task,
        isMyTask: task.assigned_to === userId,
        isCreator: task.created_by === userId
      }))

      this.setData({ 
        tasks: formattedTasks,
        taskStats: taskStats
      })
      
      console.log('detail.js - 任务统计信息:', taskStats)
      
    } catch (error) {
      console.error('加载任务列表失败:', error)
      this.setData({ 
        tasks: [],
        taskStats: {
          total: 0,
          completed: 0,
          pending: 0,
          myTotal: 0,
          myCompleted: 0
        }
      })
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

  switchTab(e) {
    // 添加触感反馈
    wx.vibrateShort({ type: 'light' })
    
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
  },

  // 复制小组码
  copyGroupCode() {
    // 添加触感反馈
    wx.vibrateShort({ type: 'light' })
    
    wx.setClipboardData({
      data: this.data.groupInfo.group_code,
      success: () => {
        wx.showToast({ title: '小组码已复制', icon: 'success' })
      }
    })
  },

  // 申请加入小组
  async joinGroup() {
    // 添加触感反馈
    wx.vibrateShort({ type: 'medium' })
    
    try {
      // 获取真实的用户ID
      const userId = app.globalData?.user?.id || wx.getStorageSync('userId') || app.globalData?.supabase?.userId
      
      // 确保用户ID存在
      if (!userId) {
        wx.showToast({ title: '请先登录', icon: 'none' })
        return
      }
      
      wx.showLoading({ title: '申请中...' })
      
      // 检查是否已经是成员
      const existingMembership = await request('group_members', {
        query: `group_id=eq.${this.data.groupId}&user_id=eq.${userId}`
      })
      
      if (existingMembership && existingMembership.length > 0) {
        wx.hideLoading()
        wx.showToast({ title: '您已经是该小组成员', icon: 'none' })
        return
      }
      
      // 加入小组
      const result = await request('group_members', {
        method: 'POST',
        data: [{
          group_id: this.data.groupId,
          user_id: userId,
          role: 'member'
        }]
      })
      
      wx.hideLoading()
      
      if (result) {
        wx.showToast({ title: '加入成功', icon: 'success' })
        // 重新加载页面数据
        this.loadGroupDetail()
      } else {
        wx.showToast({ title: '加入失败', icon: 'none' })
      }
      
    } catch (error) {
      console.error('加入小组失败:', error)
      wx.hideLoading()
      wx.showToast({ title: '加入失败', icon: 'none' })
    }
  },

  // 邀请成员
  inviteMember() {
    wx.showModal({
      title: '邀请成员',
      content: `小组码：${this.data.groupInfo.group_code}`,
      confirmText: '复制小组码',
      success: (res) => {
        if (res.confirm) {
          this.copyGroupCode()
        }
      }
    })
  },



  // 查看成员管理
  viewMembers() {
    wx.navigateTo({
      url: `/pages/groups/members?id=${this.data.groupId}`
    })
  },

  // 查看任务管理
  viewTasks() {
    this.openTaskManager()
  },

  openTaskManager() {
    // 添加触感反馈
    wx.vibrateShort({ type: 'light' })
    
    wx.navigateTo({
      url: `/pages/groups/tasks?groupId=${this.data.groupId}`
    })
  },

  editTask(e) {
    wx.vibrateShort({ type: 'light' })
    const taskId = e.currentTarget.dataset.id
    const suffix = taskId ? `&taskId=${taskId}` : ''
    wx.navigateTo({
      url: `/pages/groups/tasks?groupId=${this.data.groupId}${suffix}`
    })
  },

  // 批量安排任务（仅组长和副组长可用）
  batchAssignTasks() {
    // 添加触感反馈
    wx.vibrateShort({ type: 'medium' })
    
    if (!['leader', 'deputy_leader'].includes(this.data.userRole)) {
      wx.showToast({ title: '只有组长可以批量安排任务', icon: 'none' })
      return
    }
    
    wx.navigateTo({
      url: `/pages/groups/batch-tasks?id=${this.data.groupId}`
    })
  },

  // 退出小组
  async leaveGroup() {
    // 添加触感反馈
    wx.vibrateShort({ type: 'medium' })
    
    wx.showModal({
      title: '退出小组',
      content: '确定要退出这个小组吗？',
      confirmText: '确定退出',
      cancelText: '再想想',
      confirmColor: '#ff4757',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '退出中...' })
            
            // 获取真实的用户ID
            const userId = app.globalData?.user?.id || wx.getStorageSync('userId') || app.globalData?.supabase?.userId
            
            // 确保用户ID存在
            if (!userId) {
              wx.hideLoading()
              wx.showToast({ title: '用户信息异常', icon: 'none' })
              return
            }
            
            console.log('detail.js - 退出小组，用户ID:', userId, '小组ID:', this.data.groupId)
            
            try {
              const result = await request('group_members', {
                method: 'DELETE',
                query: `group_id=eq.${this.data.groupId}&user_id=eq.${userId}`
              })
              
              console.log('退出小组请求结果:', result)
              
              // Supabase DELETE 请求成功时通常返回空数组
              // 即使 result 为空数组，也说明操作成功
              wx.hideLoading()
              wx.showToast({ title: '已退出小组', icon: 'success' })
              setTimeout(() => {
                wx.navigateBack()
              }, 1500)
            } catch (deleteError) {
              console.error('DELETE 请求失败:', deleteError)
              throw new Error('退出小组失败')
            }
            
          } catch (error) {
            console.error('退出小组失败:', error)
            wx.hideLoading()
            wx.showToast({ title: '退出失败，请重试', icon: 'none' })
          }
        }
      }
    })
  },

  // 解散小组（仅组长）
  async disbandGroup() {
    // 添加触感反馈
    wx.vibrateShort({ type: 'medium' })
    
    wx.showModal({
      title: '解散小组',
      content: '确定要解散这个小组吗？此操作不可撤销！',
      confirmText: '确定解散',
      cancelText: '取消',
      confirmColor: '#ff4757',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '解散中...' })
            
            // 获取真实的用户ID
            const userId = app.globalData?.user?.id || wx.getStorageSync('userId') || app.globalData?.supabase?.userId
            
            // 确保用户ID存在
            if (!userId) {
              wx.hideLoading()
              wx.showToast({ title: '用户信息异常', icon: 'none' })
              return
            }
            
            console.log('detail.js - 解散小组，用户ID:', userId, '小组ID:', this.data.groupId)
            
            try {
              const result = await request('study_groups', {
                method: 'DELETE',
                query: `id=eq.${this.data.groupId}&created_by=eq.${userId}`
              })
              
              console.log('解散小组请求结果:', result)
              
              wx.hideLoading()
              wx.showToast({ title: '小组已解散', icon: 'success' })
              setTimeout(() => {
                wx.navigateBack()
              }, 1500)
            } catch (deleteError) {
              console.error('解散小组 DELETE 请求失败:', deleteError)
              throw new Error('解散小组失败')
            }
            
          } catch (error) {
            console.error('解散小组失败:', error)
            wx.hideLoading()
            wx.showToast({ title: '解散失败，请重试', icon: 'none' })
          }
        }
      }
    })
  }
})
