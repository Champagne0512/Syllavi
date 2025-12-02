// 测试创建小组功能
const app = getApp()
const { request } = require('../../utils/supabase')

Page({
  data: {
    testResult: ''
  },

  onLoad() {
    this.testCreateGroup()
  },

  // 测试创建小组
  async testCreateGroup() {
    try {
      console.log('开始测试创建小组...')
      
      // 生成随机小组码
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      let groupCode = ''
      for (let i = 0; i < 6; i++) {
        groupCode += chars.charAt(Math.floor(Math.random() * chars.length))
      }

      const userId = 'demo-user'
      const groupId = 'sg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
      
      // 准备测试数据
      const testData = [{
        _id: groupId,
        name: '测试小组',
        description: '这是一个测试小组',
        groupCode: groupCode,
        maxMembers: 20,
        memberCount: 1,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }]

      console.log('准备发送的数据:', JSON.stringify(testData, null, 2))

      // 测试创建小组
      const result = await request('study_groups', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        data: testData
      })

      console.log('创建成功:', result)
      this.setData({
        testResult: '创建成功: ' + JSON.stringify(result, null, 2)
      })

    } catch (error) {
      console.error('测试失败:', error)
      
      let errorMessage = '测试失败: '
      if (error.statusCode === 400) {
        errorMessage += '400错误 - '
        if (error.data && error.data.message) {
          errorMessage += error.data.message
        } else {
          errorMessage += JSON.stringify(error.data || error)
        }
      } else {
        errorMessage += JSON.stringify(error)
      }

      this.setData({
        testResult: errorMessage
      })
    }
  }
})