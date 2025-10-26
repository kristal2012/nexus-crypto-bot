import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestCase {
  name: string;
  body: any;
  expectedStatus: number;
  expectedErrorPattern?: string;
}

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

    const testCases: TestCase[] = [
      {
        name: "Valid trade with quoteOrderQty (exact decimal)",
        body: {
          symbol: "BTCUSDT",
          side: "BUY",
          quoteOrderQty: "5.00"
        },
        expectedStatus: 200
      },
      {
        name: "Valid trade with quoteOrderQty (8 decimals)",
        body: {
          symbol: "BTCUSDT",
          side: "BUY",
          quoteOrderQty: "5.12345678"
        },
        expectedStatus: 200
      },
      {
        name: "Invalid trade - too many decimals (9)",
        body: {
          symbol: "BTCUSDT",
          side: "BUY",
          quoteOrderQty: "5.123456789"
        },
        expectedStatus: 400,
        expectedErrorPattern: "maximum 8 decimal places"
      },
      {
        name: "Invalid trade - too many decimals from division (5.56666...)",
        body: {
          symbol: "BNBUSDT",
          side: "BUY",
          quoteOrderQty: (16.67 / 3).toString() // This creates the bug
        },
        expectedStatus: 400,
        expectedErrorPattern: "maximum 8 decimal places"
      },
      {
        name: "Valid trade - properly fixed decimals",
        body: {
          symbol: "BNBUSDT",
          side: "BUY",
          quoteOrderQty: (16.67 / 3).toFixed(8) // Proper fix
        },
        expectedStatus: 200
      },
      {
        name: "Invalid trade - negative value",
        body: {
          symbol: "BTCUSDT",
          side: "BUY",
          quoteOrderQty: "-5.00"
        },
        expectedStatus: 400,
        expectedErrorPattern: "must be greater than 0"
      },
      {
        name: "Invalid trade - zero value",
        body: {
          symbol: "BTCUSDT",
          side: "BUY",
          quoteOrderQty: "0"
        },
        expectedStatus: 400,
        expectedErrorPattern: "must be greater than 0"
      },
      {
        name: "Invalid trade - NaN value",
        body: {
          symbol: "BTCUSDT",
          side: "BUY",
          quoteOrderQty: "not-a-number"
        },
        expectedStatus: 400,
        expectedErrorPattern: "must be a valid number"
      },
      {
        name: "Invalid trade - missing symbol",
        body: {
          side: "BUY",
          quoteOrderQty: "5.00"
        },
        expectedStatus: 400,
        expectedErrorPattern: "Missing required parameters"
      },
      {
        name: "Invalid trade - invalid symbol format",
        body: {
          symbol: "btcusdt", // lowercase
          side: "BUY",
          quoteOrderQty: "5.00"
        },
        expectedStatus: 400,
        expectedErrorPattern: "Invalid symbol format"
      },
      {
        name: "Invalid trade - invalid side",
        body: {
          symbol: "BTCUSDT",
          side: "HOLD",
          quoteOrderQty: "5.00"
        },
        expectedStatus: 400,
        expectedErrorPattern: "must be BUY or SELL"
      }
    ];

    const results = [];
    let passed = 0;
    let failed = 0;

    console.log(`\n🧪 Running ${testCases.length} test cases...\n`);

    for (const testCase of testCases) {
      try {
        console.log(`Testing: ${testCase.name}`);
        
        const { data, error } = await supabase.functions.invoke('auto-trade', {
          body: testCase.body
        });

        const actualStatus = error ? (error as any).status || 500 : 200;
        const statusMatch = actualStatus === testCase.expectedStatus;
        
        let patternMatch = true;
        if (testCase.expectedErrorPattern && error) {
          const errorMessage = JSON.stringify(data || error);
          patternMatch = errorMessage.includes(testCase.expectedErrorPattern);
        }

        const testPassed = statusMatch && patternMatch;

        results.push({
          name: testCase.name,
          passed: testPassed,
          expectedStatus: testCase.expectedStatus,
          actualStatus,
          statusMatch,
          patternMatch,
          error: error ? JSON.stringify(error) : null,
          response: data ? JSON.stringify(data) : null
        });

        if (testPassed) {
          passed++;
          console.log(`✅ PASSED`);
        } else {
          failed++;
          console.log(`❌ FAILED`);
          if (!statusMatch) {
            console.log(`  Expected status: ${testCase.expectedStatus}, got: ${actualStatus}`);
          }
          if (!patternMatch) {
            console.log(`  Expected pattern: "${testCase.expectedErrorPattern}" not found`);
          }
        }
      } catch (error) {
        failed++;
        results.push({
          name: testCase.name,
          passed: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        console.log(`❌ EXCEPTION: ${error}`);
      }
      console.log('');
    }

    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed out of ${testCases.length} total\n`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total: testCases.length,
          passed,
          failed,
          passRate: ((passed / testCases.length) * 100).toFixed(2) + '%'
        },
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error running tests:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Test execution failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
