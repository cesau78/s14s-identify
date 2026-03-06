const swaggerSpec = require('../../src/swagger/swaggerConfig');

describe('Swagger Configuration', () => {
  test('produces a valid OpenAPI spec', () => {
    expect(swaggerSpec.openapi).toBe('3.0.0');
    expect(swaggerSpec.info.title).toBe('S14S Identify - Enterprise Identifier Registry');
    expect(swaggerSpec.info.version).toBe('1.0.0');
  });

  test('includes paths from route annotations', () => {
    expect(swaggerSpec.paths).toBeDefined();
    expect(swaggerSpec.paths['/customers']).toBeDefined();
  });
});
