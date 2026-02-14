/**
 * Binance API Proxy - Serverless Function for Vercel (Javascript Version)
 * Bypasses regional geoblocks by routing requests through Vercel's US-based infrastructure.
 */
export default async function handler(req, res) {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-MBX-APIKEY'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const { path, ...params } = req.query;

        // Validar path
        if (!path) {
            return res.status(400).json({ error: 'Missing path parameter' });
        }

        // Construir URL da Binance (Utilizando .me para evitar geoblocks regionais no Vercel/VPS)
        const baseUrl = 'https://api.binance.me';
        const queryStr = Object.entries(params)
            .map(([key, val]) => `${key}=${val}`)
            .join('&');

        const targetUrl = `${baseUrl}${path}${queryStr ? '?' + queryStr : ''}`;

        console.log(`[Proxy] ${req.method} Forwarding to: ${targetUrl}`);

        const fetchOptions = {
            method: req.method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        // Forward API Key header if present
        if (req.headers['x-mbx-apikey']) {
            fetchOptions.headers['X-MBX-APIKEY'] = req.headers['x-mbx-apikey'];
        }

        // Forward body for non-GET/HEAD requests
        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
            // Vercel parses JSON body automatically. Need to stringify it back.
            fetchOptions.body = JSON.stringify(req.body);
        }

        const response = await fetch(targetUrl, fetchOptions);

        // Tentar parsear JSON, se falhar devolver texto
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            const data = await response.json();
            return res.status(response.status).json(data);
        } else {
            const text = await response.text();
            return res.status(response.status).send(text);
        }

    } catch (error) {
        console.error('[Proxy Error]', error);
        return res.status(500).json({
            error: 'Proxy Internal Error',
            message: error.message
        });
    }
}
