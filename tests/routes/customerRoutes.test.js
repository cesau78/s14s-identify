const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../src/app');
const Customer = require('../../src/models/customer');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await Customer.deleteMany({});
});

const validCustomerPayload = {
  first_name: 'John',
  last_name: 'Doe',
  email: 'john.doe@example.com',
  phone: '(214) 555-1234',
  address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701' },
  source_system: 'CRM',
  source_key: 'CRM-001'
};

describe('POST /customers', () => {
  test('creates a new customer and returns 201', async () => {
    const res = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    expect(res.status).toBe(201);
    expect(res.body.first_name).toBe('John');
    expect(res.body.last_name).toBe('Doe');
    expect(res.body.aliases).toBeUndefined();
    expect(res.body.created_by).toBe('tester');
  });

  test('matches existing customer and returns 200', async () => {
    await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const res = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester-2')
      .send({
        ...validCustomerPayload,
        source_system: 'ERP',
        source_key: 'ERP-001'
      });

    expect(res.status).toBe(200);
    expect(res.body.aliases).toBeUndefined();
    expect(res.body.updated_by).toBe('tester-2');

    // Verify aliases were added via child resource
    const aliasRes = await request(app).get(`/customers/${res.body._id}/aliases`);
    expect(aliasRes.body).toHaveLength(2);
    expect(aliasRes.body[1].source_system).toBe('ERP');
    expect(aliasRes.body[1].match_confidence).toBeGreaterThanOrEqual(0.997);
    expect(aliasRes.body[1].match_algorithm).toBe('fellegi-sunter');
  });

  test('returns 400 when source_system is missing', async () => {
    const { source_system, ...payload } = validCustomerPayload;
    const res = await request(app)
      .post('/customers')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.stringMatching(/source_system/)]));
  });

  test('returns 400 when source_key is missing', async () => {
    const { source_key, ...payload } = validCustomerPayload;
    const res = await request(app)
      .post('/customers')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.stringMatching(/source_key/)]));
  });

  test('returns 400 when required customer fields are missing', async () => {
    const res = await request(app)
      .post('/customers')
      .send({ source_system: 'CRM', source_key: '001' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.stringMatching(/first_name/)]));
  });

  test('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/customers')
      .send({ ...validCustomerPayload, email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.stringMatching(/email format/)]));
  });

  test('returns 400 for invalid phone format', async () => {
    const res = await request(app)
      .post('/customers')
      .send({ ...validCustomerPayload, phone: 'invalid-phone' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.stringMatching(/phone format/)]));
  });

  test('normalizes phone to E.164 format', async () => {
    const res = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    expect(res.status).toBe(201);
    expect(res.body.phone).toBe('+12145551234');
  });

  test('stores search_tokens in DB but excludes from response', async () => {
    const res = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    expect(res.status).toBe(201);
    expect(res.body.search_tokens).toBeUndefined();

    const dbRecord = await Customer.findById(res.body._id);
    expect(dbRecord.search_tokens.length).toBeGreaterThan(0);
    expect(dbRecord.search_tokens.some(t => t.startsWith('fn:'))).toBe(true);
    expect(dbRecord.search_tokens.some(t => t.startsWith('ln:'))).toBe(true);
    expect(dbRecord.search_tokens.some(t => t.startsWith('em:'))).toBe(true);
  });

  test('defaults audit_user to anonymous when no header', async () => {
    const res = await request(app)
      .post('/customers')
      .send(validCustomerPayload);

    expect(res.status).toBe(201);
    expect(res.body.created_by).toBe('anonymous');
  });

  test('does not match soft-deleted customers', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    await request(app)
      .delete(`/customers/${createRes.body._id}`)
      .set('x-user-id', 'tester');

    const res = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send({ ...validCustomerPayload, source_system: 'NEW', source_key: 'NEW-1' });

    expect(res.status).toBe(201);
  });
});

