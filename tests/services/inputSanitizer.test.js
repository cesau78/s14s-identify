const {
  sanitizeString,
  sanitizeEmail,
  normalizePhoneToE164,
  sanitizeAddress,
  sanitizeCustomerInput,
  sanitizeCustomerUpdate,
  isValidEmail
} = require('../../src/services/inputSanitizer');

describe('Input Sanitizer', () => {
  describe('sanitizeString', () => {
    test('trims whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });

    test('returns empty string for null', () => {
      expect(sanitizeString(null)).toBe('');
    });

    test('returns empty string for undefined', () => {
      expect(sanitizeString(undefined)).toBe('');
    });

    test('converts numbers to string', () => {
      expect(sanitizeString(123)).toBe('123');
    });
  });

  describe('sanitizeEmail', () => {
    test('lowercases and trims email', () => {
      expect(sanitizeEmail('  John@Example.COM  ')).toBe('john@example.com');
    });

    test('returns empty string for empty input', () => {
      expect(sanitizeEmail('')).toBe('');
    });

    test('returns empty string for null', () => {
      expect(sanitizeEmail(null)).toBe('');
    });
  });

  describe('isValidEmail', () => {
    test('accepts valid email', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
    });

    test('rejects email without @', () => {
      expect(isValidEmail('userexample.com')).toBe(false);
    });

    test('rejects email without domain', () => {
      expect(isValidEmail('user@')).toBe(false);
    });

    test('rejects email with spaces', () => {
      expect(isValidEmail('user @example.com')).toBe(false);
    });
  });

  describe('normalizePhoneToE164', () => {
    test('normalizes US phone number to E.164', () => {
      expect(normalizePhoneToE164('(214) 867-5309')).toBe('+12148675309');
    });

    test('normalizes phone with dashes', () => {
      expect(normalizePhoneToE164('214-867-5309')).toBe('+12148675309');
    });

    test('normalizes phone with country code', () => {
      expect(normalizePhoneToE164('+1 214 867 5309')).toBe('+12148675309');
    });

    test('normalizes 10-digit US number', () => {
      expect(normalizePhoneToE164('2145551234')).toBe('+12145551234');
    });

    test('returns empty string for invalid phone', () => {
      expect(normalizePhoneToE164('not-a-phone')).toBe('');
    });

    test('returns empty string for empty input', () => {
      expect(normalizePhoneToE164('')).toBe('');
    });

    test('returns empty string for null', () => {
      expect(normalizePhoneToE164(null)).toBe('');
    });

    test('returns empty string for whitespace-only input', () => {
      expect(normalizePhoneToE164('   ')).toBe('');
    });

    test('uses default country US when none specified', () => {
      expect(normalizePhoneToE164('2145551234')).toBe('+12145551234');
    });

    test('respects explicit country code', () => {
      const result = normalizePhoneToE164('020 7946 0958', 'GB');
      expect(result).toBe('+442079460958');
    });
  });

  describe('sanitizeAddress', () => {
    test('trims address fields', () => {
      const result = sanitizeAddress({ street: '  123 Main  ', city: '  Springfield  ', state: ' il ', zip: ' 62701 ' });
      expect(result.street).toBe('123 Main');
      expect(result.city).toBe('Springfield');
      expect(result.state).toBe('IL');
      expect(result.zip).toBe('62701');
    });

    test('returns empty object for null', () => {
      expect(sanitizeAddress(null)).toEqual({});
    });

    test('returns empty object for non-object', () => {
      expect(sanitizeAddress('string')).toEqual({});
    });

    test('handles partial address', () => {
      const result = sanitizeAddress({ city: 'Chicago' });
      expect(result).toEqual({ city: 'Chicago' });
    });
  });

  describe('sanitizeCustomerInput', () => {
    const validInput = {
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      phone: '(214) 867-5309',
      source_system: 'CRM',
      source_key: 'CRM-001',
      address: { street: '123 Main', city: 'Springfield', state: 'il', zip: '62701' }
    };

    test('sanitizes valid input with no errors', () => {
      const { errors, sanitized } = sanitizeCustomerInput(validInput);
      expect(errors).toHaveLength(0);
      expect(sanitized.first_name).toBe('John');
      expect(sanitized.email).toBe('john@example.com');
      expect(sanitized.phone).toBe('+12148675309');
      expect(sanitized.address.state).toBe('IL');
    });

    test('returns error for missing source_system', () => {
      const { errors } = sanitizeCustomerInput({ ...validInput, source_system: '' });
      expect(errors).toContain('source_system and source_key are required');
    });

    test('returns error for missing source_key', () => {
      const { errors } = sanitizeCustomerInput({ ...validInput, source_key: '' });
      expect(errors).toContain('source_system and source_key are required');
    });

    test('returns error for missing first_name', () => {
      const { errors } = sanitizeCustomerInput({ ...validInput, first_name: '' });
      expect(errors).toContain('first_name is required');
    });

    test('returns error for missing last_name', () => {
      const { errors } = sanitizeCustomerInput({ ...validInput, last_name: '' });
      expect(errors).toContain('last_name is required');
    });

    test('returns error for missing email', () => {
      const { errors } = sanitizeCustomerInput({ ...validInput, email: '' });
      expect(errors).toContain('email is required');
    });

    test('returns error for invalid email format', () => {
      const { errors } = sanitizeCustomerInput({ ...validInput, email: 'not-an-email' });
      expect(errors).toContain('email format is invalid');
    });

    test('returns error for invalid phone', () => {
      const { errors } = sanitizeCustomerInput({ ...validInput, phone: 'invalid' });
      expect(errors).toContain('phone format is invalid or unrecognized');
    });

    test('allows empty phone', () => {
      const { errors, sanitized } = sanitizeCustomerInput({ ...validInput, phone: '' });
      expect(errors).toHaveLength(0);
      expect(sanitized.phone).toBe('');
    });

    test('allows missing phone', () => {
      const { phone, ...noPhone } = validInput;
      const { errors, sanitized } = sanitizeCustomerInput(noPhone);
      expect(errors).toHaveLength(0);
      expect(sanitized.phone).toBe('');
    });

    test('returns multiple errors at once', () => {
      const { errors } = sanitizeCustomerInput({ source_system: '', source_key: '', first_name: '', last_name: '', email: '' });
      expect(errors.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('sanitizeCustomerUpdate', () => {
    test('sanitizes update fields', () => {
      const { errors, sanitized } = sanitizeCustomerUpdate({
        first_name: '  Sarah  ',
        phone: '(214) 555-1234'
      });
      expect(errors).toHaveLength(0);
      expect(sanitized.first_name).toBe('Sarah');
      expect(sanitized.phone).toBe('+12145551234');
    });

    test('returns error for empty first_name', () => {
      const { errors } = sanitizeCustomerUpdate({ first_name: '' });
      expect(errors).toContain('first_name cannot be empty');
    });

    test('returns error for empty last_name', () => {
      const { errors } = sanitizeCustomerUpdate({ last_name: '' });
      expect(errors).toContain('last_name cannot be empty');
    });

    test('returns error for empty email', () => {
      const { errors } = sanitizeCustomerUpdate({ email: '' });
      expect(errors).toContain('email cannot be empty');
    });

    test('returns error for invalid email format', () => {
      const { errors } = sanitizeCustomerUpdate({ email: 'not-valid' });
      expect(errors).toContain('email format is invalid');
    });

    test('returns error for invalid phone', () => {
      const { errors } = sanitizeCustomerUpdate({ phone: 'invalid' });
      expect(errors).toContain('phone format is invalid or unrecognized');
    });

    test('allows clearing phone with empty string', () => {
      const { errors, sanitized } = sanitizeCustomerUpdate({ phone: '' });
      expect(errors).toHaveLength(0);
      expect(sanitized.phone).toBe('');
    });

    test('sanitizes address in update', () => {
      const { errors, sanitized } = sanitizeCustomerUpdate({ address: { state: ' tx ' } });
      expect(errors).toHaveLength(0);
      expect(sanitized.address.state).toBe('TX');
    });

    test('returns empty sanitized for empty body', () => {
      const { errors, sanitized } = sanitizeCustomerUpdate({});
      expect(errors).toHaveLength(0);
      expect(sanitized).toEqual({});
    });
  });
});
