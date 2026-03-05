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
  phone: '555-1234',
  address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701' },
  source_system: 'CRM',
  source_key: 'CRM-001'
};

describe('POST /api/customers', () => {
  test('creates a new customer and returns 201', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    expect(res.status).toBe(201);
    expect(res.body.first_name).toBe('John');
    expect(res.body.last_name).toBe('Doe');
    expect(res.body.aliases).toHaveLength(1);
    expect(res.body.aliases[0].source_system).toBe('CRM');
    expect(res.body.aliases[0].source_key).toBe('CRM-001');
    expect(res.body.created_by).toBe('tester');
  });

  test('matches existing customer and returns 200 with alias added', async () => {
    await request(app)
      .post('/api/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const res = await request(app)
      .post('/api/customers')
      .set('x-user-id', 'tester-2')
      .send({
        ...validCustomerPayload,
        source_system: 'ERP',
        source_key: 'ERP-001'
      });

    expect(res.status).toBe(200);
    expect(res.body.aliases).toHaveLength(2);
    expect(res.body.aliases[1].source_system).toBe('ERP');
    expect(res.body.updated_by).toBe('tester-2');
  });

  test('returns 400 when source_system is missing', async () => {
    const { source_system, ...payload } = validCustomerPayload;
    const res = await request(app)
      .post('/api/customers')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/source_system/);
  });

  test('returns 400 when source_key is missing', async () => {
    const { source_key, ...payload } = validCustomerPayload;
    const res = await request(app)
      .post('/api/customers')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/source_key/);
  });

  test('returns 400 when required customer fields are missing', async () => {
    const res = await request(app)
      .post('/api/customers')
      .send({ source_system: 'CRM', source_key: '001' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/first_name/);
  });

  test('defaults audit_user to anonymous when no header', async () => {
    const res = await request(app)
      .post('/api/customers')
      .send(validCustomerPayload);

    expect(res.status).toBe(201);
    expect(res.body.created_by).toBe('anonymous');
  });

  test('does not match soft-deleted customers', async () => {
    const createRes = await request(app)
      .post('/api/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    await request(app)
      .delete(`/api/customers/${createRes.body._id}`)
      .set('x-user-id', 'tester');

    const res = await request(app)
      .post('/api/customers')
      .set('x-user-id', 'tester')
      .send({ ...validCustomerPayload, source_system: 'NEW', source_key: 'NEW-1' });

    expect(res.status).toBe(201);
  });
});

