import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 直接使用项目配置，避免环境变量问题
const SUPABASE_URL = 'https://nqixahasfhwofusuwsal.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xaXhhaGFzZmh3b2Z1c3V3c2FsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzY2MTUyNywiZXhwIjoyMDc5MjM3NTI3fQ.uNUTizbVayqD9Q4GQYwHjtPCrJfKDy6CTvsNaWIhCJs';

console.log('Supabase客户端配置已加载');

export function getServiceClient() {
  console.log('创建Supabase服务客户端...');
  
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export function getSupabaseUrl() {
  return SUPABASE_URL;
}

export function getServiceRoleKey() {
  return SERVICE_ROLE_KEY;
}
