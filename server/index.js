/**
 * IFTalk Server Entry Point
 *
 * Main server initialization and startup.
 */

import { createApp, getLocalIP } from './core/app.js';
import { config } from './core/config.js';

const { app, httpServer, httpsServer } = createApp();

// Start servers
const HTTP_PORT = config.port || 3000;
const HTTPS_PORT = (config.port || 3000) + 1;

const localIP = await getLocalIP();

console.log('\n🎮 IF Talk - Voice-Powered Interactive Fiction\n');

// Start HTTP server
httpServer.listen(HTTP_PORT, () => {
  console.log(`📡 HTTP:  http://localhost:${HTTP_PORT}`);
  console.log(`          http://${localIP}:${HTTP_PORT}`);
});

// Start HTTPS server (if available)
if (httpsServer) {
  httpsServer.listen(HTTPS_PORT, () => {
    console.log(`\n🔒 HTTPS: https://localhost:${HTTPS_PORT}`);
    console.log(`          https://${localIP}:${HTTPS_PORT}`);
  });
} else {
  console.log(`\n⚠️  HTTPS: Not available (certificates not found)`);
  console.log(`          To enable HTTPS, add localhost+3.pem and localhost+3-key.pem`);
}

console.log(`\n📱 Make sure devices are on same WiFi`);
console.log(`\nPress Ctrl+C to stop\n`);