describe('GET /customers', () => {
  test('returns empty array when no customers exist', async () => {
    const res = await request(app).get('/customers');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns active customers without aliases or changes', async () => {
    await request(app)
      .post('/customers')
      .send(validCustomerPayload);

    const res = await request(app).get('/customers');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].aliases).toBeUndefined();
    expect(res.body[0].changes).toBeUndefined();
  });

  test('excludes soft-deleted customers by default', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    await request(app)
      .delete(`/customers/${createRes.body._id}`)
      .set('x-user-id', 'tester');

    const res = await request(app).get('/customers');
    expect(res.body).toHaveLength(0);
  });

  test('includes soft-deleted customers when include_deleted=true', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    await request(app)
      .delete(`/customers/${createRes.body._id}`)
      .set('x-user-id', 'tester');

    const res = await request(app).get('/customers?include_deleted=true');
    expect(res.body).toHaveLength(1);
  });

  test('paginates results', async () => {
    // Create 15 customers
    const customers = [];
    for (let i = 0; i < 15; i++) {
      customers.push({
        ...validCustomerPayload,
        email: `user${i}@example.com`,
        first_name: `User${i}`
      });
    }
    await Customer.insertMany(customers);

    // Get page 1, limit 10
    const res1 = await request(app).get('/customers?page=1&limit=10');
    expect(res1.status).toBe(200);
    expect(res1.body).toHaveLength(10);
    expect(res1.headers['x-total-count']).toBe('15');
    expect(res1.headers['x-page']).toBe('1');

    // Get page 2, limit 10
    const res2 = await request(app).get('/customers?page=2&limit=10');
    expect(res2.status).toBe(200);
    expect(res2.body).toHaveLength(5);
    expect(res2.headers['x-page']).toBe('2');
  });

  test('enforces max page size', async () => {
    const originalMax = process.env.MAX_PAGE_SIZE;
    process.env.MAX_PAGE_SIZE = '5';

    const res = await request(app).get('/customers?limit=100');
    expect(res.headers['x-limit']).toBe('5');

    if (originalMax) process.env.MAX_PAGE_SIZE = originalMax;
    else delete process.env.MAX_PAGE_SIZE;
  });

  test('returns Link header for pagination', async () => {
    // Create 15 customers
    const customers = [];
    for (let i = 0; i < 15; i++) {
      customers.push({
        ...validCustomerPayload,
        email: `user${i}@example.com`,
        first_name: `User${i}`
      });
    }
    await Customer.insertMany(customers);

    const res = await request(app).get('/customers?page=1&limit=10');
    expect(res.headers['link']).toBeDefined();
    expect(res.headers['link']).toContain('rel="next"');
    expect(res.headers['link']).toContain('rel="last"');
    expect(res.headers['link']).toContain('rel="first"');
    expect(res.headers['link']).not.toContain('rel="prev"');
  });
});

