-- Add encrypted column for API secret
ALTER TABLE public.binance_api_keys 
ADD COLUMN IF NOT EXISTS api_secret_encrypted TEXT;

-- Add comment to explain the encryption approach
COMMENT ON COLUMN public.binance_api_keys.api_secret_encrypted IS 'Encrypted API secret using application-level AES-256-GCM encryption. Decryption happens in edge functions only.';