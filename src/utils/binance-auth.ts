import * as crypto from 'crypto';

export function generateBinanceSignature(queryString: string, apiSecret: string): string {
    return crypto
        .createHmac('sha256', apiSecret)
        .update(queryString)
        .digest('hex');
}
