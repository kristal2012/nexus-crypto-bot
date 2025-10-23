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

    // Get all records with plaintext secrets
    const { data: records, error: fetchError } = await supabase
      .from('binance_api_keys')
      .select('id, user_id, api_secret')
      .not('api_secret', 'is', null)
      .neq('api_secret', '')
      .is('api_secret_encrypted', null);

    if (fetchError) {
      console.error('Error fetching records:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch records' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!records || records.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No records to migrate', migrated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Migrating ${records.length} records...`);
    let migrated = 0;
    const errors = [];

    for (const record of records) {
      try {
        const encryptedSecret = await encryptSecret(record.api_secret);
        
        const { error: updateError } = await supabase
          .from('binance_api_keys')
          .update({
            api_secret_encrypted: encryptedSecret,
          })
          .eq('id', record.id);

        if (updateError) {
          errors.push({ id: record.id, error: updateError.message });
        } else {
          migrated++;
        }
      } catch (error) {
        errors.push({ id: record.id, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    console.log(`Migration complete: ${migrated} migrated, ${errors.length} errors`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        migrated,
        total: records.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in migrate-encrypt-secrets function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
