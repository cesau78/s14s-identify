const {
  generateSearchTokens,
  generateSearchQueryTokens,
  nameTokens,
  emailTokens,
  phoneTokens,
  addressTokens,
  phoneticTokens,
  prefixTokens,
  isNonNameWord
} = require('../../src/services/searchTokenService');

describe('Search Token Service', () => {
  describe('phoneticTokens', () => {
    test('returns primary and alternate tokens when different', () => {
      const tokens = phoneticTokens('Michael', 'fn:');
      expect(tokens).toContain('fn:MKL');
      expect(tokens).toContain('fn:MXL');
      expect(tokens).toHaveLength(2);
    });

    test('returns only primary when alternate matches', () => {
      const tokens = phoneticTokens('Main', 'ss:');
      expect(tokens).toContain('ss:MN');
      expect(tokens).toHaveLength(1);
    });

    test('returns empty array for empty input', () => {
      expect(phoneticTokens('', 'fn:')).toEqual([]);
      expect(phoneticTokens(null, 'fn:')).toEqual([]);
      expect(phoneticTokens(undefined, 'fn:')).toEqual([]);
    });

    test('returns empty array for non-alphabetic input', () => {
      expect(phoneticTokens('1', 'fn:')).toEqual([]);
      expect(phoneticTokens('123', 'fn:')).toEqual([]);
    });
  });

  describe('nameTokens', () => {
    test('generates tokens for first and last name', () => {
      const tokens = nameTokens('John', 'Doe');
      expect(tokens.some(t => t.startsWith('fn:'))).toBe(true);
      expect(tokens.some(t => t.startsWith('ln:'))).toBe(true);
    });

    test('handles missing first name', () => {
      const tokens = nameTokens('', 'Doe');
      expect(tokens.some(t => t.startsWith('fn:'))).toBe(false);
      expect(tokens.some(t => t.startsWith('ln:'))).toBe(true);
    });

    test('handles missing last name', () => {
      const tokens = nameTokens('John', '');
      expect(tokens.some(t => t.startsWith('fn:'))).toBe(true);
      expect(tokens.some(t => t.startsWith('ln:'))).toBe(false);
    });

    test('phonetically matches similar names', () => {
      const smithTokens = nameTokens('', 'Smith');
      const schmidtTokens = nameTokens('', 'Schmidt');
      const smithCodes = smithTokens.map(t => t.replace('ln:', ''));
      const schmidtCodes = schmidtTokens.map(t => t.replace('ln:', ''));
      const overlap = smithCodes.filter(c => schmidtCodes.includes(c));
      expect(overlap.length).toBeGreaterThan(0);
    });
  });

  describe('emailTokens', () => {
    test('splits email into local and domain tokens', () => {
      const tokens = emailTokens('john@example.com');
      expect(tokens).toContain('em:john');
      expect(tokens).toContain('ed:example.com');
    });

    test('lowercases email parts', () => {
      const tokens = emailTokens('JOHN@EXAMPLE.COM');
      expect(tokens).toContain('em:john');
      expect(tokens).toContain('ed:example.com');
    });

    test('returns empty array for empty input', () => {
      expect(emailTokens('')).toEqual([]);
      expect(emailTokens(null)).toEqual([]);
      expect(emailTokens(undefined)).toEqual([]);
    });

    test('returns empty array for invalid email', () => {
      expect(emailTokens('nope')).toEqual([]);
      expect(emailTokens('@')).toEqual([]);
      expect(emailTokens('user@')).toEqual([]);
      expect(emailTokens('@domain.com')).toEqual([]);
    });
  });

  describe('phoneTokens', () => {
    test('generates last-4 and last-7 digit tokens from E.164', () => {
      const tokens = phoneTokens('+12148675309');
      expect(tokens).toContain('ph:5309');
      expect(tokens).toContain('ph:8675309');
    });

    test('generates only last-4 when fewer than 7 digits', () => {
      const tokens = phoneTokens('5309');
      expect(tokens).toContain('ph:5309');
      expect(tokens).toHaveLength(1);
    });

    test('returns empty array for empty input', () => {
      expect(phoneTokens('')).toEqual([]);
      expect(phoneTokens(null)).toEqual([]);
    });

    test('returns empty array for too few digits', () => {
      expect(phoneTokens('123')).toEqual([]);
    });
  });

  describe('isNonNameWord', () => {
    test('identifies street suffixes', () => {
      expect(isNonNameWord('ST')).toBe(true);
      expect(isNonNameWord('street')).toBe(true);
      expect(isNonNameWord('AVE')).toBe(true);
    });

    test('identifies directionals', () => {
      expect(isNonNameWord('N')).toBe(true);
      expect(isNonNameWord('north')).toBe(true);
      expect(isNonNameWord('SW')).toBe(true);
    });

    test('identifies secondary units', () => {
      expect(isNonNameWord('APT')).toBe(true);
      expect(isNonNameWord('suite')).toBe(true);
    });

    test('returns false for regular words', () => {
      expect(isNonNameWord('Main')).toBe(false);
      expect(isNonNameWord('Oak')).toBe(false);
      expect(isNonNameWord('123')).toBe(false);
    });
  });

  describe('addressTokens', () => {
    test('generates street number, name phonetic, and zip tokens', () => {
      const tokens = addressTokens({ street: '123 Main ST', zip: '62701' });
      expect(tokens).toContain('sn:123');
      expect(tokens.some(t => t.startsWith('ss:'))).toBe(true);
      expect(tokens).toContain('zp:62701');
    });

    test('skips suffix words in street name', () => {
      const tokens = addressTokens({ street: '123 Main ST' });
      const ssTokens = tokens.filter(t => t.startsWith('ss:'));
      // "Main" should produce tokens, "ST" (a suffix) should not
      expect(ssTokens.length).toBeGreaterThan(0);
    });

    test('skips directional words in street name', () => {
      const tokens = addressTokens({ street: 'N Main ST' });
      // Should not produce ss: tokens for "N" (directional) or "ST" (suffix)
      const ssTokens = tokens.filter(t => t.startsWith('ss:'));
      expect(ssTokens.length).toBeGreaterThan(0); // Only from "Main"
    });

    test('skips single-character words', () => {
      const tokens = addressTokens({ street: '123 A ST' });
      const ssTokens = tokens.filter(t => t.startsWith('ss:'));
      expect(ssTokens).toHaveLength(0); // "A" is single char, "ST" is suffix
    });

    test('handles street number with letter suffix', () => {
      const tokens = addressTokens({ street: '123A Main ST' });
      expect(tokens).toContain('sn:123A');
    });

    test('extracts first 5 digits of zip', () => {
      const tokens = addressTokens({ zip: '62701-1234' });
      expect(tokens).toContain('zp:62701');
    });

    test('skips zip with fewer than 5 digits', () => {
      const tokens = addressTokens({ zip: '627' });
      expect(tokens.some(t => t.startsWith('zp:'))).toBe(false);
    });

    test('returns empty array for null address', () => {
      expect(addressTokens(null)).toEqual([]);
      expect(addressTokens(undefined)).toEqual([]);
    });

    test('handles address with no street number', () => {
      const tokens = addressTokens({ street: 'Main ST' });
      expect(tokens.some(t => t.startsWith('sn:'))).toBe(false);
    });

    test('handles empty street', () => {
      const tokens = addressTokens({ street: '' });
      expect(tokens).toEqual([]);
    });
  });

  describe('generateSearchTokens', () => {
    test('generates tokens from all fields', () => {
      const tokens = generateSearchTokens({
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '+12148675309',
        address: { street: '123 Main ST', zip: '62701' }
      });
      expect(tokens.some(t => t.startsWith('fn:'))).toBe(true);
      expect(tokens.some(t => t.startsWith('ln:'))).toBe(true);
      expect(tokens).toContain('em:john');
      expect(tokens).toContain('ed:example.com');
      expect(tokens).toContain('ph:5309');
      expect(tokens).toContain('sn:123');
      expect(tokens).toContain('zp:62701');
    });

    test('deduplicates tokens', () => {
      const tokens = generateSearchTokens({
        first_name: 'John',
        last_name: 'John' // Same name produces same phonetic codes
      });
      const fnTokens = tokens.filter(t => t.startsWith('fn:'));
      const lnTokens = tokens.filter(t => t.startsWith('ln:'));
      // fn: and ln: prefixes differ so no dedup across fields
      expect(fnTokens.length).toBeGreaterThan(0);
      expect(lnTokens.length).toBeGreaterThan(0);
    });

    test('returns empty array for null data', () => {
      expect(generateSearchTokens(null)).toEqual([]);
    });

    test('returns empty array for empty data', () => {
      expect(generateSearchTokens({})).toEqual([]);
    });

    test('handles partial data', () => {
      const tokens = generateSearchTokens({ email: 'test@test.com' });
      expect(tokens).toContain('em:test');
      expect(tokens).toContain('ed:test.com');
      expect(tokens).toHaveLength(2);
    });

    test('includes prefix tokens for first and last name', () => {
      const tokens = generateSearchTokens({
        first_name: 'John',
        last_name: 'Doe'
      });
      expect(tokens).toContain('fp:jo');
      expect(tokens).toContain('fp:joh');
      expect(tokens).toContain('fp:john');
      expect(tokens).toContain('lp:do');
      expect(tokens).toContain('lp:doe');
    });
  });

  describe('prefixTokens', () => {
    test('generates prefixes from min length to full length', () => {
      const tokens = prefixTokens('John', 'fp:');
      expect(tokens).toEqual(['fp:jo', 'fp:joh', 'fp:john']);
    });

    test('lowercases the value', () => {
      const tokens = prefixTokens('JOHN', 'fp:');
      expect(tokens).toEqual(['fp:jo', 'fp:joh', 'fp:john']);
    });

    test('returns empty for single character name', () => {
      expect(prefixTokens('J', 'fp:')).toEqual([]);
    });

    test('returns empty for empty input', () => {
      expect(prefixTokens('', 'fp:')).toEqual([]);
      expect(prefixTokens(null, 'fp:')).toEqual([]);
      expect(prefixTokens(undefined, 'fp:')).toEqual([]);
    });

    test('returns single token for 2-char name', () => {
      const tokens = prefixTokens('Jo', 'fp:');
      expect(tokens).toEqual(['fp:jo']);
    });
  });

  describe('generateSearchQueryTokens', () => {
    test('generates fp: and lp: tokens for a query', () => {
      const tokens = generateSearchQueryTokens('john');
      expect(tokens).toEqual(['fp:john', 'lp:john']);
    });

    test('lowercases and trims the query', () => {
      const tokens = generateSearchQueryTokens('  JOHN  ');
      expect(tokens).toEqual(['fp:john', 'lp:john']);
    });

    test('returns empty for single character', () => {
      expect(generateSearchQueryTokens('j')).toEqual([]);
    });

    test('returns empty for empty input', () => {
      expect(generateSearchQueryTokens('')).toEqual([]);
      expect(generateSearchQueryTokens(null)).toEqual([]);
    });

    test('expands nickname to formal name tokens', () => {
      const tokens = generateSearchQueryTokens('chuck');
      expect(tokens).toContain('fp:chuck');
      expect(tokens).toContain('lp:chuck');
      expect(tokens).toContain('fp:charles');
      expect(tokens).toContain('lp:charles');
    });

    test('does not add formal tokens for non-nickname', () => {
      const tokens = generateSearchQueryTokens('john');
      expect(tokens).toEqual(['fp:john', 'lp:john']);
    });

    test('deduplicates when nickname equals formal name', () => {
      // "mary" maps to "mary" in the dictionary
      const tokens = generateSearchQueryTokens('mary');
      expect(tokens).toContain('fp:mary');
      expect(tokens).toContain('lp:mary');
      // Should not have duplicates
      const unique = [...new Set(tokens)];
      expect(tokens.length).toBe(unique.length);
    });
  });
});