describe('GET /customers/:id', () => {
  test('returns a customer by ID without aliases or changes', async () => {
    const createRes = await request(app)
      .post('/customers')
      .send(validCustomerPayload);

    const res = await request(app).get(`/customers/${createRes.body._id}`);
    expect(res.status).toBe(200);
    expect(res.body.first_name).toBe('John');
    expect(res.body.aliases).toBeUndefined();
    expect(res.body.changes).toBeUndefined();
  });

  test('includes aliases when show=aliases', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const res = await request(app).get(`/customers/${createRes.body._id}?show=aliases`);
    expect(res.status).toBe(200);
    expect(res.body.aliases).toHaveLength(1);
    expect(res.body.aliases[0].source_system).toBe('CRM');
    expect(res.body.changes).toBeUndefined();
  });

  test('includes changes when show=changes', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'creator')
      .send(validCustomerPayload);

    await request(app)
      .put(`/customers/${createRes.body._id}`)
      .set('x-user-id', 'updater')
      .send({ first_name: 'Jane' });

    const res = await request(app).get(`/customers/${createRes.body._id}?show=changes`);
    expect(res.status).toBe(200);
    expect(res.body.changes).toHaveLength(1);
    expect(res.body.changes[0].delta.first_name).toEqual({ from: 'John', to: 'Jane' });
    expect(res.body.aliases).toBeUndefined();
  });

  test('includes both when show=aliases,changes', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'creator')
      .send(validCustomerPayload);

    await request(app)
      .put(`/customers/${createRes.body._id}`)
      .set('x-user-id', 'updater')
      .send({ first_name: 'Jane' });

    const res = await request(app).get(`/customers/${createRes.body._id}?show=aliases,changes`);
    expect(res.status).toBe(200);
    expect(res.body.aliases).toHaveLength(1);
    expect(res.body.changes).toHaveLength(1);
  });

  test('returns 404 for non-existent ID', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/customers/${fakeId}`);
    expect(res.status).toBe(404);
  });

  test('returns 404 for invalid ID format', async () => {
    const res = await request(app).get('/customers/invalid-id');
    expect(res.status).toBe(404);
  });

  test('returns 404 for soft-deleted customer', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    await request(app)
      .delete(`/customers/${createRes.body._id}`)
      .set('x-user-id', 'tester');

    const res = await request(app).get(`/customers/${createRes.body._id}`);
    expect(res.status).toBe(404);
  });

  test('returns 301 for merged customer', async () => {
    const targetRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const sourceRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send({
        ...validCustomerPayload,
        first_name: 'Jane',
        email: 'jane@example.com',
        source_system: 'ERP',
        source_key: 'ERP-001'
      });

    await request(app)
      .patch(`/customers/${targetRes.body._id}`)
      .set('x-user-id', 'merger')
      .send({ merge: sourceRes.body._id });

    const res = await request(app).get(`/customers/${sourceRes.body._id}`);
    expect(res.status).toBe(301);
    expect(res.headers['location']).toContain(`/customers/${targetRes.body._id}`);
  });
});

describe('PUT /customers/:id', () => {
  test('updates customer fields and tracks audit delta', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'creator')
      .send(validCustomerPayload);

    const res = await request(app)
      .put(`/customers/${createRes.body._id}`)
      .set('x-user-id', 'updater')
      .send({ first_name: 'Jane', email: 'jane@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.first_name).toBe('Jane');
    expect(res.body.email).toBe('jane@example.com');
    expect(res.body.updated_by).toBe('updater');
    expect(res.body.updated_at).toBeTruthy();

    const changesRes = await request(app).get(`/customers/${createRes.body._id}/changes`);
    expect(changesRes.body).toHaveLength(1);
    expect(changesRes.body[0].changed_by).toBe('updater');
    expect(changesRes.body[0].delta.first_name).toEqual({ from: 'John', to: 'Jane' });
  });

  test('updates last_name and phone fields', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'creator')
      .send(validCustomerPayload);

    const originalTokens = (await Customer.findById(createRes.body._id)).search_tokens;

    const res = await request(app)
      .put(`/customers/${createRes.body._id}`)
      .set('x-user-id', 'updater')
      .send({ last_name: 'Smith', phone: '(469) 888-7777' });

    expect(res.status).toBe(200);
    expect(res.body.last_name).toBe('Smith');
    expect(res.body.phone).toBe('+14698887777');

    const updatedTokens = (await Customer.findById(createRes.body._id)).search_tokens;
    expect(updatedTokens).not.toEqual(originalTokens);
  });

  test('updates address fields', async () => {
    const createRes = await request(app)
      .post('/customers')
      .send(validCustomerPayload);

    const res = await request(app)
      .put(`/customers/${createRes.body._id}`)
      .set('x-user-id', 'updater')
      .send({ address: { city: 'Chicago' } });

    expect(res.status).toBe(200);
    expect(res.body.address.city).toBe('Chicago');
    expect(res.body.address.street).toBe('123 Main ST');
  });

  test('records no delta when nothing changed', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'creator')
      .send(validCustomerPayload);

    const res = await request(app)
      .put(`/customers/${createRes.body._id}`)
      .set('x-user-id', 'updater')
      .send({ first_name: 'John' });

    expect(res.status).toBe(200);

    const changesRes = await request(app).get(`/customers/${createRes.body._id}/changes`);
    expect(changesRes.body).toHaveLength(0);
  });

  test('returns 404 for non-existent customer', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .put(`/customers/${fakeId}`)
      .set('x-user-id', 'updater')
      .send({ first_name: 'Jane' });

    expect(res.status).toBe(404);
  });

  test('returns 404 for invalid ID format', async () => {
    const res = await request(app)
      .put('/customers/invalid-id')
      .set('x-user-id', 'updater')
      .send({ first_name: 'Jane' });

    expect(res.status).toBe(404);
  });

  test('returns 404 for soft-deleted customer', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    await request(app)
      .delete(`/customers/${createRes.body._id}`)
      .set('x-user-id', 'tester');

    const res = await request(app)
      .put(`/customers/${createRes.body._id}`)
      .set('x-user-id', 'updater')
      .send({ first_name: 'Jane' });

    expect(res.status).toBe(404);
  });
});

describe('PATCH /customers/:id (merge)', () => {
  test('merges source customer into target customer', async () => {
    const targetRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const sourceRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send({
        ...validCustomerPayload,
        first_name: 'Jane',
        email: 'jane@example.com',
        source_system: 'ERP',
        source_key: 'ERP-001'
      });

    const res = await request(app)
      .patch(`/customers/${targetRes.body._id}`)
      .set('x-user-id', 'merger')
      .send({ merge: sourceRes.body._id });

    expect(res.status).toBe(200);
    expect(res.body.aliases).toBeUndefined();
    expect(res.body.updated_by).toBe('merger');

    // Verify aliases transferred via child resource
    const aliasRes = await request(app).get(`/customers/${targetRes.body._id}/aliases`);
    expect(aliasRes.body).toHaveLength(2);
    expect(aliasRes.body[1].source_system).toBe('ERP');

    // Source should be soft-deleted and merged
    const sourceDb = await Customer.findById(sourceRes.body._id);
    expect(sourceDb.deleted_at).toBeTruthy();
    expect(sourceDb.merged_into.toString()).toBe(targetRes.body._id);
  });

  test('returns 301 when GETting merged source', async () => {
    const targetRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const sourceRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send({
        ...validCustomerPayload,
        first_name: 'Jane',
        email: 'jane@example.com',
        source_system: 'ERP',
        source_key: 'ERP-001'
      });

    await request(app)
      .patch(`/customers/${targetRes.body._id}`)
      .set('x-user-id', 'merger')
      .send({ merge: sourceRes.body._id });

    const getRes = await request(app).get(`/customers/${sourceRes.body._id}`);
    expect(getRes.status).toBe(301);
    expect(getRes.headers['location']).toContain(`/customers/${targetRes.body._id}`);
  });

  test('records merge in change history for both records', async () => {
    const targetRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const sourceRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send({
        ...validCustomerPayload,
        first_name: 'Jane',
        email: 'jane@example.com',
        source_system: 'ERP',
        source_key: 'ERP-001'
      });

    await request(app)
      .patch(`/customers/${targetRes.body._id}`)
      .set('x-user-id', 'merger')
      .send({ merge: sourceRes.body._id });

    const targetChanges = await request(app).get(`/customers/${targetRes.body._id}/changes`);
    expect(targetChanges.body).toHaveLength(1);
    expect(targetChanges.body[0].delta.merge.action).toBe('merged');

    const sourceDb = await Customer.findById(sourceRes.body._id);
    expect(sourceDb.change_history).toHaveLength(1);
    expect(sourceDb.change_history[0].delta.merge.action).toBe('merged_into');
  });

  test('returns 400 when merge field is missing', async () => {
    const targetRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const res = await request(app)
      .patch(`/customers/${targetRes.body._id}`)
      .set('x-user-id', 'merger')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/merge field is required/);
  });

  test('returns 400 when merging a customer into itself', async () => {
    const targetRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const res = await request(app)
      .patch(`/customers/${targetRes.body._id}`)
      .set('x-user-id', 'merger')
      .send({ merge: targetRes.body._id });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/itself/);
  });

  test('returns 404 when target customer does not exist', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const sourceRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const res = await request(app)
      .patch(`/customers/${fakeId}`)
      .set('x-user-id', 'merger')
      .send({ merge: sourceRes.body._id });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Target/);
  });

  test('returns 404 when source customer does not exist', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const targetRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const res = await request(app)
      .patch(`/customers/${targetRes.body._id}`)
      .set('x-user-id', 'merger')
      .send({ merge: fakeId.toString() });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Source/);
  });

  test('returns 404 for invalid ID format', async () => {
    const res = await request(app)
      .patch('/customers/invalid-id')
      .set('x-user-id', 'merger')
      .send({ merge: 'also-invalid' });

    expect(res.status).toBe(404);
  });

  test('returns 404 when source is already soft-deleted', async () => {
    const targetRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const sourceRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send({
        ...validCustomerPayload,
        first_name: 'Jane',
        email: 'jane@example.com',
        source_system: 'ERP',
        source_key: 'ERP-001'
      });

    await request(app)
      .delete(`/customers/${sourceRes.body._id}`)
      .set('x-user-id', 'tester');

    const res = await request(app)
      .patch(`/customers/${targetRes.body._id}`)
      .set('x-user-id', 'merger')
      .send({ merge: sourceRes.body._id });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Source/);
  });
});

describe('DELETE /customers/:id', () => {
  test('soft deletes a customer', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'creator')
      .send(validCustomerPayload);

    const res = await request(app)
      .delete(`/customers/${createRes.body._id}`)
      .set('x-user-id', 'deleter');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Customer deleted');

    const dbRecord = await Customer.findById(createRes.body._id);
    expect(dbRecord.deleted_by).toBe('deleter');
    expect(dbRecord.deleted_at).toBeTruthy();
  });

  test('returns 404 for non-existent customer', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/customers/${fakeId}`)
      .set('x-user-id', 'deleter');

    expect(res.status).toBe(404);
  });

  test('returns 404 for invalid ID format', async () => {
    const res = await request(app)
      .delete('/customers/invalid-id')
      .set('x-user-id', 'deleter');

    expect(res.status).toBe(404);
  });

  test('returns 404 when deleting already deleted customer', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'creator')
      .send(validCustomerPayload);

    await request(app)
      .delete(`/customers/${createRes.body._id}`)
      .set('x-user-id', 'deleter');

    const res = await request(app)
      .delete(`/customers/${createRes.body._id}`)
      .set('x-user-id', 'deleter');

    expect(res.status).toBe(404);
  });
});

