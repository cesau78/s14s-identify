const auditContext = require('../../src/middleware/auditContext');

describe('Audit Context Middleware', () => {
  test('sets audit_user from x-user-id header', () => {
    const req = { headers: { 'x-user-id': 'user-123' } };
    const res = {};
    const next = jest.fn();

    auditContext(req, res, next);

    expect(req.audit_user).toBe('user-123');
    expect(next).toHaveBeenCalled();
  });

  test('defaults to anonymous when no x-user-id header', () => {
    const req = { headers: {} };
    const res = {};
    const next = jest.fn();

    auditContext(req, res, next);

    expect(req.audit_user).toBe('anonymous');
    expect(next).toHaveBeenCalled();
  });
});
