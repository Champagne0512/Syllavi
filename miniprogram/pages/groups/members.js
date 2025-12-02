// pages/groups/members.js
const app = getApp()

Page({
  data: {
    groupId: '',
    members: [],
    invitations: [],
    loading: true,
    userRole: '',
    currentTab: 'members'
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ groupId: options.id })
      this.loadData()
    }
  },

  async loadData() {
    try {
      this.setData({ loading: true })
      await Promise.all([
        this.loadMembers(),
        this.loadInvitations(),
        this.loadUserRole()
      ])
      this.setData({ loading: false })
    } catch (error) {
      console.error('加载数据失败:', error)
      this.setData({ loading: false })
    }
  },

  async loadMembers() {
    try {
      // 使用一致的API调用方式，获取成员信息
      const members = await app.supabase
        .from('group_members')
        .select(`
          id,
          role,
          joined_at,
          user_id,
          profiles:nickname,
          profiles:avatar_url,
          profiles:id
        `)
        .eq('group_id', this.data.groupId)
        .order('joined_at', { ascending: true })

      console.log('members.js - 成员列表查询结果:', members)
      
      // 确保显示真实的成员数据，而不是测试数据
      const formattedMembers = (members || []).map(member => ({
        id: member.id,
        user_id: member.user_id || member.profiles?.id,
        role: member.role,
        joined_at: member.joined_at,
        nickname: member.profiles?.nickname || `用户${member.user_id?.slice(-6) || ''}`,
        avatar_url: member.profiles?.avatar_url || '/assets/images/default-avatar.png'
      }))

      this.setData({ members: formattedMembers })
    } catch (error) {
      console.error('加载成员列表失败:', error)
      this.setData({ members: [] })
    }
  },

  async loadInvitations() {
    const { data: invitations } = await app.supabase
      .from('group_invitations')
      .select(`
        id,
        invited_user_id,
        status,
        created_at,
        profiles:nickname,
        profiles:avatar_url
      `)
      .eq('group_id', this.data.groupId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    this.setData({ invitations: invitations || [] })
  },

  async loadUserRole() {
    const { data: member } = await app.supabase
      .from('group_members')
      .select('role')
      .eq('group_id', this.data.groupId)
      .eq('user_id', app.globalData.user.id)
      .single()

    if (member) {
      this.setData({ userRole: member.role })
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
  },

  // 设置副组长
  async setDeputyLeader(e) {
    const memberId = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '设置副组长',
      content: '确定要设置该成员为副组长吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '设置中...' })
            
            const { error } = await app.supabase
              .from('group_members')
              .update({ role: 'deputy_leader' })
              .eq('id', memberId)
              .eq('group_id', this.data.groupId)

            wx.hideLoading()
            
            if (error) {
              throw error
            }
            
            wx.showToast({ title: '设置成功', icon: 'success' })
            this.loadMembers()
            
          } catch (error) {
            console.error('设置副组长失败:', error)
            wx.showToast({ title: '设置失败', icon: 'none' })
          }
        }
      }
    })
  },

  // 移除副组长
  async removeDeputyLeader(e) {
    const memberId = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '移除副组长',
      content: '确定要移除该成员的副组长权限吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '移除中...' })
            
            const { error } = await app.supabase
              .from('group_members')
              .update({ role: 'member' })
              .eq('id', memberId)
              .eq('group_id', this.data.groupId)

            wx.hideLoading()
            
            if (error) {
              throw error
            }
            
            wx.showToast({ title: '移除成功', icon: 'success' })
            this.loadMembers()
            
          } catch (error) {
            console.error('移除副组长失败:', error)
            wx.showToast({ title: '移除失败', icon: 'none' })
          }
        }
      }
    })
  },

  // 请出成员
  async removeMember(e) {
    const memberId = e.currentTarget.dataset.id
    const memberName = e.currentTarget.dataset.name
    
    wx.showModal({
      title: '请出成员',
      content: `确定要请出成员"${memberName}"吗？`,
      confirmColor: '#ff4757',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '请出中...' })
            
            const { error } = await app.supabase
              .from('group_members')
              .delete()
              .eq('id', memberId)
              .eq('group_id', this.data.groupId)

            wx.hideLoading()
            
            if (error) {
              throw error
            }
            
            wx.showToast({ title: '请出成功', icon: 'success' })
            this.loadMembers()
            
          } catch (error) {
            console.error('请出成员失败:', error)
            wx.showToast({ title: '请出失败', icon: 'none' })
          }
        }
      }
    })
  },

  // 处理加入申请
  async handleInvitation(e) {
    const invitationId = e.currentTarget.dataset.id
    const action = e.currentTarget.dataset.action
    
    try {
      wx.showLoading({ title: '处理中...' })
      
      if (action === 'accept') {
        // 获取邀请信息
        const { data: invitation } = await app.supabase
          .from('group_invitations')
          .select('*')
          .eq('id', invitationId)
          .single()

        if (invitation) {
          // 添加成员
          await app.supabase
            .from('group_members')
            .insert({
              group_id: this.data.groupId,
              user_id: invitation.invited_user_id,
              role: 'member'
            })
        }
      }

      // 更新邀请状态
      const status = action === 'accept' ? 'accepted' : 'rejected'
      const { error } = await app.supabase
        .from('group_invitations')
        .update({ status })
        .eq('id', invitationId)

      wx.hideLoading()
      
      if (error) {
        throw error
      }
      
      wx.showToast({ 
        title: action === 'accept' ? '已同意加入' : '已拒绝加入', 
        icon: 'success' 
      })
      
      this.loadInvitations()
      if (action === 'accept') {
        this.loadMembers()
      }
      
    } catch (error) {
      console.error('处理申请失败:', error)
      wx.hideLoading()
      wx.showToast({ title: '处理失败', icon: 'none' })
    }
  }
})