describe('GET /customers/:id/aliases', () => {
  test('returns aliases for a customer', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const res = await request(app).get(`/customers/${createRes.body._id}/aliases`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].source_system).toBe('CRM');
    expect(res.body[0].source_key).toBe('CRM-001');
  });

  test('returns 404 for non-existent customer', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/customers/${fakeId}/aliases`);
    expect(res.status).toBe(404);
  });

  test('returns 404 for invalid ID format', async () => {
    const res = await request(app).get('/customers/invalid-id/aliases');
    expect(res.status).toBe(404);
  });
});

describe('GET /customers/:id/changes', () => {
  test('returns change history for a customer', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'creator')
      .send(validCustomerPayload);

    await request(app)
      .put(`/customers/${createRes.body._id}`)
      .set('x-user-id', 'updater')
      .send({ first_name: 'Jane' });

    const res = await request(app).get(`/customers/${createRes.body._id}/changes`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].delta.first_name).toEqual({ from: 'John', to: 'Jane' });
  });

  test('returns 404 for non-existent customer', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/customers/${fakeId}/changes`);
    expect(res.status).toBe(404);
  });

  test('returns 404 for invalid ID format', async () => {
    const res = await request(app).get('/customers/invalid-id/changes');
    expect(res.status).toBe(404);
  });
});

