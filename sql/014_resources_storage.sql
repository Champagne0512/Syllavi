-- 014_resources_storage.sql
-- 配置资源存储桶（resources）及其 RLS 策略

-- 当前错误："Bucket not found"，表示名为 "resources" 的存储桶不存在
-- 需要在 Supabase Dashboard 中手动创建

-- 步骤：
-- 1. 登录 Supabase Dashboard: https://nqixahasfhwofusuwsal.supabase.co
-- 2. 点击左侧菜单的 "Storage"
-- 3. 点击 "New bucket" 按钮
-- 4. 输入桶名称：resources
-- 5. 确保勾选 "Public" 选项（这很重要！）
-- 6. 文件大小限制：50MB（可根据需要调整）
-- 7. 点击 "Create" 完成创建

-- 验证存储桶是否创建成功
SELECT 
    id, 
    name, 
    public, 
    file_size_limit,
    allowed_mime_types
FROM storage.buckets 
WHERE id = 'resources';

-- 以下SQL语句可能在Dashboard中无法执行，但提供了完整的RLS策略配置参考
-- 在创建存储桶后，可以执行这些策略或直接在Dashboard中配置

-- 允许认证用户上传文件到自己的文件夹
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT 
WITH CHECK (
  bucket_id = 'resources' AND 
  auth.role() = 'authenticated'
);

-- 允许用户读取自己的文件
CREATE POLICY "Allow users to read own files"
ON storage.objects FOR SELECT 
USING (
  bucket_id = 'resources' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- 允许用户更新自己的文件
CREATE POLICY "Allow users to update own files"
ON storage.objects FOR UPDATE 
USING (
  bucket_id = 'resources' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- 允许用户删除自己的文件
CREATE POLICY "Allow users to delete own files"
ON storage.objects FOR DELETE 
USING (
  bucket_id = 'resources' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);