const fs = require('fs');
const path = require('path');
const swaggerSpec = require('../src/swagger/swaggerConfig');

const outputPath = path.join(__dirname, '..', 'docs', 'openapi.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2));

console.log(`OpenAPI spec written to ${outputPath}`);