describe('GET /health', () => {
  test('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Error handling (edge cases)', () => {
  test('POST returns 400 on mongoose ValidationError', async () => {
    const originalPrototypeSave = Customer.prototype.save;
    const validationError = new Error('Validation failed');
    validationError.name = 'ValidationError';
    Customer.prototype.save = jest.fn().mockRejectedValue(validationError);

    const res = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    expect(res.status).toBe(400);
    expect(res.body.errors).toContain('Validation failed');
    Customer.prototype.save = originalPrototypeSave;
  });

  test('POST returns 500 on unexpected error', async () => {
    const originalFind = Customer.find;
    Customer.find = jest.fn().mockRejectedValue(new Error('db down'));

    const res = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    Customer.find = originalFind;
  });

  test('GET list returns 500 on unexpected error', async () => {
    const originalFind = Customer.find;
    Customer.find = jest.fn().mockRejectedValue(new Error('db down'));

    const res = await request(app).get('/customers');
    expect(res.status).toBe(500);
    Customer.find = originalFind;
  });

  test('GET by ID returns 500 on unexpected error', async () => {
    const originalFindById = Customer.findById;
    Customer.findById = jest.fn().mockRejectedValue(new Error('db down'));

    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/customers/${fakeId}`);
    expect(res.status).toBe(500);
    Customer.findById = originalFindById;
  });

  test('PUT returns 500 on unexpected error', async () => {
    const originalFindOne = Customer.findOne;
    Customer.findOne = jest.fn().mockRejectedValue(new Error('db down'));

    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .put(`/customers/${fakeId}`)
      .set('x-user-id', 'updater')
      .send({ first_name: 'Jane' });

    expect(res.status).toBe(500);
    Customer.findOne = originalFindOne;
  });

  test('PUT returns 400 on sanitization error', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'creator')
      .send(validCustomerPayload);

    const res = await request(app)
      .put(`/customers/${createRes.body._id}`)
      .set('x-user-id', 'updater')
      .send({ email: '' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.stringMatching(/email/)]));
  });

  test('PUT returns 400 on mongoose ValidationError', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'creator')
      .send(validCustomerPayload);

    const originalSave = Customer.prototype.save;
    const validationError = new Error('Validation failed');
    validationError.name = 'ValidationError';
    Customer.prototype.save = jest.fn().mockRejectedValue(validationError);

    const res = await request(app)
      .put(`/customers/${createRes.body._id}`)
      .set('x-user-id', 'updater')
      .send({ first_name: 'Jane' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toContain('Validation failed');
    Customer.prototype.save = originalSave;
  });

  test('PUT returns 400 for invalid phone', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'creator')
      .send(validCustomerPayload);

    const res = await request(app)
      .put(`/customers/${createRes.body._id}`)
      .set('x-user-id', 'updater')
      .send({ phone: 'not-a-number' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.stringMatching(/phone/)]));
  });

  test('DELETE returns 500 on unexpected error', async () => {
    const originalFindOne = Customer.findOne;
    Customer.findOne = jest.fn().mockRejectedValue(new Error('db down'));

    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/customers/${fakeId}`)
      .set('x-user-id', 'deleter');

    expect(res.status).toBe(500);
    Customer.findOne = originalFindOne;
  });

  test('GET changes returns 500 on unexpected error', async () => {
    const originalFindById = Customer.findById;
    Customer.findById = jest.fn().mockRejectedValue(new Error('db down'));

    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/customers/${fakeId}/changes`);
    expect(res.status).toBe(500);
    Customer.findById = originalFindById;
  });

  test('GET aliases returns 500 on unexpected error', async () => {
    const originalFindById = Customer.findById;
    Customer.findById = jest.fn().mockRejectedValue(new Error('db down'));

    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/customers/${fakeId}/aliases`);
    expect(res.status).toBe(500);
    Customer.findById = originalFindById;
  });
});

