# 小组长身份问题故障排除

## 问题描述
创建学习小组成功后，用户没有被自动设置为组长身份。

## 🚀 立即检查步骤

### 1. 查看控制台日志
在微信开发者工具中查看网络请求和控制台输出：
- 小组创建请求是否成功
- 成员添加请求是否成功
- 是否有任何错误信息

### 2. 数据库直接查询
在 Supabase 控制台的 SQL Editor 中执行：
```sql
-- 查询最新创建的小组和成员
SELECT 
    sg.name as 小组名称,
    sg.group_code as 小组码,
    sg.created_by as 创建者,
    gm.user_id as 用户ID,
    gm.role as 角色,
    gm.joined_at as 加入时间
FROM study_groups sg
LEFT JOIN group_members gm ON sg.id = gm.group_id
WHERE sg.created_at >= NOW() - INTERVAL '1 hour'
ORDER BY sg.created_at DESC, gm.joined_at DESC;
```

### 3. 检查成员状态
```sql
-- 检查demo-user的成员身份
SELECT 
    sg.name as 小组名称,
    sg.group_code as 小组码,
    gm.role as 角色,
    gm.joined_at as 加入时间
FROM study_groups sg
JOIN group_members gm ON sg.id = gm.group_id
WHERE gm.user_id = 'demo-user'
ORDER BY gm.joined_at DESC;
```

## 🔧 常见问题和解决方案

### 问题1：用户ID不一致
**症状：** 创建者和成员使用不同的用户ID
**检查：** 查看创建的 `study_groups.created_by` 和 `group_members.user_id` 是否一致

**解决方案：**
- 统一使用 `'demo-user'` 作为开发环境用户ID
- 或者确保获取用户ID的逻辑一致

### 问题2：成员插入失败
**症状：** 小组创建成功但成员插入失败
**检查：** 查看是否有 `UNIQUE` 约束冲突错误

**解决方案：**
- 检查 `UNIQUE(group_id, user_id)` 约束
- 确保不会重复插入同一用户到同一小组

### 问题3：权限问题
**症状：** 插入成员时权限被拒绝
**检查：** RLS策略是否阻止了插入操作

**解决方案：**
- 临时禁用RLS（开发版已禁用）
- 或者添加适当的RLS策略

### 问题4：数据类型不匹配
**症状：** 字段类型不匹配导致插入失败
**检查：** UUID 和 TEXT 类型是否匹配

**解决方案：**
- 确保所有ID字段使用相同类型
- 检查开发版数据库表结构

## 🛠️ 手动修复步骤

如果发现数据不一致，可以手动修复：

### 1. 补充缺失的组长记录
```sql
-- 为没有组长的小组添加组长记录
INSERT INTO group_members (group_id, user_id, role, joined_at)
SELECT 
    id as group_id,
    created_by as user_id,
    'leader' as role,
    created_at as joined_at
FROM study_groups
WHERE created_by = 'demo-user'
AND NOT EXISTS (
    SELECT 1 FROM group_members 
    WHERE group_id = study_groups.id 
    AND user_id = 'demo-user'
);
```

### 2. 修复角色错误
```sql
-- 修复用户角色，确保创建者是组长
UPDATE group_members 
SET role = 'leader'
WHERE user_id = 'demo-user'
AND group_id IN (
    SELECT id FROM study_groups 
    WHERE created_by = 'demo-user'
)
AND role != 'leader';
```

## 🧪 测试验证

### 测试步骤
1. 清除浏览器缓存和应用数据
2. 创建新的学习小组
3. 查看小组详情页
4. 检查是否显示"组长"身份
5. 尝试只有组长能执行的操作

### 预期结果
- ✅ 创建小组后自动成为组长
- ✅ 小组详情页显示"组长"身份
- ✅ 可以执行解散小组等管理员操作

## 📝 调试工具

### 1. 使用调试脚本
```bash
# 如果配置了环境变量
node scripts/debug_group_creation.js
```

### 2. 数据库调试查询
```sql
-- 执行完整的调试查询
\i sql/012_debug_membership.sql
```

### 3. 前端调试
在 `create.js` 中查看控制台输出：
- 创建小组的响应数据
- 添加成员的响应数据
- 任何错误信息

## 🚨 如果问题仍然存在

### 收集以下信息
1. 控制台错误截图
2. 网络请求的详细信息
3. 数据库查询结果
4. 用户ID的值

### 联系排查
提供以上信息后，可以进一步分析：
- 代码逻辑问题
- 数据库结构问题
- 权限配置问题
- 网络请求问题

---

**建议按顺序执行：检查 → 调试 → 修复 → 验证**