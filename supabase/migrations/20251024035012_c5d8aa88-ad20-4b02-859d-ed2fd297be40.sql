-- Create admin role system
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Users can view their own roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create system_settings table for emergency stop
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trading_enabled BOOLEAN NOT NULL DEFAULT true,
  emergency_message TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read system settings
CREATE POLICY "Everyone can read system settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (true);

-- Only admins can update system settings
CREATE POLICY "Only admins can update system settings"
ON public.system_settings
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can insert system settings
CREATE POLICY "Only admins can insert system settings"
ON public.system_settings
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert initial system settings
INSERT INTO public.system_settings (trading_enabled, emergency_message)
VALUES (true, NULL);

-- Add salt column to binance_api_keys for per-user encryption
ALTER TABLE public.binance_api_keys
ADD COLUMN encryption_salt TEXT;

-- Create emergency stop audit log
CREATE TABLE public.emergency_stop_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  trading_enabled BOOLEAN NOT NULL,
  emergency_message TEXT,
  triggered_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on emergency_stop_audit
ALTER TABLE public.emergency_stop_audit ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Only admins can view emergency stop audit"
ON public.emergency_stop_audit
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can insert audit logs
CREATE POLICY "Only admins can insert emergency stop audit"
ON public.emergency_stop_audit
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));