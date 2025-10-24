import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

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
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, enabled, message } = await req.json();

    if (action !== 'enable' && action !== 'disable') {
      return new Response(
        JSON.stringify({ error: 'Invalid action. Must be "enable" or "disable"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tradingEnabled = action === 'enable';

    // Update system settings
    const { error: updateError } = await supabase
      .from('system_settings')
      .update({
        trading_enabled: tradingEnabled,
        emergency_message: message || null,
        updated_by: user.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', (await supabase.from('system_settings').select('id').single()).data?.id);

    if (updateError) {
      console.error('Error updating system settings:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update system settings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log to audit trail
    const { error: auditError } = await supabase
      .from('emergency_stop_audit')
      .insert({
        action: action,
        trading_enabled: tradingEnabled,
        emergency_message: message || null,
        triggered_by: user.id
      });

    if (auditError) {
      console.error('Error logging to audit:', auditError);
    }

    console.log(`Emergency stop ${action}d by admin ${user.id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        trading_enabled: tradingEnabled,
        message: tradingEnabled ? 'Trading enabled' : 'Trading disabled'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in admin-emergency-stop function:', error);
    return new Response(
      JSON.stringify({ error: 'Service error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});