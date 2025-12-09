// pages/groups/create.js
const app = getApp()
const { request, uploadToStorage, getStoredUserId } = require('../../utils/supabase')

Page({
  data: {
    form: {
      name: '',
      description: '',
      maxMembers: 20,
      isPublic: true,
      avatarUrl: ''
    },
    memberOptions: [
      { label: '5 人', value: 5 },
      { label: '10 人', value: 10 },
      { label: '15 人', value: 15 },
      { label: '20 人', value: 20 },
      { label: '30 人', value: 30 },
      { label: '50 人', value: 50 }
    ],
    selectedMemberIndex: 3,
    canSubmit: false,
    submitting: false,
    uploadingAvatar: false
  },

  // 生成唯一ID (UUID格式，匹配数据库表结构)
  generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  },

  onLoad() {
    this.updateCanSubmit()
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  },

  // 输入框变化
  onInputChange(e) {
    const field = e.currentTarget.dataset.field
    this.setData({
      [`form.${field}`]: e.detail.value
    }, () => this.updateCanSubmit())
  },



  // 选择人数
  onMaxMembersChange(e) {
    const index = Number(e.detail.value) || 0
    const option = this.data.memberOptions[index] || this.data.memberOptions[0]
    this.setData({
      selectedMemberIndex: index,
      'form.maxMembers': option.value
    })
  },

  togglePublic(e) {
    this.setData({
      'form.isPublic': !!e.detail.value
    })
  },

  async chooseAvatar() {
    if (this.data.uploadingAvatar) return
    try {
      const { tempFilePaths } = await wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      })
      if (!tempFilePaths || !tempFilePaths.length) return

      const tempFilePath = tempFilePaths[0]
      const ext = tempFilePath.split('.').pop().toLowerCase()
      const fileName = `group-avatar.${ext}`

      this.setData({ uploadingAvatar: true })
      wx.showLoading({ title: '上传中...' })

      const { publicUrl } = await uploadToStorage('group-avatars', tempFilePath, fileName, {
        contentType: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
      })

      this.setData({
        'form.avatarUrl': publicUrl
      })
      wx.showToast({ title: '上传成功', icon: 'success' })
    } catch (error) {
      console.error('上传小组头像失败:', error)
      wx.showToast({ title: '上传失败，请重试', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ uploadingAvatar: false })
    }
  },

  // 提交表单
  async onSubmit() {
    if (!this.validateForm()) {
      return
    }

    try {
      this.setData({ submitting: true })
      
      // 生成随机小组码（6位字母数字组合）
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      let groupCode = ''
      for (let i = 0; i < 6; i++) {
        groupCode += chars.charAt(Math.floor(Math.random() * chars.length))
      }

      // 获取真实的用户ID
      const userId = getStoredUserId({ allowDemo: false })
      
      // 确保用户ID存在
      if (!userId) {
        wx.showToast({ title: '请先登录', icon: 'none' })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
        this.setData({ submitting: false })
        return
      }
      
      console.log('create.js - 创建小组，用户ID:', userId)
      console.log('create.js - 小组信息:', {
        name: this.data.form.name.trim(),
        description: this.data.form.description.trim(),
        group_code: groupCode,
        max_members: this.data.form.maxMembers,
        created_by: userId
      })
      

      
      // 创建小组 - Supabase REST API 要求插入数据必须是数组格式
      const group = await request('study_groups', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        data: [{
          name: this.data.form.name.trim(),
          description: this.data.form.description.trim(),
          group_code: groupCode,
          max_members: this.data.form.maxMembers,
          is_public: this.data.form.isPublic,
          avatar_url: this.data.form.avatarUrl || null,
          created_by: userId
        }]
      })

      if (!group || !group.length) {
        throw new Error('创建小组失败')
      }

      console.log('create.js - 小组创建成功:', group[0])
      const createdGroupId = group[0].id

      // 自动加入为组长
      console.log('create.js - 自动将创建者设为组长，用户ID:', userId)
      const memberResult = await request('group_members', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        data: [{
          group_id: createdGroupId,
          user_id: userId,
          role: 'leader'
        }]
      })

      console.log('create.js - 成员添加结果:', memberResult)
      if (!memberResult || !memberResult.length) {
        console.error('自动加入小组失败，但小组已创建')
        // 不阻断流程，小组已创建成功
      }

      wx.showToast({
        title: '创建成功',
        icon: 'success',
        duration: 2000
      })

      // 返回并刷新列表
      setTimeout(() => {
        wx.navigateBack()
        const pages = getCurrentPages()
        const prevPage = pages[pages.length - 2]
        if (prevPage && prevPage.route === 'pages/groups/index') {
          prevPage.loadGroups()
        }
      }, 1500)

    } catch (error) {
      // 打印完整错误信息（重点！）
      console.error('Supabase 错误详情:', error)
      
      // 提取错误信息
      let errorMessage = '创建失败'
      let statusCode = error.statusCode
      let errorDetails = error.data || error
      
      // 如果是400错误，尝试从响应数据中提取详细信息
      if (statusCode === 400) {
        errorMessage = '数据格式错误，请检查必填字段'
        
        // 尝试从Supabase响应中获取详细信息
        if (errorDetails && errorDetails.message) {
          console.error('Supabase详细错误:', errorDetails.message)
          errorMessage = errorDetails.message
        } else if (errorDetails && typeof errorDetails === 'string') {
          console.error('错误详情:', errorDetails)
        }
      } else if (statusCode === 403) {
        errorMessage = '权限不足，请联系管理员'
      }
      
      wx.showToast({
        title: errorMessage,
        icon: 'none'
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // 表单验证
  validateForm() {
    const { name, description } = this.data.form

    if (!name.trim()) {
      wx.showToast({
        title: '请输入小组名称',
        icon: 'none'
      })
      return false
    }

    if (name.trim().length > 50) {
      wx.showToast({
        title: '小组名称不能超过50字',
        icon: 'none'
      })
      return false
    }

    if (description.trim().length > 200) {
      wx.showToast({
        title: '小组描述不能超过200字',
        icon: 'none'
      })
      return false
    }

    return true
  },

  updateCanSubmit() {
    const { name, description } = this.data.form
    const validName = !!name.trim() && name.trim().length <= 50
    const validDesc = description.trim().length <= 200
    this.setData({ canSubmit: validName && validDesc })
  }
})
