/**
 * Global Error Handler
 * 
 * Suppresses rate limit errors (429) from being reported as runtime errors.
 * These are expected behavior and handled gracefully by the application.
 */

export const initGlobalErrorHandler = () => {
  // Suppress unhandled promise rejections for rate limits
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const reasonStr = typeof reason === 'string' 
      ? reason 
      : reason?.message || JSON.stringify(reason);

    // Check if it's a rate limit error
    if (
      reasonStr.includes('429') || 
      reasonStr.includes('rate_limit') || 
      reasonStr.includes('Rate limit') ||
      reasonStr.includes('Please wait before running another analysis')
    ) {
      console.log('⏳ [GlobalErrorHandler] Rate limit error suppressed:', reasonStr);
      event.preventDefault(); // Prevent error from being reported
      return;
    }
  });

  // Suppress global errors for rate limits
  window.addEventListener('error', (event) => {
    const errorMsg = event.message || event.error?.message || '';
    
    if (
      errorMsg.includes('429') || 
      errorMsg.includes('rate_limit') || 
      errorMsg.includes('Rate limit') ||
      errorMsg.includes('Please wait before running another analysis')
    ) {
      console.log('⏳ [GlobalErrorHandler] Rate limit error suppressed:', errorMsg);
      event.preventDefault(); // Prevent error from being reported
      return;
    }
  });

  console.log('✅ [GlobalErrorHandler] Initialized - rate limit errors will be suppressed');
};
