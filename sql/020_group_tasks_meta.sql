-- 020_group_tasks_meta.sql
-- 扩展 group_tasks 表以保存任务元数据

ALTER TABLE public.group_tasks
  ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;
