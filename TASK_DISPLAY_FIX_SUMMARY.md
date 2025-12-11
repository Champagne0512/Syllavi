# 任务显示问题修复摘要

## 问题描述

1. **个人页面的任务管理中看不到创建任务成功后的任务总数量变化**，任务总量的数量也与实际的数量不一
2. **创建的新任务并没有自动出现在课程与待办页面中的我的待办列表中**，任务管理中的许多未完成的任务也没有自动的出现待办列表

## 问题根源

1. **个人页面任务统计不包含小组任务**：
   - `pages/profile/index.js` 中的 `loadStats` 函数使用 `fetchTasks` 而不是 `fetchAllTasks`
   - 这导致统计中只包含个人任务，不包含小组任务

2. **课程与待办页面任务显示逻辑问题**：
   - 任务创建后没有强制刷新任务缓存
   - `shouldDisplayTaskOnDate` 函数逻辑可能有问题
   - 任务保存后没有同步更新个人页面统计数据

## 修复方案

### 1. 修复个人页面任务统计

#### 文件：`miniprogram/pages/profile/index.js`

- 导入 `fetchAllTasks` 函数
- 将 `fetchTasks(userId)` 替换为 `fetchAllTasks(userId)`
- 添加更详细的调试日志，包括小组任务统计

```javascript
// 修改前
const {
  fetchTasks,
  // ...
} = supabaseApi;

// 修改后
const {
  fetchTasks,
  fetchAllTasks,
  // ...
} = supabaseApi;

// 修改前
fetchTasks(userId).catch(err => {
  // ...
}),

// 修改后
fetchAllTasks(userId).catch(err => {
  // ...
}),
```

### 2. 修复课程与待办页面任务显示

#### 文件：`miniprogram/pages/hub/index.js`

- 在 `saveTask` 函数中，保存任务后设置强制刷新标志
- 重新加载任务后强制更新视图
- 同步刷新个人页面的统计数据

```javascript
// 在 saveTask 函数中添加
this.closeTaskEditor();

// 设置强制刷新标志，确保清除任务缓存
wx.setStorageSync('force_refresh_tasks', true);

// 重新加载任务
console.log('任务保存成功，重新加载任务列表');
await this.loadTasks();

// 强制更新视图
this.updateViewData();

// 刷新个人页面的统计数据
const pages = getCurrentPages();
const profilePage = pages.find(page => page.route === 'pages/profile/index');
if (profilePage && profilePage.loadStats) {
  console.log('刷新个人页面统计数据');
  profilePage.loadStats();
}
```

- 添加更详细的调试信息到 `shouldDisplayTaskOnDate` 函数
- 改进 `calculateDayView` 函数，添加更多调试信息

### 3. 创建调试脚本

创建了两个调试脚本：

1. `debug_task_display.js` - 用于调试任务显示问题
2. `GROUP_TASKS_FIX_SUMMARY.md` - 小组任务功能修复摘要

## 测试方法

### 1. 使用调试脚本

在微信开发者工具控制台中运行：

```javascript
// 加载调试脚本
const { runCompleteTaskDebug } = require('./debug_task_display')

// 运行完整调试
runCompleteTaskDebug()
```

### 2. 手动测试步骤

1. **测试个人页面任务统计**：
   - 创建一个新任务（个人任务或小组任务）
   - 检查个人页面的任务总数是否正确更新

2. **测试课程与待办页面任务显示**：
   - 创建一个新任务
   - 检查任务是否出现在今日待办中
   - 检查任务管理中未完成的任务是否出现在待办列表中

3. **测试小组任务**：
   - 在小组中创建新任务
   - 检查任务是否出现在所有成员的待办中
   - 检查个人页面统计是否包含小组任务

## 常见问题排查

### 问题1：个人页面任务数量不正确

1. 检查控制台是否有错误信息
2. 运行 `debugProfileTaskStats()` 查看统计数据
3. 确认使用的是 `fetchAllTasks` 而不是 `fetchTasks`

### 问题2：新任务不显示在今日待办中

1. 检查任务创建后是否调用了 `loadTasks()`
2. 检查 `shouldDisplayTaskOnDate` 函数的返回值
3. 确认任务的截止日期和创建日期是否正确
4. 运行 `debugHubTasks()` 查看任务数据

### 问题3：小组任务不显示

1. 检查小组任务是否正确分配给了成员
2. 确认任务的类型是否标记为 `group_task`
3. 运行小组任务调试脚本检查任务分配情况

## 预期结果

修复后，应该看到：

1. **个人页面**：
   - 任务总数正确包含个人任务和小组任务
   - 创建新任务后统计数据立即更新

2. **课程与待办页面**：
   - 新创建的任务立即出现在今日待办中
   - 所有未完成的任务都正确显示在待办列表中
   - 小组任务正确显示并标记来源

## 报告问题

如果测试仍然失败，请提供以下信息：

1. 控制台中的错误日志
2. 运行调试脚本的完整输出
3. 操作步骤和预期结果
4. 用户是否登录，是否加入了小组

## 后续建议

1. **优化任务加载性能**：考虑使用增量更新而不是全量刷新
2. **添加离线支持**：在无网络时显示缓存的任务
3. **改进用户体验**：添加加载状态指示和错误提示
4. **统一数据源**：确保所有页面使用相同的数据获取函数