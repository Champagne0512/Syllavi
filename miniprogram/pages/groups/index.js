// pages/groups/index.js
const app = getApp()
const { request, SUPABASE_URL, SUPABASE_ANON_KEY } = require('../../utils/supabase')

Page({
  data: {
    userGroups: [],
    publicGroups: [],
    loading: true,
    hasMore: false,
    currentTab: 'myGroups'
  },

  onLoad() {
    this.loadGroups()
  },

  onShow() {
    const app = getApp();
    app.syncTabBar(); // 使用全局同步方法
  },

  onPullDownRefresh() {
    this.loadGroups().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadGroups() {
    try {
      this.setData({ loading: true })
      
      // 获取用户ID - 与创建小组时保持一致
      const userId = app.globalData?.user?.id || wx.getStorageSync('userId') || app.globalData?.supabase?.userId || 'demo-user'
      
      console.log('index.js - 使用用户ID:', userId)
      
      console.log('index.js - 使用用户ID:', userId)
      
      // 获取用户加入的小组（通过group_members表查询）
      const userGroupsQuery = [
        `user_id=eq.${userId}`,
        'select=group_id,user_id,role,joined_at',
        'order=joined_at.desc'
      ].join('&')
      
      let userGroups = []
      try {
        const membershipData = await request('group_members', { query: userGroupsQuery })
        console.log('用户成员关系查询结果:', membershipData)
        
        // 获取小组详细信息
        if (membershipData && membershipData.length > 0) {
          const groupIds = membershipData.map(item => item.group_id).join(',')
          const groupsQuery = `select=id,name,description,group_code,max_members,avatar_url&id=in.(${groupIds})`
          const groupsData = await request('study_groups', { query: groupsQuery })
          console.log('小组详细信息查询结果:', groupsData)
          
          // 合并数据
          userGroups = membershipData.map(member => {
            const group = groupsData.find(g => g.id === member.group_id)
            return {
              ...member,
              study_groups: group
            }
          })
        }
      } catch (err) {
        console.warn('获取用户小组失败:', err)
      }
      
      // 获取公开小组 - 不需要认证的查询
      let publicGroups = []
      try {
        // 使用匿名访问获取公开小组
        const publicGroupsQuery = [
          'select=*',
          'is_public=eq.true',
          'limit=20',
          'order=created_at.desc'
        ].join('&')
        
        // 创建匿名请求头
        const anonymousHeaders = {
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Prefer': 'return=representation'
        }
        
        publicGroups = await wx.request({
          url: `${SUPABASE_URL}/rest/v1/study_groups?${publicGroupsQuery}`,
          method: 'GET',
          header: anonymousHeaders
        }).then(res => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            return res.data;
          } else {
            console.warn('公开小组查询失败:', res);
            return [];
          }
        }).catch(err => {
          console.warn('获取公开小组失败:', err);
          return [];
        });
        
      } catch (err) {
        console.warn('获取公开小组失败:', err)
      }
      
      // 处理用户小组数据格式
      const formattedUserGroups = (userGroups || []).map(item => {
        console.log('处理小组项目:', item)
        return {
          group_id: item.group_id,
          user_id: item.user_id,
          member_role: item.role,
          joined_at: item.joined_at,
          group_name: item.study_groups?.name,
          group_description: item.study_groups?.description,
          group_code: item.study_groups?.group_code,
          member_count: item.study_groups?.max_members || 0,
          avatar_url: item.study_groups?.avatar_url
        }
      })
      
      // 处理公开小组数据格式
      const formattedPublicGroups = (publicGroups || []).map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        group_code: item.group_code,
        member_count: item.max_members || 20,
        max_members: item.max_members || 20,
        created_by: item.created_by,
        creator_info: item.creator,
        avatar_url: item.avatar_url
      }))
      
      this.setData({
        userGroups: formattedUserGroups,
        publicGroups: formattedPublicGroups,
        loading: false
      })
      
      console.log('最终数据格式化结果:', {
        userGroups: formattedUserGroups,
        publicGroups: formattedPublicGroups
      })
    } catch (error) {
      console.error('加载小组列表失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
  },

  // 创建小组
  createGroup() {
    wx.navigateTo({ url: '/pages/groups/create' })
  },

  // 加入小组
  joinGroup() {
    // 添加触感反馈
    wx.vibrateShort({ type: 'light' })
    
    wx.showModal({
      title: '加入小组',
      content: '请输入小组码',
      editable: true,
      placeholderText: '请输入6位小组码',
      success: async (res) => {
        if (res.confirm && res.content) {
          await this.handleJoinGroup(res.content.trim().toUpperCase())
        }
      }
    })
  },

  async handleJoinGroup(groupCode) {
    try {
      // 添加触感反馈
      wx.vibrateShort({ type: 'medium' })
      
      wx.showLoading({ title: '加入中...' })
      
      // 获取用户ID
      const userId = app.globalData?.user?.id || wx.getStorageSync('userId') || app.globalData?.supabase?.userId || 'demo-user'
      
      console.log('joinGroup - 使用用户ID:', userId, '小组码:', groupCode)
      
      console.log('joinGroup - 使用用户ID:', userId, '小组码:', groupCode)
      
      // 先根据小组码查找小组
      const { data: groupData } = await request('study_groups', {
        query: `group_code=eq.${groupCode}`
      })
      
      if (!groupData || groupData.length === 0) {
        wx.hideLoading()
        wx.showToast({ title: '小组码无效', icon: 'none' })
        return
      }
      
      const group = groupData[0]
      
      // 检查是否已经是成员
      const { data: existingMember } = await request('group_members', {
        query: `group_id=eq.${group.id}&user_id=eq.${userId}`
      })
      
      const isMember = existingMember && existingMember.length > 0
      
      if (isMember) {
        wx.hideLoading()
        wx.showToast({ title: '您已加入该小组', icon: 'none' })
        console.log('用户已经是成员:', existingMember[0])
        return
      }

      // 检查小组人数限制
      const { data: memberCount } = await request('group_members', {
        query: `group_id=eq.${group.id}`
      })
      
      if (memberCount.length >= group.max_members) {
        wx.hideLoading()
        wx.showToast({ title: '小组人数已满', icon: 'none' })
        return
      }

      // 直接加入小组（简化流程）
      const { data: joinResult } = await request('group_members', {
        method: 'POST',
        data: [{
          group_id: group.id,
          user_id: userId,
          role: 'member'
        }]
      })
      
      console.log('加入小组结果:', joinResult)
      
      wx.hideLoading()
      
      if (!joinResult || joinResult.length === 0) {
        wx.showToast({ title: '加入失败', icon: 'none' })
        return
      }
      
      wx.showToast({ title: '加入成功', icon: 'success' })
      this.loadGroups()
      
    } catch (error) {
      console.error('加入小组失败:', error)
      wx.hideLoading()
      wx.showToast({ title: '加入失败', icon: 'none' })
    }
  },

  // 查看小组详情
  viewGroupDetail(e) {
    // 添加触感反馈
    wx.vibrateShort({ type: 'light' })
    
    const groupId = e.currentTarget.dataset.id
    wx.navigateTo({ 
      url: `/pages/groups/detail?id=${groupId}` 
    })
  },

  // 切换标签页
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
  }
})