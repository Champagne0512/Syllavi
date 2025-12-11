# 小组任务功能测试步骤

## 快速测试步骤

### 1. 准备工作
- 确保已登录小程序
- 确保已加入或创建一个学习小组
- 确保有至少两个成员在小组中（包括自己）

### 2. 测试创建小组任务
1. 进入小组页面
2. 点击"任务"选项卡
3. 点击"创建任务"按钮
4. 填写任务信息：
   - 标题：`测试任务 - [当前日期]`
   - 描述：`这是一个测试任务，用于验证小组任务功能是否正常`
   - 设置截止日期为未来3天
5. 点击"创建"按钮

### 3. 检查创建结果
1. 检查任务是否出现在小组任务列表中
2. 在小程序开发者工具的控制台中查看日志：
   ```javascript
   // 在控制台中运行以下代码，查看小组任务分配情况
   const { debugUserGroupTasks } = require('./debug_group_tasks')
   const { getStoredUserId } = require('./miniprogram/utils/supabase')
   const userId = getStoredUserId({ allowDemo: false })
   debugUserGroupTasks(userId)
   ```

### 4. 检查任务是否出现在待办事项
1. 切换到"待办"页面
2. 检查是否能看到刚创建的小组任务
3. 任务应该标记为"小组任务"或显示小组名称

### 5. 使用小组成员账号测试
1. 切换到小组成员账号（或请小组成员登录）
2. 检查待办事项中是否能看到被分配的小组任务
3. 尝试标记任务为完成，检查是否能正常更新

## 调试命令

在微信开发者工具控制台中，可以运行以下命令进行调试：

```javascript
// 1. 检查用户ID
const { debugUserId } = require('./debug_group_tasks')
debugUserId()

// 2. 检查用户加入的小组
const { debugUserGroups } = require('./debug_group_tasks')
const { getStoredUserId } = require('./miniprogram/utils/supabase')
const userId = getStoredUserId({ allowDemo: false })
debugUserGroups(userId)

// 3. 检查小组任务
const { debugGroupTasks } = require('./debug_group_tasks')
debugGroupTasks('小组ID')

// 4. 检查用户的小组任务
const { debugUserGroupTasks } = require('./debug_group_tasks')
debugUserGroupTasks(userId)

// 5. 运行完整调试
const { runFullDebug } = require('./debug_group_tasks')
runFullDebug()
```

## 常见问题排查

### 问题1：任务创建成功但不显示在待办中
1. 检查控制台是否有错误信息
2. 运行`debugUserGroupTasks(userId)`检查任务是否正确分配
3. 检查`miniprogram/pages/tasks/index.js`中的`loadTasks`函数是否使用`fetchAllTasks`

### 问题2：任务分配失败
1. 检查小组成员列表是否正确获取
2. 检查成员的用户ID是否正确提取
3. 检查`group_task_members`表是否有正确的插入权限

### 问题3：任务显示但不显示为小组任务
1. 检查任务类型是否正确标记为`group_task`
2. 检查小组信息是否正确关联
3. 检查任务显示组件是否正确处理小组任务样式

## 预期结果

如果一切正常，你应该看到：

1. 小组任务创建成功后，任务出现在小组任务列表中
2. 任务出现在所有小组成员（包括创建者）的待办事项中
3. 待办事项中的任务应该标记为小组任务，并显示小组名称
4. 任何成员完成任务后，任务状态在所有成员视图中同步更新

## 如果测试失败

1. 检查控制台错误信息
2. 运行调试脚本获取更详细信息
3. 检查数据库表结构是否正确
4. 检查Supabase权限设置是否正确
5. 参考`GROUP_TASKS_FIX_SUMMARY.md`文档了解更多细节

## 报告问题

如果测试仍然失败，请提供以下信息：

1. 控制台中的错误日志
2. 运行`runFullDebug()`的完整输出
3. 操作步骤和预期结果
4. 用户角色（组长/组员）和小组信息