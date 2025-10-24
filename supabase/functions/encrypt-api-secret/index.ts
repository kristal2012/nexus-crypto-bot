import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { encryptSecret } from "../_shared/encryption.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { api_key, api_secret } = await req.json();

    if (!api_key || !api_secret) {
      return new Response(
        JSON.stringify({ error: 'Missing api_key or api_secret' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Encrypt the API secret
    const encryptedSecret = await encryptSecret(api_secret);

    // Store encrypted secret in database
    const { error: upsertError } = await supabase
      .from('binance_api_keys')
      .upsert({
        user_id: user.id,
        api_key: api_key.trim(),
        api_secret_encrypted: encryptedSecret,
        api_secret: '', // Clear plaintext (will be removed in future migration)
      }, {
        onConflict: 'user_id'
      });

    if (upsertError) {
      console.error('Error saving encrypted keys:', upsertError);
      return new Response(
        JSON.stringify({ error: 'Unable to save API keys' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'API keys saved successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in encrypt-api-secret function:', error);
    return new Response(
      JSON.stringify({ error: 'Service error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
