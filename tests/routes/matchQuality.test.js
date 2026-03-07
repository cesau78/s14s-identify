const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../src/app');
const Customer = require('../../src/models/customer');
const MatchFeedback = require('../../src/models/matchFeedback');

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
  await MatchFeedback.deleteMany({});
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

describe('POST /customers/:id/aliases/:aliasId/feedback', () => {
  test('records false positive feedback for an auto-matched alias', async () => {
    // Create initial customer
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    // Match same customer to add a second alias with match_confidence
    const matchRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send({
        ...validCustomerPayload,
        source_system: 'ERP',
        source_key: 'ERP-001'
      });

    expect(matchRes.status).toBe(200);

    // Get the second alias (the auto-matched one)
    const aliasRes = await request(app).get(`/customers/${matchRes.body._id}/aliases`);
    const autoMatchedAlias = aliasRes.body.find(a => a.source_system === 'ERP');

    const res = await request(app)
      .post(`/customers/${matchRes.body._id}/aliases/${autoMatchedAlias._id}/feedback`)
      .set('x-user-id', 'reviewer')
      .send({ notes: 'Different person with same name' });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('false_positive');
    expect(res.body.customer_id).toBe(matchRes.body._id);
    expect(res.body.original_confidence).toBeGreaterThanOrEqual(0.95);
    expect(res.body.reported_by).toBe('reviewer');
    expect(res.body.notes).toBe('Different person with same name');
  });

  test('returns 400 for alias without match_confidence (not auto-matched)', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    // First alias has null match_confidence
    const aliasRes = await request(app).get(`/customers/${createRes.body._id}/aliases`);
    const firstAlias = aliasRes.body[0];

    const res = await request(app)
      .post(`/customers/${createRes.body._id}/aliases/${firstAlias._id}/feedback`)
      .set('x-user-id', 'reviewer');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not an auto-match/);
  });

  test('returns 404 for non-existent customer', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const fakeAliasId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .post(`/customers/${fakeId}/aliases/${fakeAliasId}/feedback`)
      .set('x-user-id', 'reviewer');

    expect(res.status).toBe(404);
  });

  test('returns 404 for non-existent alias', async () => {
    const createRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const fakeAliasId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/customers/${createRes.body._id}/aliases/${fakeAliasId}/feedback`)
      .set('x-user-id', 'reviewer');

    expect(res.status).toBe(404);
  });
});

describe('PATCH /customers/:id (merge) records false negative', () => {
  test('creates a false_negative feedback record on manual merge', async () => {
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

    const feedback = await MatchFeedback.find({ type: 'false_negative' });
    expect(feedback).toHaveLength(1);
    expect(feedback[0].customer_id.toString()).toBe(targetRes.body._id);
    expect(feedback[0].related_customer_id.toString()).toBe(sourceRes.body._id);
    expect(feedback[0].reported_by).toBe('merger');
    expect(feedback[0].resolved).toBe(true);
  });
});

describe('GET /match-quality', () => {
  test('returns metrics with no data', async () => {
    const res = await request(app).get('/match-quality');
    expect(res.status).toBe(200);
    expect(res.body.true_positives).toBe(0);
    expect(res.body.false_positives).toBe(0);
    expect(res.body.false_negatives).toBe(0);
    expect(res.body.precision).toBe(1);
    expect(res.body.recall).toBe(1);
    expect(res.body.f1).toBe(1);
  });

  test('returns correct metrics with auto-matches and feedback', async () => {
    // Create customer and auto-match to generate true positives
    await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const matchRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send({
        ...validCustomerPayload,
        source_system: 'ERP',
        source_key: 'ERP-001'
      });

    expect(matchRes.status).toBe(200);

    // File a false positive feedback
    const aliasRes = await request(app).get(`/customers/${matchRes.body._id}/aliases`);
    const autoMatchedAlias = aliasRes.body.find(a => a.source_system === 'ERP');

    await request(app)
      .post(`/customers/${matchRes.body._id}/aliases/${autoMatchedAlias._id}/feedback`)
      .set('x-user-id', 'reviewer');

    const res = await request(app).get('/match-quality');
    expect(res.status).toBe(200);
    expect(res.body.total_auto_matches).toBe(1);
    expect(res.body.false_positives).toBe(1);
    expect(res.body.true_positives).toBe(0);
    expect(res.body.precision).toBe(0);
  });
});

describe('GET /match-quality/tune', () => {
  test('returns no adjustment when no feedback exists', async () => {
    const res = await request(app).get('/match-quality/tune');
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('none');
    expect(res.body.reason).toMatch(/No feedback/);
    expect(res.body.current_weights).toBeDefined();
    expect(res.body.current_threshold).toBeDefined();
  });

  test('suggests tightening when mostly false positives', async () => {
    // Create multiple false positive feedbacks
    for (let i = 0; i < 3; i++) {
      await new MatchFeedback({
        type: 'false_positive',
        customer_id: new mongoose.Types.ObjectId(),
        alias_id: new mongoose.Types.ObjectId(),
        original_confidence: 0.96,
        reported_by: 'reviewer'
      }).save();
    }

    const res = await request(app).get('/match-quality/tune');
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('tighten');
    expect(res.body.suggested_threshold).toBeGreaterThan(res.body.current_threshold);
  });

  test('suggests loosening when mostly false negatives', async () => {
    // Create multiple false negative feedbacks
    for (let i = 0; i < 3; i++) {
      await new MatchFeedback({
        type: 'false_negative',
        customer_id: new mongoose.Types.ObjectId(),
        related_customer_id: new mongoose.Types.ObjectId(),
        reported_by: 'reviewer'
      }).save();
    }

    const res = await request(app).get('/match-quality/tune');
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('loosen');
    expect(res.body.suggested_threshold).toBeLessThan(res.body.current_threshold);
  });
});

describe('GET /match-quality/feedback', () => {
  test('returns all feedback records', async () => {
    await new MatchFeedback({
      type: 'false_positive',
      customer_id: new mongoose.Types.ObjectId(),
      reported_by: 'reviewer'
    }).save();

    await new MatchFeedback({
      type: 'false_negative',
      customer_id: new mongoose.Types.ObjectId(),
      reported_by: 'reviewer'
    }).save();

    const res = await request(app).get('/match-quality/feedback');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('filters by type', async () => {
    await new MatchFeedback({
      type: 'false_positive',
      customer_id: new mongoose.Types.ObjectId(),
      reported_by: 'reviewer'
    }).save();

    await new MatchFeedback({
      type: 'false_negative',
      customer_id: new mongoose.Types.ObjectId(),
      reported_by: 'reviewer'
    }).save();

    const res = await request(app).get('/match-quality/feedback?type=false_positive');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe('false_positive');
  });

  test('returns empty array when no feedback exists', async () => {
    const res = await request(app).get('/match-quality/feedback');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
