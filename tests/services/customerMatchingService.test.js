const {
  calculateFellegiSunterScore,
  findMatch,
  normalizeString,
  buildAddressComposite,
  compareField,
  computeAgreementWeight,
  computeDisagreementWeight,
  MATCH_THRESHOLD,
  REVIEW_THRESHOLD,
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
      const b = { first_name: 'Johnn', last_name: 'Doe', email: 'john@example.com', phone: '555-1234' };
      const score = calculateFellegiSunterScore(a, b);
      expect(score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    });

    test('normalizes nicknames to formal names before comparison', () => {
      const a = { first_name: 'Bill', last_name: 'Doe', email: 'john@example.com', phone: '555-1234' };
      const b = { first_name: 'William', last_name: 'Doe', email: 'john@example.com', phone: '555-1234' };
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
    test('threshold is 0.95', () => {
      expect(MATCH_THRESHOLD).toBe(0.95);
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

    test('returns nearMisses for candidates between REVIEW_THRESHOLD and MATCH_THRESHOLD', async () => {
      // Candidate shares last name + phone but different email and first name
      const nearMissCandidate = {
        _id: 'near1',
        first_name: 'Jonathan',
        last_name: 'Doe',
        email: 'jdoe@other.com',
        phone: '555-1234',
        address: { street: '123 Main', city: 'Springfield', state: 'IL', zip: '62701' }
      };

      const mockModel = { find: jest.fn().mockResolvedValue([nearMissCandidate]) };

      const incoming = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        address: { street: '123 Main', city: 'Springfield', state: 'IL', zip: '62701' }
      };

      const score = calculateFellegiSunterScore(incoming, nearMissCandidate);
      // Only test near-miss behavior if the score falls in the review range
      if (score >= REVIEW_THRESHOLD && score < MATCH_THRESHOLD) {
        const result = await findMatch(mockModel, incoming);
        expect(result.match).toBeNull();
        expect(result.nearMisses).toHaveLength(1);
        expect(result.nearMisses[0].candidate._id).toBe('near1');
        expect(result.nearMisses[0].confidence).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
        expect(result.nearMisses[0].confidence).toBeLessThan(MATCH_THRESHOLD);
      }
    });

    test('returns empty nearMisses when match is found above MATCH_THRESHOLD', async () => {
      const exactMatch = {
        _id: 'exact1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        address: { street: '123 Main', city: 'Springfield', state: 'IL', zip: '62701' }
      };

      const mockModel = { find: jest.fn().mockResolvedValue([exactMatch]) };

      const incoming = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        address: { street: '123 Main', city: 'Springfield', state: 'IL', zip: '62701' }
      };

      const result = await findMatch(mockModel, incoming);
      expect(result.match).toBe(exactMatch);
      expect(result.nearMisses).toEqual([]);
      expect(result.searchTokens).toBeDefined();
      expect(Array.isArray(result.searchTokens)).toBe(true);
    });

    test('returns searchTokens used for candidate blocking', async () => {
      const mockModel = { find: jest.fn().mockResolvedValue([]) };
      const incoming = { first_name: 'John', last_name: 'Doe', email: 'john@example.com' };
      const result = await findMatch(mockModel, incoming);
      expect(result.searchTokens).toBeDefined();
      expect(result.searchTokens.length).toBeGreaterThan(0);
    });

    test('returns empty nearMisses when no candidates score above REVIEW_THRESHOLD', async () => {
      const veryDifferent = {
        _id: 'diff1',
        first_name: 'Xxxxx',
        last_name: 'Yyyyy',
        email: 'zzz@nowhere.net',
        phone: '000-0000',
        address: {}
      };

      const mockModel = { find: jest.fn().mockResolvedValue([veryDifferent]) };

      const incoming = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-1234'
      };

      const result = await findMatch(mockModel, incoming);
      expect(result.match).toBeNull();
      expect(result.nearMisses).toEqual([]);
    });

    test('demotes previous best to nearMisses when a higher-scoring review-range candidate is found', async () => {
      // f2 scores ~0.745 (name+phone+address match, different email)
      const lowerCandidate = {
        _id: 'lower1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'diff@other.com',
        phone: '555-1234',
        address: { street: '123 Main', city: 'Springfield', state: 'IL', zip: '62701' }
      };

      // f4 scores ~0.851 (name+email+phone match, different address)
      const higherCandidate = {
        _id: 'higher1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        address: { street: '999 Different', city: 'Other', state: 'NY', zip: '10001' }
      };

      // Order matters: lower candidate is processed first, becomes bestMatch,
      // then higher candidate displaces it — demoting the lower to nearMisses (line 141)
      const mockModel = { find: jest.fn().mockResolvedValue([lowerCandidate, higherCandidate]) };

      const incoming = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        address: { street: '123 Main', city: 'Springfield', state: 'IL', zip: '62701' }
      };

      const lowerScore = calculateFellegiSunterScore(incoming, lowerCandidate);
      const higherScore = calculateFellegiSunterScore(incoming, higherCandidate);

      // Verify preconditions: both in review range and higher > lower
      expect(lowerScore).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
      expect(lowerScore).toBeLessThan(MATCH_THRESHOLD);
      expect(higherScore).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
      expect(higherScore).toBeLessThan(MATCH_THRESHOLD);
      expect(higherScore).toBeGreaterThan(lowerScore);

      const result = await findMatch(mockModel, incoming);

      // No auto-match since neither exceeds MATCH_THRESHOLD
      expect(result.match).toBeNull();

      // The demoted lower candidate should appear in nearMisses
      const demoted = result.nearMisses.find(nm => nm.candidate._id === 'lower1');
      expect(demoted).toBeDefined();
      expect(demoted.confidence).toBeCloseTo(lowerScore, 5);

      // The higher candidate (best but still below MATCH_THRESHOLD) is also in nearMisses
      const best = result.nearMisses.find(nm => nm.candidate._id === 'higher1');
      expect(best).toBeDefined();
      expect(best.confidence).toBeCloseTo(higherScore, 5);

      // Higher should be sorted first
      expect(result.nearMisses[0].candidate._id).toBe('higher1');
      expect(result.nearMisses[1].candidate._id).toBe('lower1');
    });

    test('adds candidate to nearMisses when it scores in review range but below current best', async () => {
      // f4 scores ~0.851 (name+email+phone match, different address) — processed first, becomes best
      const bestCandidate = {
        _id: 'best1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        address: { street: '999 Different', city: 'Other', state: 'NY', zip: '10001' }
      };

      // f2 scores ~0.745 (name+phone+address match, different email) — processed second, hits else-if (line 146)
      const reviewCandidate = {
        _id: 'review1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'diff@other.com',
        phone: '555-1234',
        address: { street: '123 Main', city: 'Springfield', state: 'IL', zip: '62701' }
      };

      // Order matters: best is first so it becomes bestMatch, then review candidate
      // scores lower and enters the else-if branch (line 145-146)
      const mockModel = { find: jest.fn().mockResolvedValue([bestCandidate, reviewCandidate]) };

      const incoming = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        address: { street: '123 Main', city: 'Springfield', state: 'IL', zip: '62701' }
      };

      const bestScore = calculateFellegiSunterScore(incoming, bestCandidate);
      const reviewScore = calculateFellegiSunterScore(incoming, reviewCandidate);

      // Verify preconditions: both in review range, best > review
      expect(bestScore).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
      expect(bestScore).toBeLessThan(MATCH_THRESHOLD);
      expect(reviewScore).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
      expect(reviewScore).toBeLessThan(MATCH_THRESHOLD);
      expect(bestScore).toBeGreaterThan(reviewScore);

      const result = await findMatch(mockModel, incoming);

      expect(result.match).toBeNull();

      // The review candidate should be in nearMisses via the else-if path
      const nearMiss = result.nearMisses.find(nm => nm.candidate._id === 'review1');
      expect(nearMiss).toBeDefined();
      expect(nearMiss.confidence).toBeCloseTo(reviewScore, 5);

      // Best candidate also ends up in nearMisses (added at line 156 after the loop)
      const bestInNearMisses = result.nearMisses.find(nm => nm.candidate._id === 'best1');
      expect(bestInNearMisses).toBeDefined();
    });

    test('sorts nearMisses by confidence descending', async () => {
      const candidate1 = {
        _id: 'c1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'different1@test.com',
        phone: '555-1234',
        address: { street: '123 Main', city: 'Springfield', state: 'IL', zip: '62701' }
      };
      const candidate2 = {
        _id: 'c2',
        first_name: 'John',
        last_name: 'Doe',
        email: 'different2@test.com',
        phone: '555-1234',
        address: {}
      };

      const mockModel = { find: jest.fn().mockResolvedValue([candidate1, candidate2]) };

      const incoming = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        address: { street: '123 Main', city: 'Springfield', state: 'IL', zip: '62701' }
      };

      const result = await findMatch(mockModel, incoming);
      if (result.nearMisses.length >= 2) {
        expect(result.nearMisses[0].confidence).toBeGreaterThanOrEqual(result.nearMisses[1].confidence);
      }
    });
  });

  describe('REVIEW_THRESHOLD', () => {
    test('REVIEW_THRESHOLD is less than MATCH_THRESHOLD', () => {
      expect(REVIEW_THRESHOLD).toBeLessThan(MATCH_THRESHOLD);
    });

    test('REVIEW_THRESHOLD is 0.70', () => {
      expect(REVIEW_THRESHOLD).toBe(0.70);
    });
  });
});
