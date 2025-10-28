/**
 * Trading Mode Security Tests
 * 
 * Automated tests to ensure DEMO mode never executes real trades
 * and REAL mode properly validates before execution.
 */

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export async function runTradingModeTests(supabaseClient: any, userId: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: DEMO mode should not have real_mode_confirmed_at
  try {
    const { data: demoSettings } = await supabaseClient
      .from('trading_settings')
      .select('trading_mode, real_mode_confirmed_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (demoSettings?.trading_mode === 'DEMO') {
      const hasConfirmation = !!demoSettings.real_mode_confirmed_at;
      results.push({
        name: 'DEMO mode confirmation check',
        passed: !hasConfirmation,
        message: hasConfirmation 
          ? '❌ SECURITY RISK: DEMO mode has real_mode_confirmed_at set'
          : '✅ DEMO mode correctly has no confirmation timestamp'
      });
    }
  } catch (error) {
    results.push({
      name: 'DEMO mode confirmation check',
      passed: false,
      message: `❌ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }

  // Test 2: REAL mode without confirmation should be rejected
  try {
    const testTradeResult = await supabaseClient.functions.invoke('auto-trade', {
      body: {
        symbol: 'BTCUSDT',
        side: 'BUY',
        quoteOrderQty: '10.00000000'
      }
    });

    // If we're in DEMO mode, trade should succeed
    // If we're in REAL mode without confirmation, should fail with 403
    const { data: currentSettings } = await supabaseClient
      .from('trading_settings')
      .select('trading_mode, real_mode_confirmed_at')
      .eq('user_id', userId)
      .single();

    if (currentSettings.trading_mode === 'REAL') {
      const confirmedAt = currentSettings.real_mode_confirmed_at 
        ? new Date(currentSettings.real_mode_confirmed_at) 
        : null;
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const isConfirmationValid = confirmedAt && confirmedAt > fiveMinutesAgo;

      if (!isConfirmationValid) {
        results.push({
          name: 'REAL mode without valid confirmation',
          passed: testTradeResult.error?.message?.includes('confirmation'),
          message: testTradeResult.error 
            ? '✅ Correctly rejected REAL trade without valid confirmation'
            : '❌ SECURITY RISK: REAL trade executed without valid confirmation'
        });
      }
    }
  } catch (error) {
    results.push({
      name: 'REAL mode without valid confirmation',
      passed: false,
      message: `❌ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }

  // Test 3: Verify trading mode is correctly stored
  try {
    const { data: settings } = await supabaseClient
      .from('trading_settings')
      .select('trading_mode')
      .eq('user_id', userId)
      .single();

    const isValidMode = settings?.trading_mode === 'DEMO' || settings?.trading_mode === 'REAL';
    results.push({
      name: 'Trading mode validity',
      passed: isValidMode,
      message: isValidMode
        ? `✅ Trading mode is valid: ${settings.trading_mode}`
        : `❌ Invalid trading mode: ${settings?.trading_mode}`
    });
  } catch (error) {
    results.push({
      name: 'Trading mode validity',
      passed: false,
      message: `❌ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }

  return results;
}
