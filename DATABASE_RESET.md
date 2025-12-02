# 数据库重置说明

## 概述
本操作将完全重置学习小组功能的数据库表，确保表结构与前端代码完全匹配。

## 重置内容
- 删除所有现有的小组相关表
- 重新创建符合代码要求的表结构
- 创建必要的索引、触发器、RLS策略
- 添加辅助函数和示例数据

## 执行步骤

### 方法一：开发环境（推荐，解决外键问题）

1. **登录 Supabase 控制台**
   - 访问 https://app.supabase.com
   - 登录你的账户

2. **进入项目**
   - 选择你的 Syllavi 项目

3. **打开 SQL 编辑器**
   - 点击左侧菜单的 "SQL Editor"
   - 点击 "New query"

4. **执行开发版 SQL 脚本**
   - 复制 `sql/011_study_groups_simple_dev.sql` 文件的全部内容
   - 粘贴到 SQL 编辑器中
   - 点击 "RUN" 执行

5. **验证执行结果**
   - 执行完成后应该看到 "NOTICE: 开发版数据库配置完成！" 的消息

### 方法二：生产环境（完整的用户认证）

**注意：此版本需要确保 profiles 表中有对应的用户数据**

1. **先检查现有用户**
   ```sql
   SELECT id, email, nickname FROM public.profiles;
   ```

2. **执行完整版 SQL**
   - 复制 `sql/010_reset_study_groups.sql` 文件的全部内容
   - 将测试用户ID替换为真实存在的用户ID
   - 粘贴到 SQL 编辑器中
   - 点击 "RUN" 执行

## 两个版本的区别

| 特性 | 开发版 (011) | 生产版 (010) |
|------|----------------|--------------|
| 外键约束 | ❌ 移除 | ✅ 完整 |
| 用户认证 | 🚧 简化 | 🔐 完整 |
| RLS策略 | ❌ 禁用 | ✅ 启用 |
| 开发便利 | ⭐️ 极佳 | ⚠️ 复杂 |
| 生产适用 | ❌ 不推荐 | ✅ 推荐 |

### 方法二：使用命令行（需要环境变量配置）

1. **配置环境变量**
   ```bash
   export SUPABASE_URL=https://your-project.supabase.co
   export SUPABASE_ANON_KEY=your-anon-key
   ```

2. **运行脚本**
   ```bash
   cd scripts
   node reset_database.js
   ```

## 重置后的表结构

### study_groups 表
- `id` (UUID, 主键，自动生成)
- `name` (TEXT, 小组名称)
- `description` (TEXT, 小组描述)
- `avatar_url` (TEXT, 小组头像URL)
- `group_code` (TEXT, 唯一小组码)
- `max_members` (SMALLINT, 最大成员数)
- `is_public` (BOOLEAN, 是否公开)
- `created_by` (UUID, 创建者ID)
- `created_at` (TIMESTAMPTZ, 创建时间)
- `updated_at` (TIMESTAMPTZ, 更新时间)

### group_members 表
- `id` (UUID, 主键，自动生成)
- `group_id` (UUID, 小组ID)
- `user_id` (UUID, 用户ID)
- `role` (TEXT, 角色：leader/deputy_leader/member)
- `joined_at` (TIMESTAMPTZ, 加入时间)

### 其他表
- `group_messages` (小组聊天消息)
- `group_tasks` (小组任务)
- `group_task_members` (任务成员关联)
- `group_invitations` (小组邀请)

## 重置后的功能

✅ 创建学习小组
✅ 加入学习小组
✅ 查看小组列表
✅ 小组聊天
✅ 小组任务管理
✅ 小组邀请系统

## 注意事项

⚠️ **数据丢失警告**
- 此操作将删除所有现有的学习小组数据
- 所有用户创建的小组、消息、任务将被永久删除
- 建议在生产环境执行前先备份数据

⚠️ **权限要求**
- 需要项目的管理员权限
- 确保有执行 DDL 语句的权限

⚠️ **测试建议**
- 重置后先测试创建小组功能
- 再测试加入小组功能
- 最后测试其他功能模块

## 故障排除

### 执行失败
- 检查 SQL 语法是否正确
- 确认有足够的权限
- 查看控制台错误信息

### 功能异常
- 验证表结构是否正确创建
- 检查 RLS 策略是否生效
- 确认索引和触发器正常工作

### 联系支持
如果遇到问题，请检查：
1. Supabase 项目配置
2. 环境变量设置
3. 前端代码与表结构匹配

---
**重置完成后，前端代码应该能够正常工作，不再出现字段不匹配的错误。**