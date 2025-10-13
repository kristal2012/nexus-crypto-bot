-- Enable pgcrypto extension for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create table for storing Binance API keys per user
CREATE TABLE public.binance_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  api_secret TEXT NOT NULL, -- Will be encrypted
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.binance_api_keys ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own API keys
CREATE POLICY "Users can view their own API keys"
ON public.binance_api_keys
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own API keys
CREATE POLICY "Users can insert their own API keys"
ON public.binance_api_keys
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own API keys
CREATE POLICY "Users can update their own API keys"
ON public.binance_api_keys
FOR UPDATE
USING (auth.uid() = user_id);

-- Policy: Users can delete their own API keys
CREATE POLICY "Users can delete their own API keys"
ON public.binance_api_keys
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_binance_api_keys_updated_at
BEFORE UPDATE ON public.binance_api_keys
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();