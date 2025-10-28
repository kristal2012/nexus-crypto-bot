/**
 * Binance Credentials Service
 * 
 * Centralizes credential validation and decryption logic following SRP.
 * Provides health checks and detailed error reporting.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret, decryptSecretLegacy } from "./encryption.ts";

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface CredentialValidationResult {
  isValid: boolean;
  error?: string;
  errorCode?: 'MISSING_CREDENTIALS' | 'DECRYPTION_FAILED' | 'INVALID_FORMAT' | 'QUERY_ERROR';
  details?: any;
}

/**
 * Validates and retrieves Binance API credentials for a user.
 * Returns normalized result with detailed error information.
 */
export async function validateAndGetCredentials(
  supabase: SupabaseClient,
  userId: string
): Promise<{ result: CredentialValidationResult; credentials?: BinanceCredentials }> {
  
  // Step 1: Query credentials from database
  const { data: apiSettings, error: queryError } = await supabase
    .from('binance_api_keys')
    .select('api_key, api_secret_encrypted, encryption_salt')
    .eq('user_id', userId)
    .maybeSingle();

  console.log('Credentials query result:', {
    hasData: !!apiSettings,
    hasApiKey: !!apiSettings?.api_key,
    hasSecret: !!apiSettings?.api_secret_encrypted,
    hasSalt: !!apiSettings?.encryption_salt,
    userId,
    queryError: queryError?.message
  });

  // Step 2: Handle query errors
  if (queryError) {
    console.error('Error querying credentials:', queryError);
    return {
      result: {
        isValid: false,
        error: 'Erro ao buscar credenciais da Binance',
        errorCode: 'QUERY_ERROR',
        details: { message: queryError.message }
      }
    };
  }

  // Step 3: Validate credentials exist
  const hasCredentials = apiSettings?.api_key && apiSettings?.api_secret_encrypted;
  
  if (!hasCredentials) {
    console.log('Credentials not configured - missing API key or secret');
    return {
      result: {
        isValid: false,
        error: 'Credenciais da Binance não configuradas',
        errorCode: 'MISSING_CREDENTIALS',
        details: {
          hasApiKey: !!apiSettings?.api_key,
          hasSecret: !!apiSettings?.api_secret_encrypted
        }
      }
    };
  }

  // Step 4: Validate format
  if (!apiSettings.api_key.trim() || apiSettings.api_key.length < 10) {
    console.log('Invalid API key format');
    return {
      result: {
        isValid: false,
        error: 'Formato de API Key inválido',
        errorCode: 'INVALID_FORMAT',
        details: { field: 'api_key' }
      }
    };
  }

  // Step 5: Decrypt API secret
  let decryptedSecret: string;
  try {
    console.log('Starting decryption process...');
    
    if (apiSettings.encryption_salt) {
      console.log('Using PBKDF2 decryption with salt');
      decryptedSecret = await decryptSecret(
        apiSettings.api_secret_encrypted,
        apiSettings.encryption_salt
      );
    } else {
      console.log('Using legacy decryption (no salt)');
      decryptedSecret = await decryptSecretLegacy(apiSettings.api_secret_encrypted);
    }
    
    console.log('✅ API secret decrypted successfully');
    
    // Validate decrypted secret format
    if (!decryptedSecret || decryptedSecret.length < 10) {
      throw new Error('Decrypted secret has invalid format');
    }
    
  } catch (error) {
    console.error('❌ Failed to decrypt API secret:', error);
    console.error('Decryption error details:', {
      errorMessage: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      hasEncryptedSecret: !!apiSettings?.api_secret_encrypted,
      hasSalt: !!apiSettings?.encryption_salt,
      encryptedLength: apiSettings?.api_secret_encrypted?.length,
      saltLength: apiSettings?.encryption_salt?.length
    });
    
    return {
      result: {
        isValid: false,
        error: 'Erro ao descriptografar credenciais da Binance',
        errorCode: 'DECRYPTION_FAILED',
        details: {
          message: error instanceof Error ? error.message : String(error),
          hasSalt: !!apiSettings?.encryption_salt,
          suggestion: 'Reconfigure suas credenciais nas configurações'
        }
      }
    };
  }

  // Step 6: Return validated credentials
  return {
    result: { isValid: true },
    credentials: {
      apiKey: apiSettings.api_key,
      apiSecret: decryptedSecret
    }
  };
}

/**
 * Tests if Binance credentials are valid by making a test API call.
 */
export async function testBinanceConnection(
  apiKey: string,
  apiSecret: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const timestamp = Date.now();
    const signature = await generateBinanceSignature(apiSecret, `timestamp=${timestamp}`);
    
    const response = await fetch(
      `https://fapi.binance.com/fapi/v2/account?timestamp=${timestamp}&signature=${signature}`,
      {
        headers: {
          'X-MBX-APIKEY': apiKey
        }
      }
    );
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('Binance API test failed:', errorData);
      return {
        success: false,
        error: `API test failed: ${response.status} ${response.statusText}`
      };
    }
    
    console.log('✅ Binance credentials validated successfully');
    return { success: true };
    
  } catch (error) {
    console.error('Binance connection test error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Generates HMAC SHA256 signature for Binance API requests.
 */
async function generateBinanceSignature(secret: string, queryString: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(queryString)
  );
  
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
