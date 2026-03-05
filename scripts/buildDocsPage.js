const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, '..', 'docs');
fs.mkdirSync(docsDir, { recursive: true });

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>S14S Identify - API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .header {
      background: #1a1a2e;
      color: #e0e0e0;
      padding: 24px 40px;
      border-bottom: 3px solid #0f3460;
    }
    .header h1 {
      margin: 0 0 6px 0;
      font-size: 28px;
      color: #e94560;
    }
    .header p {
      margin: 0;
      font-size: 14px;
      color: #a0a0b0;
    }
    .header .subtitle {
      margin-top: 4px;
      font-size: 12px;
      color: #6a6a7a;
    }
    .badges {
      margin-top: 12px;
      display: flex;
      gap: 8px;
    }
    .mock-banner {
      background: #0f3460;
      color: #e0e0e0;
      text-align: center;
      padding: 8px 16px;
      font-size: 13px;
    }
    .mock-banner strong { color: #e94560; }
    #swagger-ui {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    #loading {
      text-align: center;
      padding: 40px;
      color: #666;
      font-size: 16px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>S14S Identify</h1>
    <p>Enterprise Identifier Registry - API Documentation</p>
    <p class="subtitle">Interactive demo - all data is stored in-browser via ServiceWorker</p>
    <div class="badges">
      <img src="https://github.com/cesau78/s14s-identify/actions/workflows/ci.yml/badge.svg" alt="CI">
    </div>
  </div>
  <div class="mock-banner">
    <strong>Live Demo</strong> — API calls are intercepted by a ServiceWorker mock. No backend required. Data resets on page reload.
  </div>
  <div id="loading">Starting mock API server...</div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    async function boot() {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.register('./mockServiceWorker.js');
        // Wait for the service worker to become active
        if (reg.installing || reg.waiting) {
          const sw = reg.installing || reg.waiting;
          await new Promise(resolve => {
            sw.addEventListener('statechange', () => {
              if (sw.state === 'activated') resolve();
            });
            if (sw.state === 'activated') resolve();
          });
        }
        // Ensure this page is controlled by the service worker
        if (!navigator.serviceWorker.controller) {
          await new Promise(resolve => {
            navigator.serviceWorker.addEventListener('controllerchange', resolve);
          });
        }
      }

      document.getElementById('loading').style.display = 'none';

      // Rewrite the spec server URL to point at the current origin
      const specResp = await fetch('./openapi.json');
      const spec = await specResp.json();
      spec.servers = [{ url: window.location.origin, description: 'In-browser mock API' }];

      SwaggerUIBundle({
        spec: spec,
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: 'BaseLayout'
      });
    }

    boot().catch(err => {
      document.getElementById('loading').textContent = 'Failed to start mock server: ' + err.message;
      console.error(err);
    });
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(docsDir, 'index.html'), html);
console.log('Docs site built at docs/index.html');
