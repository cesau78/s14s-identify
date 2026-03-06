const swaggerJsdoc = require('swagger-jsdoc');

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'S14S Identify - Enterprise Identifier Registry',
      version: '1.0.0',
      description:
        'REST API for consolidating customer identities across multiple source systems. ' +
        'Uses the Fellegi-Sunter probabilistic record linkage model with Jaro-Winkler ' +
        'distance for fuzzy name/address matching and exact matching for email/phone. ' +
        'Phone numbers are normalized to E.164 format. All mutations are tracked with ' +
        'field-level audit deltas. Records are soft-deleted and linked via an aliases array.'
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local development server'
      }
    ]
  },
  apis: ['./src/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

module.exports = swaggerSpec;
