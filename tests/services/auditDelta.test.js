const { computeDelta, getNestedValue, CUSTOMER_AUDITABLE_FIELDS } = require('../../src/services/auditDelta');

describe('Audit Delta Service', () => {
  describe('getNestedValue', () => {
    test('gets a top-level value', () => {
      expect(getNestedValue({ name: 'John' }, 'name')).toBe('John');
    });

    test('gets a nested value', () => {
      expect(getNestedValue({ address: { city: 'Springfield' } }, 'address.city')).toBe('Springfield');
    });

    test('returns undefined for missing path', () => {
      expect(getNestedValue({ name: 'John' }, 'address.city')).toBeUndefined();
    });

    test('returns undefined for null object in path', () => {
      expect(getNestedValue({ address: null }, 'address.city')).toBeUndefined();
    });
  });

  describe('computeDelta', () => {
    test('detects changed fields', () => {
      const original = { first_name: 'John', last_name: 'Doe' };
      const updated = { first_name: 'Jane', last_name: 'Doe' };
      const delta = computeDelta(original, updated, ['first_name', 'last_name']);
      expect(delta).toEqual({
        first_name: { from: 'John', to: 'Jane' }
      });
    });

    test('returns empty delta when nothing changed', () => {
      const data = { first_name: 'John', last_name: 'Doe' };
      const delta = computeDelta(data, data, ['first_name', 'last_name']);
      expect(delta).toEqual({});
    });

    test('detects nested field changes', () => {
      const original = { address: { city: 'Springfield', state: 'IL' } };
      const updated = { address: { city: 'Chicago', state: 'IL' } };
      const delta = computeDelta(original, updated, ['address.city', 'address.state']);
      expect(delta).toEqual({
        'address.city': { from: 'Springfield', to: 'Chicago' }
      });
    });
  });

  describe('CUSTOMER_AUDITABLE_FIELDS', () => {
    test('includes expected fields', () => {
      expect(CUSTOMER_AUDITABLE_FIELDS).toContain('first_name');
      expect(CUSTOMER_AUDITABLE_FIELDS).toContain('last_name');
      expect(CUSTOMER_AUDITABLE_FIELDS).toContain('email');
      expect(CUSTOMER_AUDITABLE_FIELDS).toContain('phone');
      expect(CUSTOMER_AUDITABLE_FIELDS).toContain('address.street');
      expect(CUSTOMER_AUDITABLE_FIELDS).toContain('address.city');
      expect(CUSTOMER_AUDITABLE_FIELDS).toContain('address.state');
      expect(CUSTOMER_AUDITABLE_FIELDS).toContain('address.zip');
    });
  });
});
