-- Drop the problematic constraint if it exists
ALTER TABLE public.system_settings 
DROP CONSTRAINT IF EXISTS system_settings_singleton;

-- Add a unique constraint on a fixed boolean column for singleton pattern
ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS is_singleton boolean DEFAULT true NOT NULL;

-- Create unique constraint to ensure only one row
CREATE UNIQUE INDEX IF NOT EXISTS system_settings_singleton_idx 
ON public.system_settings(is_singleton);

-- Add constraint to emergency_stop_audit for action validation
ALTER TABLE public.emergency_stop_audit 
ADD CONSTRAINT valid_action 
CHECK (action IN ('enable', 'disable'));

-- Add indexes for better query performance on emergency_stop_audit
CREATE INDEX IF NOT EXISTS idx_emergency_stop_audit_triggered_by 
ON public.emergency_stop_audit(triggered_by);

CREATE INDEX IF NOT EXISTS idx_emergency_stop_audit_created_at 
ON public.emergency_stop_audit(created_at DESC);

-- Ensure only one settings row exists (delete extras if any)
DELETE FROM public.system_settings 
WHERE id NOT IN (
  SELECT id FROM public.system_settings 
  ORDER BY created_at ASC 
  LIMIT 1
);

-- Insert default system_settings if not exists
INSERT INTO public.system_settings (trading_enabled, emergency_message, is_singleton)
SELECT true, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings);