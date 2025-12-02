// utils/groupTasks.js

// 获取用户的个人待办事项（包括小组任务）
function getUserTodos(userId) {
  return new Promise((resolve, reject) => {
    const db = wx.cloud.database()
    
    // 查询个人待办事项，包括小组任务
    db.collection('todos')
      .where({
        userId: userId
      })
      .orderBy('deadline', 'asc')
      .get({
        success: (res) => {
          resolve(res.data)
        },
        fail: (err) => {
          reject(err)
        }
      })
  })
}

// 获取小组任务详情
function getGroupTaskDetails(todos) {
  return new Promise((resolve, reject) => {
    const groupTasks = todos.filter(todo => todo.type === 'group_task')
    
    if (groupTasks.length === 0) {
      resolve(todos)
      return
    }
    
    // 获取小组信息
    const db = wx.cloud.database()
    const groupIds = [...new Set(groupTasks.map(task => task.groupInfo.groupId))]
    
    db.collection('study_groups')
      .where({
        _id: db.command.in(groupIds)
      })
      .get({
        success: (res) => {
          const groupsMap = {}
          res.data.forEach(group => {
            groupsMap[group._id] = group
          })
          
          // 为小组任务添加小组信息
          const enhancedTodos = todos.map(todo => {
            if (todo.type === 'group_task' && todo.groupInfo) {
              const groupInfo = groupsMap[todo.groupInfo.groupId]
              if (groupInfo) {
                return {
                  ...todo,
                  groupDetails: {
                    groupName: groupInfo.name,
                    groupAvatar: groupInfo.avatar,
                    createdBy: todo.groupInfo.createdBy
                  }
                }
              }
            }
            return todo
          })
          
          resolve(enhancedTodos)
        },
        fail: (err) => {
          reject(err)
        }
      })
  })
}

// 完成任务
function completeTodo(todoId, userId) {
  return new Promise((resolve, reject) => {
    const db = wx.cloud.database()
    
    db.collection('todos').doc(todoId).update({
      data: {
        status: 'completed',
        completedAt: db.serverDate(),
        updatedAt: db.serverDate()
      },
      success: (res) => {
        resolve(res)
        
        // 如果是小组任务，还需要更新小组任务状态
        const todo = db.collection('todos').doc(todoId).get()
        todo.then((todoRes) => {
          const task = todoRes.data
          if (task.type === 'group_task' && task.groupInfo) {
            // 更新小组任务完成状态
            db.collection('group_tasks').doc(task.groupInfo.taskId).update({
              data: {
                completedBy: db.command.push({
                  userId: userId,
                  completedAt: db.serverDate()
                }),
                updatedAt: db.serverDate()
              }
            })
          }
        })
      },
      fail: (err) => {
        reject(err)
      }
    })
  })
}

// 删除待办事项
function deleteTodo(todoId) {
  return new Promise((resolve, reject) => {
    const db = wx.cloud.database()
    
    db.collection('todos').doc(todoId).remove({
      success: (res) => {
        resolve(res)
      },
      fail: (err) => {
        reject(err)
      }
    })
  })
}

// 创建新的待办事项
function createTodo(todoData) {
  return new Promise((resolve, reject) => {
    const db = wx.cloud.database()
    
    db.collection('todos').add({
      data: {
        ...todoData,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      },
      success: (res) => {
        resolve(res)
      },
      fail: (err) => {
        reject(err)
      }
    })
  })
}

module.exports = {
  getUserTodos,
  getGroupTaskDetails,
  completeTodo,
  deleteTodo,
  createTodo
}