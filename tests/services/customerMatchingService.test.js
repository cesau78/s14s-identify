const {
  calculateConfidence,
  findMatch,
  normalizeString,
  buildAddressComposite,
  MATCH_THRESHOLD
} = require('../../src/services/customerMatchingService');

describe('Customer Matching Service', () => {
  describe('normalizeString', () => {
    test('trims and lowercases a string', () => {
      expect(normalizeString('  Hello World  ')).toBe('hello world');
    });

    test('returns empty string for null/undefined', () => {
      expect(normalizeString(null)).toBe('');
      expect(normalizeString(undefined)).toBe('');
    });

    test('converts numbers to string', () => {
      expect(normalizeString(123)).toBe('123');
    });
  });

  describe('buildAddressComposite', () => {
    test('builds composite from address fields', () => {
      const address = { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701' };
      expect(buildAddressComposite(address)).toBe('123 main st springfield il 62701');
    });

    test('returns empty string for null address', () => {
      expect(buildAddressComposite(null)).toBe('');
    });

    test('handles partial address', () => {
      const address = { city: 'Springfield', state: 'IL' };
      expect(buildAddressComposite(address)).toBe('springfield il');
    });
  });

  describe('calculateConfidence', () => {
    test('returns 1.0 for identical records', () => {
      const record = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        address: { street: '123 Main', city: 'Springfield', state: 'IL', zip: '62701' }
      };
      expect(calculateConfidence(record, record)).toBe(1);
    });

    test('returns 0 for completely different records', () => {
      const a = { first_name: 'John', last_name: 'Doe', email: 'john@example.com' };
      const b = { first_name: 'Xxxxx', last_name: 'Yyyyy', email: 'zzz@nowhere.net' };
      const confidence = calculateConfidence(a, b);
      expect(confidence).toBeLessThan(MATCH_THRESHOLD);
    });

    test('returns high confidence for nearly identical records', () => {
      const a = { first_name: 'John', last_name: 'Doe', email: 'john.doe@example.com', phone: '555-1234' };
      const b = { first_name: 'John', last_name: 'Doe', email: 'john.doe@example.com', phone: '555-1234' };
      expect(calculateConfidence(a, b)).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    });

    test('returns 0 when both records have no data', () => {
      expect(calculateConfidence({}, {})).toBe(0);
    });

    test('handles one side having a field the other does not', () => {
      const a = { first_name: 'John', last_name: 'Doe', email: 'john@example.com' };
      const b = { first_name: 'John', last_name: 'Doe', email: '' };
      const confidence = calculateConfidence(a, b);
      expect(confidence).toBeLessThan(1);
    });
  });

  describe('MATCH_THRESHOLD', () => {
    test('threshold is 0.997', () => {
      expect(MATCH_THRESHOLD).toBe(0.997);
    });
  });

  describe('findMatch', () => {
    test('returns match when confidence >= threshold', async () => {
      const existingCustomer = {
        _id: 'abc123',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        address: { street: '123 Main', city: 'Springfield', state: 'IL', zip: '62701' }
      };

      const mockModel = {
        find: jest.fn().mockResolvedValue([existingCustomer])
      };

      const incoming = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        address: { street: '123 Main', city: 'Springfield', state: 'IL', zip: '62701' }
      };

      const result = await findMatch(mockModel, incoming);
      expect(result.match).toBe(existingCustomer);
      expect(result.confidence).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    });

    test('returns null match when confidence < threshold', async () => {
      const existingCustomer = {
        _id: 'abc123',
        first_name: 'Alice',
        last_name: 'Smith',
        email: 'alice@other.com',
        phone: '999-9999',
        address: { street: '456 Oak', city: 'Chicago', state: 'IL', zip: '60601' }
      };

      const mockModel = {
        find: jest.fn().mockResolvedValue([existingCustomer])
      };

      const incoming = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-1234'
      };

      const result = await findMatch(mockModel, incoming);
      expect(result.match).toBeNull();
    });

    test('returns null match when no candidates exist', async () => {
      const mockModel = {
        find: jest.fn().mockResolvedValue([])
      };

      const result = await findMatch(mockModel, { first_name: 'John', last_name: 'Doe', email: 'john@example.com' });
      expect(result.match).toBeNull();
      expect(result.confidence).toBe(0);
    });

    test('selects the best match from multiple candidates', async () => {
      const candidates = [
        { _id: '1', first_name: 'Alice', last_name: 'Smith', email: 'alice@test.com', phone: '', address: {} },
        { _id: '2', first_name: 'John', last_name: 'Doe', email: 'john@example.com', phone: '555-1234', address: { street: '123 Main', city: 'Springfield', state: 'IL', zip: '62701' } }
      ];

      const mockModel = { find: jest.fn().mockResolvedValue(candidates) };

      const incoming = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        address: { street: '123 Main', city: 'Springfield', state: 'IL', zip: '62701' }
      };

      const result = await findMatch(mockModel, incoming);
      expect(result.match._id).toBe('2');
    });

    test('skips candidates with lower confidence than current best', async () => {
      const candidates = [
        { _id: '1', first_name: 'John', last_name: 'Doe', email: 'john@example.com', phone: '555-1234', address: {} },
        { _id: '2', first_name: 'Xxxx', last_name: 'Yyyy', email: 'zzzz@nowhere.net', phone: '000-0000', address: {} }
      ];

      const mockModel = { find: jest.fn().mockResolvedValue(candidates) };

      const incoming = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-1234'
      };

      const result = await findMatch(mockModel, incoming);
      expect(result.match._id).toBe('1');
    });
  });
});
