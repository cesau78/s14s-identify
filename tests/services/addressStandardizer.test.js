const {
  standardizeStreet,
  standardizeCity,
  standardizeState,
  standardizeZip,
  standardizeAddress,
  STREET_SUFFIXES,
  DIRECTIONALS,
  SECONDARY_UNITS
} = require('../../src/services/addressStandardizer');

describe('Address Standardizer (USPS Pub 28)', () => {
  describe('standardizeStreet', () => {
    test('standardizes common street suffixes', () => {
      expect(standardizeStreet('123 Main Street')).toBe('123 Main ST');
      expect(standardizeStreet('456 Oak Avenue')).toBe('456 Oak AVE');
      expect(standardizeStreet('789 Elm Boulevard')).toBe('789 Elm BLVD');
      expect(standardizeStreet('100 Walnut Drive')).toBe('100 Walnut DR');
      expect(standardizeStreet('200 Cedar Lane')).toBe('200 Cedar LN');
      expect(standardizeStreet('300 Maple Court')).toBe('300 Maple CT');
      expect(standardizeStreet('400 Birch Road')).toBe('400 Birch RD');
      expect(standardizeStreet('500 Willow Place')).toBe('500 Willow PL');
    });

    test('standardizes directional prefixes', () => {
      expect(standardizeStreet('North Main Street')).toBe('N Main ST');
      expect(standardizeStreet('South Oak Avenue')).toBe('S Oak AVE');
      expect(standardizeStreet('East Elm Boulevard')).toBe('E Elm BLVD');
      expect(standardizeStreet('West Walnut Drive')).toBe('W Walnut DR');
    });

    test('standardizes directional suffixes', () => {
      expect(standardizeStreet('123 Main Street North')).toBe('123 Main ST N');
      expect(standardizeStreet('456 Oak Avenue Southwest')).toBe('456 Oak AVE SW');
    });

    test('standardizes secondary unit designators', () => {
      expect(standardizeStreet('123 Main Street Apartment 4')).toBe('123 Main ST APT 4');
      expect(standardizeStreet('456 Oak Avenue Suite 200')).toBe('456 Oak AVE STE 200');
      expect(standardizeStreet('789 Elm Boulevard Unit 3B')).toBe('789 Elm BLVD UNIT 3B');
      expect(standardizeStreet('100 Walnut Drive Floor 2')).toBe('100 Walnut DR FL 2');
    });

    test('removes trailing periods', () => {
      expect(standardizeStreet('123 Main St.')).toBe('123 Main ST');
      expect(standardizeStreet('456 Oak Ave.')).toBe('456 Oak AVE');
    });

    test('normalizes multiple spaces', () => {
      expect(standardizeStreet('123   Main    Street')).toBe('123 Main ST');
    });

    test('returns empty string for empty/null input', () => {
      expect(standardizeStreet('')).toBe('');
      expect(standardizeStreet(null)).toBe('');
      expect(standardizeStreet(undefined)).toBe('');
    });

    test('preserves original casing for names and numbers', () => {
      expect(standardizeStreet('123 McArthur Boulevard')).toBe('123 McArthur BLVD');
    });

    test('does not modify first word if not a directional', () => {
      expect(standardizeStreet('123 Main Street')).toBe('123 Main ST');
    });

    test('standardizes suffix abbreviations', () => {
      expect(standardizeStreet('123 Main St')).toBe('123 Main ST');
      expect(standardizeStreet('456 Oak Ave')).toBe('456 Oak AVE');
      expect(standardizeStreet('789 Elm Blvd')).toBe('789 Elm BLVD');
    });
  });

  describe('standardizeCity', () => {
    test('trims and normalizes spaces', () => {
      expect(standardizeCity('  Springfield  ')).toBe('Springfield');
      expect(standardizeCity('San  Francisco')).toBe('San Francisco');
    });

    test('returns empty string for empty/null input', () => {
      expect(standardizeCity('')).toBe('');
      expect(standardizeCity(null)).toBe('');
      expect(standardizeCity(undefined)).toBe('');
    });
  });

  describe('standardizeState', () => {
    test('uppercases and trims', () => {
      expect(standardizeState(' il ')).toBe('IL');
      expect(standardizeState('tx')).toBe('TX');
    });

    test('returns empty string for empty/null input', () => {
      expect(standardizeState('')).toBe('');
      expect(standardizeState(null)).toBe('');
      expect(standardizeState(undefined)).toBe('');
    });
  });

  describe('standardizeZip', () => {
    test('accepts 5-digit ZIP', () => {
      expect(standardizeZip('62701')).toBe('62701');
    });

    test('formats ZIP+4 with dash', () => {
      expect(standardizeZip('62701-1234')).toBe('62701-1234');
    });

    test('adds dash to ZIP+4 without dash', () => {
      expect(standardizeZip('627011234')).toBe('62701-1234');
    });

    test('strips spaces from ZIP', () => {
      expect(standardizeZip(' 62701 ')).toBe('62701');
    });

    test('returns cleaned value for non-standard format', () => {
      expect(standardizeZip('ABC')).toBe('ABC');
    });

    test('returns empty string for empty/null input', () => {
      expect(standardizeZip('')).toBe('');
      expect(standardizeZip(null)).toBe('');
      expect(standardizeZip(undefined)).toBe('');
    });
  });

  describe('standardizeAddress', () => {
    test('standardizes all fields', () => {
      const result = standardizeAddress({
        street: '123 Main Street',
        city: '  Springfield  ',
        state: 'il',
        zip: '627011234'
      });
      expect(result.street).toBe('123 Main ST');
      expect(result.city).toBe('Springfield');
      expect(result.state).toBe('IL');
      expect(result.zip).toBe('62701-1234');
    });

    test('returns empty object for null', () => {
      expect(standardizeAddress(null)).toEqual({});
    });

    test('returns empty object for non-object', () => {
      expect(standardizeAddress('string')).toEqual({});
    });

    test('handles partial address', () => {
      const result = standardizeAddress({ city: 'Chicago' });
      expect(result).toEqual({ city: 'Chicago' });
    });

    test('converts field values to strings', () => {
      const result = standardizeAddress({ zip: 62701 });
      expect(result.zip).toBe('62701');
    });
  });

  describe('lookup tables', () => {
    test('STREET_SUFFIXES contains common entries', () => {
      expect(STREET_SUFFIXES.street).toBe('ST');
      expect(STREET_SUFFIXES.avenue).toBe('AVE');
      expect(STREET_SUFFIXES.boulevard).toBe('BLVD');
    });

    test('DIRECTIONALS contains all cardinal and intercardinal directions', () => {
      expect(DIRECTIONALS.north).toBe('N');
      expect(DIRECTIONALS.south).toBe('S');
      expect(DIRECTIONALS.east).toBe('E');
      expect(DIRECTIONALS.west).toBe('W');
      expect(DIRECTIONALS.northeast).toBe('NE');
      expect(DIRECTIONALS.southwest).toBe('SW');
    });

    test('SECONDARY_UNITS contains common entries', () => {
      expect(SECONDARY_UNITS.apartment).toBe('APT');
      expect(SECONDARY_UNITS.suite).toBe('STE');
      expect(SECONDARY_UNITS.unit).toBe('UNIT');
    });
  });
});
