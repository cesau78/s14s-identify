const mongoose = require('mongoose');
const changeRecordSchema = require('../../src/models/changeRecord');

const ChangeRecordHost = mongoose.model('ChangeRecordTest', new mongoose.Schema({ history: [changeRecordSchema] }));

describe('ChangeRecord Schema', () => {
  test('requires changed_by', () => {
    const doc = new ChangeRecordHost({ history: [{ delta: { foo: 'bar' } }] });
    const err = doc.validateSync();
    expect(err.errors['history.0.changed_by']).toBeDefined();
  });

  test('requires delta', () => {
    const doc = new ChangeRecordHost({ history: [{ changed_by: 'user' }] });
    const err = doc.validateSync();
    expect(err.errors['history.0.delta']).toBeDefined();
  });

  test('defaults changed_at to current date', () => {
    const doc = new ChangeRecordHost({ history: [{ changed_by: 'user', delta: { foo: 'bar' } }] });
    expect(doc.history[0].changed_at).toBeInstanceOf(Date);
  });

  test('stores valid change record', () => {
    const delta = { first_name: { from: 'John', to: 'Jane' } };
    const doc = new ChangeRecordHost({ history: [{ changed_by: 'admin', delta }] });
    expect(doc.history[0].changed_by).toBe('admin');
    expect(doc.history[0].delta.first_name.from).toBe('John');
  });
});
