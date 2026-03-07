const {
  calculateFellegiSunterScore,
  findMatch,
  normalizeString,
  buildAddressComposite,
  compareField,
  computeAgreementWeight,
  computeDisagreementWeight,
  MATCH_THRESHOLD,
  FIELD_CONFIG
} = require('../../src/services/customerMatchingService');

describe('Customer Matching Service (Fellegi-Sunter)', () => {
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

  describe('computeAgreementWeight', () => {
    test('returns positive weight for m >> u', () => {
      const weight = computeAgreementWeight(0.95, 0.005);
      expect(weight).toBeGreaterThan(0);
    });

    test('higher m/u ratio produces larger weight', () => {
      const emailWeight = computeAgreementWeight(0.90, 0.0001);
      const nameWeight = computeAgreementWeight(0.95, 0.005);
      expect(emailWeight).toBeGreaterThan(nameWeight);
    });
  });

  describe('computeDisagreementWeight', () => {
    test('returns negative weight when m is high', () => {
      const weight = computeDisagreementWeight(0.95, 0.005);
      expect(weight).toBeLessThan(0);
    });
  });

  describe('compareField', () => {
    test('returns null when both values are empty', () => {
      const config = FIELD_CONFIG.first_name;
      expect(compareField('', '', config)).toBeNull();
    });

    test('returns false when one value is empty', () => {
      const config = FIELD_CONFIG.first_name;
      expect(compareField('john', '', config)).toBe(false);
      expect(compareField('', 'john', config)).toBe(false);
    });

    test('uses Jaro-Winkler for name fields', () => {
      const config = FIELD_CONFIG.first_name;
      expect(compareField('john', 'john', config)).toBe(true);
      expect(compareField('john', 'jon', config)).toBe(true); // close enough for JW
      expect(compareField('john', 'xxxxxx', config)).toBe(false);
    });

    test('uses exact match for email', () => {
      const config = FIELD_CONFIG.email;
      expect(compareField('john@example.com', 'john@example.com', config)).toBe(true);
      expect(compareField('john@example.com', 'jon@example.com', config)).toBe(false);
    });

    test('uses exact match for phone', () => {
      const config = FIELD_CONFIG.phone;
      expect(compareField('555-1234', '555-1234', config)).toBe(true);
      expect(compareField('555-1234', '555-1235', config)).toBe(false);
    });

    test('uses Jaro-Winkler for address with lower threshold', () => {
      const config = FIELD_CONFIG.address_composite;
      expect(compareField('123 main st springfield il', '123 main st springfield il', config)).toBe(true);
      expect(compareField('123 main st springfield il', '456 oak ave chicago ny', config)).toBe(false);
    });
  });

  describe('FIELD_CONFIG', () => {
    test('has expected fields defined', () => {
      expect(FIELD_CONFIG.first_name).toBeDefined();
      expect(FIELD_CONFIG.last_name).toBeDefined();
      expect(FIELD_CONFIG.email).toBeDefined();
      expect(FIELD_CONFIG.phone).toBeDefined();
      expect(FIELD_CONFIG.address_composite).toBeDefined();
    });

    test('all fields have m, u, compare, and similarityThreshold', () => {
      for (const [, config] of Object.entries(FIELD_CONFIG)) {
        expect(config.m).toBeGreaterThan(0);
        expect(config.u).toBeGreaterThan(0);
        expect(config.m).toBeGreaterThan(config.u);
        expect(['exact', 'jaroWinkler']).toContain(config.compare);
        expect(config.similarityThreshold).toBeDefined();
      }
    });
  });

  describe('calculateFellegiSunterScore', () => {
    test('returns 1.0 for identical records', () => {
      const record = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        address: { street: '123 Main', city: 'Springfield', state: 'IL', zip: '62701' }
      };
      expect(calculateFellegiSunterScore(record, record)).toBe(1);
    });

    test('returns low score for completely different records', () => {
      const a = { first_name: 'John', last_name: 'Doe', email: 'john@example.com' };
      const b = { first_name: 'Xxxxx', last_name: 'Yyyyy', email: 'zzz@nowhere.net' };
      const score = calculateFellegiSunterScore(a, b);
      expect(score).toBeLessThan(MATCH_THRESHOLD);
    });

    test('returns high score for matching records with minor name variation', () => {
      const a = { first_name: 'John', last_name: 'Doe', email: 'john@example.com', phone: '555-1234' };
      const b = { first_name: 'Jon', last_name: 'Doe', email: 'john@example.com', phone: '555-1234' };
      const score = calculateFellegiSunterScore(a, b);
      expect(score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    });

    test('returns 0 when both records have no data', () => {
      expect(calculateFellegiSunterScore({}, {})).toBe(0);
    });

    test('penalizes when one side is missing a field', () => {
      const a = { first_name: 'John', last_name: 'Doe', email: 'john@example.com' };
      const b = { first_name: 'John', last_name: 'Doe', email: '' };
      const score = calculateFellegiSunterScore(a, b);
      expect(score).toBeLessThan(1);
    });

    test('email disagreement heavily penalizes score', () => {
      const base = { first_name: 'John', last_name: 'Doe', phone: '555-1234' };
      const sameEmail = calculateFellegiSunterScore(
        { ...base, email: 'john@example.com' },
        { ...base, email: 'john@example.com' }
      );
      const diffEmail = calculateFellegiSunterScore(
        { ...base, email: 'john@example.com' },
        { ...base, email: 'different@other.com' }
      );
      expect(sameEmail - diffEmail).toBeGreaterThan(0.25);
    });
  });

  describe('MATCH_THRESHOLD', () => {
    test('threshold is 0.997', () => {
      expect(MATCH_THRESHOLD).toBe(0.997);
    });
  });

  describe('findMatch', () => {
    test('returns match when score >= threshold', async () => {
      const existingCustomer = {
        _id: 'abc123',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        address: { street: '123 Main', city: 'Springfield', state: 'IL', zip: '62701' }
      };

      const mockModel = { find: jest.fn().mockResolvedValue([existingCustomer]) };

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
      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ search_tokens: { $in: expect.any(Array) }, deleted_at: null })
      );
    });

    test('returns null match when score < threshold', async () => {
      const existingCustomer = {
        _id: 'abc123',
        first_name: 'Alice',
        last_name: 'Smith',
        email: 'alice@other.com',
        phone: '999-9999',
        address: { street: '456 Oak', city: 'Chicago', state: 'IL', zip: '60601' }
      };

      const mockModel = { find: jest.fn().mockResolvedValue([existingCustomer]) };

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
      const mockModel = { find: jest.fn().mockResolvedValue([]) };

      const result = await findMatch(mockModel, { first_name: 'John', last_name: 'Doe', email: 'john@example.com' });
      expect(result.match).toBeNull();
      expect(result.confidence).toBe(0);
    });

    test('skips query when no tokens can be generated', async () => {
      const mockModel = { find: jest.fn().mockResolvedValue([]) };

      const result = await findMatch(mockModel, {});
      expect(result.match).toBeNull();
      expect(result.confidence).toBe(0);
      expect(mockModel.find).not.toHaveBeenCalled();
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
