-- 009_public_bucket.sql
-- 尝试公开访问存储桶（如果可能）

-- 检查存储桶是否可以公开访问
SELECT 
  id, 
  name, 
  public, 
  file_size_limit, 
  allowed_mime_types
FROM storage.buckets 
WHERE name = 'avatars';

-- 如果上述失败，说明无权限操作存储桶
-- 请在 Dashboard 中手动设置：
-- 1. Storage → Buckets → avatars → Settings
-- 2. 勾选 "Public bucket"
-- 3. 保存

-- 手动创建策略的参考配置：
-- Policy Name: "Public avatars access"
-- Allowed Operation: SELECT, INSERT, UPDATE, DELETE
-- Target Roles: anon, authenticated
-- Policy Definition: bucket_id = 'avatars'