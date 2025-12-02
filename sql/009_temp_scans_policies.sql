-- 009_temp_scans_policies.sql
-- 配置 temp_scans 存储桶的 RLS 策略，允许上传扫描图片

-- 1) 确保 storage.objects 已启用 RLS
ALTER TABLE IF EXISTS storage.objects ENABLE ROW LEVEL SECURITY;

-- 2) 清理旧策略，保持脚本幂等
DROP POLICY IF EXISTS "Anyone can upload temp scans" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view temp scans" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update temp scans" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete temp scans" ON storage.objects;

-- 3) 创建宽松的策略，允许任何人上传和访问 temp_scans
CREATE POLICY "Anyone can upload temp scans" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'temp_scans');

CREATE POLICY "Anyone can view temp scans" ON storage.objects
  FOR SELECT USING (bucket_id = 'temp_scans');

CREATE POLICY "Anyone can update temp scans" ON storage.objects
  FOR UPDATE USING (bucket_id = 'temp_scans');

CREATE POLICY "Anyone can delete temp scans" ON storage.objects
  FOR DELETE USING (bucket_id = 'temp_scans');

-- 4) 验证策略是否正确创建
SELECT policyname, cmd, roles, permissive, qual 
FROM pg_policies 
WHERE tablename = 'objects' 
  AND schemaname = 'storage' 
  AND policyname LIKE '%temp_scans%';