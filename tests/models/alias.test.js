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
});
