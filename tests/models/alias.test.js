const mongoose = require('mongoose');
const aliasSchema = require('../../src/models/alias');

const Alias = mongoose.model('AliasTest', new mongoose.Schema({ aliases: [aliasSchema] }));

describe('Alias Schema', () => {
  test('requires source_system', () => {
    const doc = new Alias({ aliases: [{ source_key: 'KEY', original_payload: {}, added_by: 'user' }] });
    const err = doc.validateSync();
    expect(err.errors['aliases.0.source_system']).toBeDefined();
  });

  test('requires source_key', () => {
    const doc = new Alias({ aliases: [{ source_system: 'SYS', original_payload: {}, added_by: 'user' }] });
    const err = doc.validateSync();
    expect(err.errors['aliases.0.source_key']).toBeDefined();
  });

  test('requires original_payload', () => {
    const doc = new Alias({ aliases: [{ source_system: 'SYS', source_key: 'KEY', added_by: 'user' }] });
    const err = doc.validateSync();
    expect(err.errors['aliases.0.original_payload']).toBeDefined();
  });

  test('requires added_by', () => {
    const doc = new Alias({ aliases: [{ source_system: 'SYS', source_key: 'KEY', original_payload: {} }] });
    const err = doc.validateSync();
    expect(err.errors['aliases.0.added_by']).toBeDefined();
  });

  test('defaults match_confidence to null', () => {
    const doc = new Alias({ aliases: [{ source_system: 'SYS', source_key: 'KEY', original_payload: {}, added_by: 'user' }] });
    expect(doc.aliases[0].match_confidence).toBeNull();
  });

  test('defaults match_algorithm to null', () => {
    const doc = new Alias({ aliases: [{ source_system: 'SYS', source_key: 'KEY', original_payload: {}, added_by: 'user' }] });
    expect(doc.aliases[0].match_algorithm).toBeNull();
  });

  test('stores match_confidence and match_algorithm', () => {
    const doc = new Alias({ aliases: [{
      source_system: 'CRM',
      source_key: 'CRM-001',
      original_payload: {},
      added_by: 'user',
      match_confidence: 0.998,
      match_algorithm: 'fellegi-sunter'
    }] });
    expect(doc.aliases[0].match_confidence).toBe(0.998);
    expect(doc.aliases[0].match_algorithm).toBe('fellegi-sunter');
  });

  test('defaults source_of_truth to false', () => {
    const doc = new Alias({ aliases: [{ source_system: 'SYS', source_key: 'KEY', original_payload: {}, added_by: 'user' }] });
    expect(doc.aliases[0].source_of_truth).toBe(false);
  });

  test('defaults effective_date to current date', () => {
    const before = new Date();
    const doc = new Alias({ aliases: [{ source_system: 'SYS', source_key: 'KEY', original_payload: {}, added_by: 'user' }] });
    const after = new Date();
    expect(doc.aliases[0].effective_date.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(doc.aliases[0].effective_date.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  test('stores customer fields on alias', () => {
    const doc = new Alias({ aliases: [{
      source_system: 'CRM',
      source_key: 'CRM-001',
      original_payload: {},
      added_by: 'user',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      phone: '+12145551234',
      address: { street: '123 Main ST', city: 'Springfield', state: 'IL', zip: '62701' },
      source_of_truth: true,
      effective_date: new Date('2025-06-15')
    }] });
    expect(doc.aliases[0].first_name).toBe('John');
    expect(doc.aliases[0].last_name).toBe('Doe');
    expect(doc.aliases[0].email).toBe('john@example.com');
    expect(doc.aliases[0].phone).toBe('+12145551234');
    expect(doc.aliases[0].address.street).toBe('123 Main ST');
    expect(doc.aliases[0].source_of_truth).toBe(true);
    expect(doc.aliases[0].effective_date).toEqual(new Date('2025-06-15'));
  });
});
