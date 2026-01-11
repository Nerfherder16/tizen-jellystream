/**
 * Simple HTTP server for JellyStream development
 * Run with: node server.js
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const JELLYSEERR_URL = 'http://192.168.50.19:5055';
const AUTHENTIK_URL = 'https://auth.streamy.tube';
const JELLYFIN_URL = 'https://jellyfin.streamy.tube';

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);

    // Proxy Authentik OAuth requests
    if (req.url.startsWith('/api/authentik/')) {
        const authentikPath = req.url.replace('/api/authentik', '/application/o');
        const proxyUrl = new URL(authentikPath, AUTHENTIK_URL);

        console.log(`Proxying to Authentik: ${proxyUrl.href}`);

        // Collect request body for POST requests
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            body = Buffer.concat(body);

            const options = {
                hostname: proxyUrl.hostname,
                port: 443,
                path: proxyUrl.pathname + proxyUrl.search,
                method: req.method,
                headers: {
                    'Content-Type': req.headers['content-type'] || 'application/x-www-form-urlencoded',
                    'Content-Length': body.length,
                    'Accept': 'application/json'
                }
            };

            const proxyReq = https.request(options, (proxyRes) => {
                // Add CORS headers
                res.writeHead(proxyRes.statusCode, {
                    'Content-Type': proxyRes.headers['content-type'] || 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                });
                proxyRes.pipe(res);
            });

            proxyReq.on('error', (error) => {
                console.error('Authentik proxy error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Proxy error: ' + error.message }));
            });

            proxyReq.write(body);
            proxyReq.end();
        });
        return;
    }

    // Proxy Jellyfin SSO requests
    if (req.url.startsWith('/api/jellyfin/')) {
        const jellyfinPath = req.url.replace('/api/jellyfin', '');
        const proxyUrl = new URL(jellyfinPath, JELLYFIN_URL);

        console.log(`Proxying to Jellyfin: ${proxyUrl.href}`);

        // Collect request body for POST requests
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            body = Buffer.concat(body);

            const options = {
                hostname: proxyUrl.hostname,
                port: 443,
                path: proxyUrl.pathname + proxyUrl.search,
                method: req.method,
                headers: {
                    'Content-Type': req.headers['content-type'] || 'application/json',
                    'Content-Length': body.length,
                    'Accept': 'application/json'
                }
            };

            // Forward Authorization headers if present
            if (req.headers['authorization']) {
                options.headers['Authorization'] = req.headers['authorization'];
            }
            if (req.headers['x-emby-authorization']) {
                options.headers['X-Emby-Authorization'] = req.headers['x-emby-authorization'];
            }

            const proxyReq = https.request(options, (proxyRes) => {
                // Add CORS headers
                res.writeHead(proxyRes.statusCode, {
                    'Content-Type': proxyRes.headers['content-type'] || 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                });
                proxyRes.pipe(res);
            });

            proxyReq.on('error', (error) => {
                console.error('Jellyfin proxy error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Proxy error: ' + error.message }));
            });

            proxyReq.write(body);
            proxyReq.end();
        });
        return;
    }

    // Proxy Jellyseerr API requests
    if (req.url.startsWith('/api/jellyseerr/')) {
        const jellyseerrPath = req.url.replace('/api/jellyseerr', '');
        const proxyUrl = JELLYSEERR_URL + jellyseerrPath;

        console.log(`Proxying to Jellyseerr: ${proxyUrl}`);

        const options = {
            method: req.method,
            headers: {
                ...req.headers,
                'host': '192.168.50.19:5055'
            }
        };

        const proxyReq = http.request(proxyUrl, options, (proxyRes) => {
            // Add CORS headers
            res.writeHead(proxyRes.statusCode, {
                ...proxyRes.headers,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key'
            });
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (error) => {
            console.error('Proxy error:', error);
            res.writeHead(500);
            res.end('Proxy error: ' + error.message);
        });

        req.pipe(proxyReq);
        return;
    }

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key'
        });
        res.end();
        return;
    }

    // Default to index.html
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - File Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Server Error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log('');
    console.log('========================================');
    console.log('  JellyStream Development Server');
    console.log('========================================');
    console.log('');
    console.log(`  Server running at: http://localhost:${PORT}/`);
    console.log('');
    console.log('  Press Ctrl+C to stop');
    console.log('');
});
