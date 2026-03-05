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
    .badges {
      margin-top: 12px;
      display: flex;
      gap: 8px;
    }
    #swagger-ui {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>S14S Identify</h1>
    <p>Enterprise Identifier Registry - API Documentation</p>
    <div class="badges">
      <img src="https://github.com/cesau78/s14s-identify/actions/workflows/ci.yml/badge.svg" alt="CI">
    </div>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: './openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.SwaggerUIStandalonePreset
      ],
      layout: 'BaseLayout'
    });
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(docsDir, 'index.html'), html);
console.log('Docs site built at docs/index.html');
