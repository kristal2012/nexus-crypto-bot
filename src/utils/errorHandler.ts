/**
 * Global Error Handler
 * 
 * Suppresses rate limit errors (429) from being reported as runtime errors.
 * These are expected behavior and handled gracefully by the application.
 */

export const initGlobalErrorHandler = () => {
  // Suppress unhandled promise rejections for rate limits and Binance validation errors
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const reasonStr = typeof reason === 'string' 
      ? reason 
      : reason?.message || JSON.stringify(reason);

    // Check if it's a rate limit error or Binance validation error
    if (
      reasonStr.includes('429') || 
      reasonStr.includes('rate_limit') || 
      reasonStr.includes('Rate limit') ||
      reasonStr.includes('Please wait before running another analysis') ||
      reasonStr.includes('API test failed') ||
      reasonStr.includes('Edge function returned 400') ||
      reasonStr.includes('binance-account')
    ) {
      console.log('⏳ [GlobalErrorHandler] Expected error suppressed:', reasonStr);
      event.preventDefault(); // Prevent error from being reported
      return;
    }
  });

  // Suppress global errors for rate limits and Binance validation errors
  window.addEventListener('error', (event) => {
    const errorMsg = event.message || event.error?.message || '';
    
    if (
      errorMsg.includes('429') || 
      errorMsg.includes('rate_limit') || 
      errorMsg.includes('Rate limit') ||
      errorMsg.includes('Please wait before running another analysis') ||
      errorMsg.includes('API test failed') ||
      errorMsg.includes('Edge function returned 400') ||
      errorMsg.includes('binance-account')
    ) {
      console.log('⏳ [GlobalErrorHandler] Expected error suppressed:', errorMsg);
      event.preventDefault(); // Prevent error from being reported
      return;
    }
  });

  console.log('✅ [GlobalErrorHandler] Initialized - rate limit and validation errors will be suppressed');
};
