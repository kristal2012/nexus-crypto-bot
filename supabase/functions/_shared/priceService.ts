/**
 * Price Service - Serviço para buscar preços de mercado
 * Princípio: SRP (Single Responsibility Principle)
 */

export async function getCurrentPrice(symbol: string): Promise<number | null> {
  try {
    const priceUrl = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`;
    
    const priceResponse = await fetch(priceUrl, {
      signal: AbortSignal.timeout(5000)
    });
    
    if (!priceResponse.ok) {
      console.error(`Failed to get price for ${symbol}: ${priceResponse.status}`);
      return null;
    }
    
    const priceData = await priceResponse.json();
    return parseFloat(priceData.price);
  } catch (error) {
    console.error(`Error fetching price for ${symbol}:`, error);
    return null;
  }
}