describe('GET /api/customers', () => {
  test('returns empty array when no customers exist', async () => {
    const res = await request(app).get('/api/customers');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns active customers', async () => {
    await request(app)
      .post('/api/customers')
      .send(validCustomerPayload);

    const res = await request(app).get('/api/customers');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  test('excludes soft-deleted customers by default', async () => {
    const createRes = await request(app)
      .post('/api/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    await request(app)
      .delete(`/api/customers/${createRes.body._id}`)
      .set('x-user-id', 'tester');

    const res = await request(app).get('/api/customers');
    expect(res.body).toHaveLength(0);
  });

  test('includes soft-deleted customers when include_deleted=true', async () => {
    const createRes = await request(app)
      .post('/api/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    await request(app)
      .delete(`/api/customers/${createRes.body._id}`)
      .set('x-user-id', 'tester');

    const res = await request(app).get('/api/customers?include_deleted=true');
    expect(res.body).toHaveLength(1);
  });
});

describe('GET /api/customers/:id', () => {
  test('returns a customer by ID', async () => {
    const createRes = await request(app)
      .post('/api/customers')
      .send(validCustomerPayload);

    const res = await request(app).get(`/api/customers/${createRes.body._id}`);
    expect(res.status).toBe(200);
    expect(res.body.first_name).toBe('John');
  });

  test('returns 404 for non-existent ID', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/customers/${fakeId}`);
    expect(res.status).toBe(404);
  });

  test('returns 404 for invalid ID format', async () => {
    const res = await request(app).get('/api/customers/invalid-id');
    expect(res.status).toBe(404);
  });

  test('returns 404 for soft-deleted customer', async () => {
    const createRes = await request(app)
      .post('/api/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    await request(app)
      .delete(`/api/customers/${createRes.body._id}`)
      .set('x-user-id', 'tester');

    const res = await request(app).get(`/api/customers/${createRes.body._id}`);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/customers/:id', () => {
  test('updates customer fields and tracks audit delta', async () => {
    const createRes = await request(app)
      .post('/api/customers')
      .set('x-user-id', 'creator')
      .send(validCustomerPayload);

    const res = await request(app)
      .put(`/api/customers/${createRes.body._id}`)
      .set('x-user-id', 'updater')
      .send({ first_name: 'Jane', email: 'jane@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.first_name).toBe('Jane');
    expect(res.body.email).toBe('jane@example.com');
    expect(res.body.updated_by).toBe('updater');
    expect(res.body.updated_at).toBeTruthy();

    const historyRes = await request(app).get(`/api/customers/${createRes.body._id}/history`);
    expect(historyRes.body).toHaveLength(1);
    expect(historyRes.body[0].changed_by).toBe('updater');
    expect(historyRes.body[0].delta.first_name).toEqual({ from: 'John', to: 'Jane' });
  });

  test('updates last_name and phone fields', async () => {
    const createRes = await request(app)
      .post('/api/customers')
      .set('x-user-id', 'creator')
      .send(validCustomerPayload);

    const res = await request(app)
      .put(`/api/customers/${createRes.body._id}`)
      .set('x-user-id', 'updater')
      .send({ last_name: 'Smith', phone: '999-8888' });

    expect(res.status).toBe(200);
    expect(res.body.last_name).toBe('Smith');
    expect(res.body.phone).toBe('999-8888');
  });

  test('updates address fields', async () => {
    const createRes = await request(app)
      .post('/api/customers')
      .send(validCustomerPayload);

    const res = await request(app)
      .put(`/api/customers/${createRes.body._id}`)
      .set('x-user-id', 'updater')
      .send({ address: { city: 'Chicago' } });

    expect(res.status).toBe(200);
    expect(res.body.address.city).toBe('Chicago');
    expect(res.body.address.street).toBe('123 Main St');
  });

  test('records no delta when nothing changed', async () => {
    const createRes = await request(app)
      .post('/api/customers')
      .set('x-user-id', 'creator')
      .send(validCustomerPayload);

    const res = await request(app)
      .put(`/api/customers/${createRes.body._id}`)
      .set('x-user-id', 'updater')
      .send({ first_name: 'John' });

    expect(res.status).toBe(200);

    const historyRes = await request(app).get(`/api/customers/${createRes.body._id}/history`);
    expect(historyRes.body).toHaveLength(0);
  });

  test('returns 404 for non-existent customer', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .put(`/api/customers/${fakeId}`)
      .set('x-user-id', 'updater')
      .send({ first_name: 'Jane' });

    expect(res.status).toBe(404);
  });

  test('returns 404 for invalid ID format', async () => {
    const res = await request(app)
      .put('/api/customers/invalid-id')
      .set('x-user-id', 'updater')
      .send({ first_name: 'Jane' });

    expect(res.status).toBe(404);
  });

  test('returns 404 for soft-deleted customer', async () => {
    const createRes = await request(app)
      .post('/api/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    await request(app)
      .delete(`/api/customers/${createRes.body._id}`)
      .set('x-user-id', 'tester');

    const res = await request(app)
      .put(`/api/customers/${createRes.body._id}`)
      .set('x-user-id', 'updater')
      .send({ first_name: 'Jane' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/customers/:id', () => {
  test('soft deletes a customer', async () => {
    const createRes = await request(app)
      .post('/api/customers')
      .set('x-user-id', 'creator')
      .send(validCustomerPayload);

    const res = await request(app)
      .delete(`/api/customers/${createRes.body._id}`)
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
      .delete(`/api/customers/${fakeId}`)
      .set('x-user-id', 'deleter');

    expect(res.status).toBe(404);
  });

  test('returns 404 for invalid ID format', async () => {
    const res = await request(app)
      .delete('/api/customers/invalid-id')
      .set('x-user-id', 'deleter');

    expect(res.status).toBe(404);
  });

  test('returns 404 when deleting already deleted customer', async () => {
    const createRes = await request(app)
      .post('/api/customers')
      .set('x-user-id', 'creator')
      .send(validCustomerPayload);

    await request(app)
      .delete(`/api/customers/${createRes.body._id}`)
      .set('x-user-id', 'deleter');

    const res = await request(app)
      .delete(`/api/customers/${createRes.body._id}`)
      .set('x-user-id', 'deleter');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/customers/:id/history', () => {
  test('returns change history for a customer', async () => {
    const createRes = await request(app)
      .post('/api/customers')
      .set('x-user-id', 'creator')
      .send(validCustomerPayload);

    await request(app)
      .put(`/api/customers/${createRes.body._id}`)
      .set('x-user-id', 'updater')
      .send({ first_name: 'Jane' });

    const res = await request(app).get(`/api/customers/${createRes.body._id}/history`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].delta.first_name).toEqual({ from: 'John', to: 'Jane' });
  });

  test('returns 404 for non-existent customer', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/customers/${fakeId}/history`);
    expect(res.status).toBe(404);
  });

  test('returns 404 for invalid ID format', async () => {
    const res = await request(app).get('/api/customers/invalid-id/history');
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
      .post('/api/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    Customer.prototype.save = originalPrototypeSave;
  });

  test('POST returns 500 on unexpected error', async () => {
    const originalFind = Customer.find;
    Customer.find = jest.fn().mockRejectedValue(new Error('db down'));

    const res = await request(app)
      .post('/api/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    Customer.find = originalFind;
  });

  test('GET list returns 500 on unexpected error', async () => {
    const originalFind = Customer.find;
    Customer.find = jest.fn().mockRejectedValue(new Error('db down'));

    const res = await request(app).get('/api/customers');
    expect(res.status).toBe(500);
    Customer.find = originalFind;
  });

  test('GET by ID returns 500 on unexpected error', async () => {
    const originalFindOne = Customer.findOne;
    Customer.findOne = jest.fn().mockRejectedValue(new Error('db down'));

    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/customers/${fakeId}`);
    expect(res.status).toBe(500);
    Customer.findOne = originalFindOne;
  });

  test('PUT returns 500 on unexpected error', async () => {
    const originalFindOne = Customer.findOne;
    Customer.findOne = jest.fn().mockRejectedValue(new Error('db down'));

    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .put(`/api/customers/${fakeId}`)
      .set('x-user-id', 'updater')
      .send({ first_name: 'Jane' });

    expect(res.status).toBe(500);
    Customer.findOne = originalFindOne;
  });

  test('PUT returns 400 on validation error', async () => {
    const createRes = await request(app)
      .post('/api/customers')
      .set('x-user-id', 'creator')
      .send(validCustomerPayload);

    const res = await request(app)
      .put(`/api/customers/${createRes.body._id}`)
      .set('x-user-id', 'updater')
      .send({ email: '' });

    expect(res.status).toBe(400);
  });

  test('DELETE returns 500 on unexpected error', async () => {
    const originalFindOne = Customer.findOne;
    Customer.findOne = jest.fn().mockRejectedValue(new Error('db down'));

    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/api/customers/${fakeId}`)
      .set('x-user-id', 'deleter');

    expect(res.status).toBe(500);
    Customer.findOne = originalFindOne;
  });

  test('GET history returns 500 on unexpected error', async () => {
    const originalFindById = Customer.findById;
    Customer.findById = jest.fn().mockRejectedValue(new Error('db down'));

    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/customers/${fakeId}/history`);
    expect(res.status).toBe(500);
    Customer.findById = originalFindById;
  });
});
