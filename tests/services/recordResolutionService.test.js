const { resolveCustomerFields } = require('../../src/services/recordResolutionService');

describe('Record Resolution Service', () => {
  test('returns null for empty aliases array', () => {
    expect(resolveCustomerFields([])).toBeNull();
  });

  test('returns null for null input', () => {
    expect(resolveCustomerFields(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(resolveCustomerFields(undefined)).toBeNull();
  });

  test('resolves single alias fields', () => {
    const aliases = [{
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      phone: '+12145551234',
      address: { street: '123 Main ST', city: 'Springfield', state: 'IL', zip: '62701' },
      source_of_truth: false,
      effective_date: new Date('2025-01-01')
    }];

    const resolved = resolveCustomerFields(aliases);
    expect(resolved.first_name).toBe('John');
    expect(resolved.last_name).toBe('Doe');
    expect(resolved.email).toBe('john@example.com');
    expect(resolved.phone).toBe('+12145551234');
    expect(resolved.address.street).toBe('123 Main ST');
    expect(resolved.effective_date).toEqual(new Date('2025-01-01'));
  });

  test('later non-SOT alias overwrites earlier non-SOT alias', () => {
    const aliases = [
      {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '+12145551234',
        address: { street: '123 Main ST', city: 'Springfield', state: 'IL', zip: '62701' },
        source_of_truth: false,
        effective_date: new Date('2025-01-01')
      },
      {
        first_name: 'Jonathan',
        last_name: 'Doe',
        email: 'jonathan@example.com',
        phone: '',
        address: { street: '', city: '', state: '', zip: '' },
        source_of_truth: false,
        effective_date: new Date('2025-06-01')
      }
    ];

    const resolved = resolveCustomerFields(aliases);
    expect(resolved.first_name).toBe('Jonathan');
    expect(resolved.email).toBe('jonathan@example.com');
    // Empty fields on later alias do NOT erase earlier values
    expect(resolved.phone).toBe('+12145551234');
    expect(resolved.address.street).toBe('123 Main ST');
  });

  test('SOT alias always wins over non-SOT regardless of date', () => {
    const aliases = [
      {
        first_name: 'Chuck',
        last_name: 'Smith',
        email: 'chuck@example.com',
        phone: '',
        address: { street: '', city: '', state: '', zip: '' },
        source_of_truth: false,
        effective_date: new Date('2026-01-01')  // Later date
      },
      {
        first_name: 'Charles',
        last_name: 'Smith',
        email: 'charles@example.com',
        phone: '+12145551234',
        address: { street: '456 Oak AVE', city: 'Dallas', state: 'TX', zip: '75201' },
        source_of_truth: true,
        effective_date: new Date('2025-01-01')  // Earlier date
      }
    ];

    const resolved = resolveCustomerFields(aliases);
    expect(resolved.first_name).toBe('Charles');
    expect(resolved.email).toBe('charles@example.com');
    expect(resolved.phone).toBe('+12145551234');
    expect(resolved.address.city).toBe('Dallas');
  });

  test('later SOT alias wins over earlier SOT alias', () => {
    const aliases = [
      {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@a.com',
        phone: '',
        address: { street: '', city: '', state: '', zip: '' },
        source_of_truth: true,
        effective_date: new Date('2025-01-01')
      },
      {
        first_name: 'Johnny',
        last_name: 'Doe',
        email: 'johnny@b.com',
        phone: '',
        address: { street: '', city: '', state: '', zip: '' },
        source_of_truth: true,
        effective_date: new Date('2025-06-01')
      }
    ];

    const resolved = resolveCustomerFields(aliases);
    expect(resolved.first_name).toBe('Johnny');
    expect(resolved.email).toBe('johnny@b.com');
  });

  test('empty fields on later alias do not erase earlier values', () => {
    const aliases = [
      {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '+12145551234',
        address: { street: '123 Main ST', city: 'Springfield', state: 'IL', zip: '62701' },
        source_of_truth: false,
        effective_date: new Date('2025-01-01')
      },
      {
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        address: { street: '', city: '', state: '', zip: '' },
        source_of_truth: false,
        effective_date: new Date('2025-06-01')
      }
    ];

    const resolved = resolveCustomerFields(aliases);
    expect(resolved.first_name).toBe('John');
    expect(resolved.last_name).toBe('Doe');
    expect(resolved.email).toBe('john@example.com');
    expect(resolved.phone).toBe('+12145551234');
    expect(resolved.address.street).toBe('123 Main ST');
  });

  test('effective_date is the max across all aliases', () => {
    const aliases = [
      {
        first_name: 'A', last_name: 'B', email: 'a@b.com', phone: '',
        address: { street: '', city: '', state: '', zip: '' },
        source_of_truth: false,
        effective_date: new Date('2025-01-01')
      },
      {
        first_name: 'C', last_name: 'D', email: 'c@d.com', phone: '',
        address: { street: '', city: '', state: '', zip: '' },
        source_of_truth: true,
        effective_date: new Date('2025-12-31')
      }
    ];

    const resolved = resolveCustomerFields(aliases);
    expect(resolved.effective_date).toEqual(new Date('2025-12-31'));
  });

  test('defaults effective_date to now when all dates are invalid', () => {
    const before = new Date();
    const aliases = [{
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      phone: '',
      address: { street: '', city: '', state: '', zip: '' },
      source_of_truth: false,
      effective_date: 'not-a-date'
    }];

    const resolved = resolveCustomerFields(aliases);
    const after = new Date();
    expect(resolved.effective_date.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(resolved.effective_date.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  test('handles aliases without address gracefully', () => {
    const aliases = [{
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      phone: '',
      source_of_truth: false,
      effective_date: new Date('2025-01-01')
    }];

    const resolved = resolveCustomerFields(aliases);
    expect(resolved.first_name).toBe('John');
    expect(resolved.address).toEqual({ street: '', city: '', state: '', zip: '' });
  });
});