describe('GET /customers/search', () => {
  test('finds customer by first name prefix', async () => {
    await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const res = await request(app).get('/customers/search?q=jo');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].first_name).toBe('John');
  });

  test('finds customer by last name prefix', async () => {
    await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const res = await request(app).get('/customers/search?q=do');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].last_name).toBe('Doe');
  });

  test('is case-insensitive', async () => {
    await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const res = await request(app).get('/customers/search?q=JO');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  test('returns 400 for single character query', async () => {
    const res = await request(app).get('/customers/search?q=j');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 2/);
  });

  test('returns 400 for empty query', async () => {
    const res = await request(app).get('/customers/search');
    expect(res.status).toBe(400);
  });

  test('excludes soft-deleted customers', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    await request(app)
      .delete(`/customers/${createRes.body._id}`)
      .set('x-user-id', 'tester');

    const res = await request(app).get('/customers/search?q=jo');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  test('returns empty array for no matches', async () => {
    await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const res = await request(app).get('/customers/search?q=xyz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('respects limit parameter', async () => {
    await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send({
        ...validCustomerPayload,
        first_name: 'Joan',
        email: 'joan@example.com',
        source_system: 'ERP',
        source_key: 'ERP-001'
      });

    const res = await request(app).get('/customers/search?q=jo&limit=1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
