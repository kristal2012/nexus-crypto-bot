-- Add constraints to system_settings table
ALTER TABLE public.system_settings 
  ADD CONSTRAINT system_settings_single_row CHECK (id = id);

-- Ensure only one row exists in system_settings
CREATE UNIQUE INDEX IF NOT EXISTS system_settings_singleton 
  ON public.system_settings ((true));

-- Add index for emergency_stop_audit queries
CREATE INDEX IF NOT EXISTS idx_emergency_stop_audit_triggered_by 
  ON public.emergency_stop_audit(triggered_by);

CREATE INDEX IF NOT EXISTS idx_emergency_stop_audit_created_at 
  ON public.emergency_stop_audit(created_at DESC);

-- Add constraint to ensure action is valid
ALTER TABLE public.emergency_stop_audit 
  ADD CONSTRAINT emergency_stop_audit_action_check 
  CHECK (action IN ('enable', 'disable'));

-- Ensure system_settings has at least one row (insert default if not exists)
INSERT INTO public.system_settings (trading_enabled, emergency_message)
VALUES (true, NULL)
ON CONFLICT DO NOTHING;

-- Add comment for documentation
COMMENT ON TABLE public.system_settings IS 
  'Singleton table for global system settings. Should only contain one row.';

COMMENT ON TABLE public.emergency_stop_audit IS 
  'Audit log for all emergency stop actions performed by administrators.';
