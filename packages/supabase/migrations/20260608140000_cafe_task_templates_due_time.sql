-- Optional due time for café visual task checklist items.
ALTER TABLE cafe_task_templates
  ADD COLUMN IF NOT EXISTS due_time time;
