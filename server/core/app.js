/**
 * Server Application Core
 *
 * Static file server for the browser-based app, plus two small endpoints:
 * /api/log (remote console for mobile debugging) and /api/fetch-game
 * (CORS proxy for downloading games from the IF Archive).
 *
 * All game logic runs client-side (ifvms.js) — there is deliberately no
 * server-side interpreter, no Socket.IO, no session state.
 */

import express from 'express';
import { createServer as createHttpsServer } from 'https';
import { createServer as createHttpServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create and configure Express app
 * @returns {Object} {app, httpServer, httpsServer}
 */
export function createApp() {
  const app = express();

  // Create HTTP server (always available)
  const httpServer = createHttpServer(app);

  // Create HTTPS server (if certificates exist)
  let httpsServer = null;
  const certPath = path.join(__dirname, '../../localhost+3.pem');
  const keyPath = path.join(__dirname, '../../localhost+3-key.pem');

  if (existsSync(certPath) && existsSync(keyPath)) {
    const httpsOptions = {
      key: readFileSync(keyPath),
      cert: readFileSync(certPath)
    };
    httpsServer = createHttpsServer(httpsOptions, app);
  }

  // Parse JSON bodies
  app.use(express.json());

  // Serve static files — no-cache for JS/CSS so browsers always get fresh code
  app.use(express.static('docs', {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  }));

  // Remote console logging endpoint (for iOS debugging)
  app.post('/api/log', (req, res) => {
    const { level, args } = req.body;
    const timestamp = new Date().toLocaleTimeString();

    // Color codes for terminal
    const colors = {
      log: '\x1b[37m',    // white
      warn: '\x1b[33m',   // yellow
      error: '\x1b[31m',  // red
      info: '\x1b[36m',   // cyan
      debug: '\x1b[90m'   // gray
    };
    const reset = '\x1b[0m';
    const color = colors[level] || colors.log;

    // Format args for display
    const message = (args || []).map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');

    console.log(`${color}[${timestamp}] [client:${level}] ${message}${reset}`);

    res.sendStatus(200);
  });

  // Proxy endpoint for fetching remote game files (avoids CORS issues)
  app.get('/api/fetch-game', async (req, res) => {
    const gameUrl = req.query.url;

    if (!gameUrl) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    // Validate URL
    try {
      new URL(gameUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    // Only allow fetching from known safe domains
    const allowedDomains = [
      'ifarchive.org',
      'www.ifarchive.org',
      'mirror.ifarchive.org',
      'ifdb.org',
      'www.ifdb.org',
      'web.archive.org',
      'archive.org',
      'eblong.com'
    ];

    const urlObj = new URL(gameUrl);
    if (!allowedDomains.some(domain => urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain))) {
      return res.status(403).json({
        error: 'Domain not allowed. Only IF Archive and IFDB URLs are supported.'
      });
    }

    try {
      const response = await fetch(gameUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*'
        },
        redirect: 'follow'
      });

      if (!response.ok) {
        return res.status(response.status).json({
          error: `Failed to fetch: ${response.status} ${response.statusText}`
        });
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Set appropriate headers
      res.set('Content-Type', 'application/octet-stream');
      res.set('Content-Length', buffer.length);
      res.send(buffer);

    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch game file: ' + error.message });
    }
  });

  return { app, httpServer, httpsServer };
}

/**
 * Get network IP address
 * @returns {Promise<string>} Local IP address
 */
export async function getLocalIP() {
  const os = await import('os');
  const nets = os.networkInterfaces();

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}
