const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const app = require('../../src/app');
const Customer = require('../../src/models/customer');
const MatchFeedback = require('../../src/models/matchFeedback');
const Source = require('../../src/models/source');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Source.deleteMany({});
  await Source.insertMany([
    { name: 'CRM', created_by: 'test-setup', created_at: new Date() },
    { name: 'ERP', created_by: 'test-setup', created_at: new Date() }
  ]);
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

  test('computes recall when false negatives exist', async () => {
    // Create auto-match (1 TP) plus a false_negative record
    await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send({
        ...validCustomerPayload,
        source_system: 'ERP',
        source_key: 'ERP-001'
      });

    // Add a false negative (manual merge that system missed)
    await new MatchFeedback({
      type: 'false_negative',
      customer_id: new mongoose.Types.ObjectId(),
      related_customer_id: new mongoose.Types.ObjectId(),
      reported_by: 'reviewer'
    }).save();

    const res = await request(app).get('/match-quality');
    expect(res.status).toBe(200);
    // totalAutoMatches=1, FP=0, FN=1, TP=1
    // recall = TP/(TP+FN) = 1/2 = 0.5  (hits true branch of recall)
    expect(res.body.recall).toBe(0.5);
    expect(res.body.true_positives).toBe(1);
    expect(res.body.false_negatives).toBe(1);
  });

  test('returns f1=0 when both precision and recall are zero', async () => {
    // No auto-matches but both FP and FN feedback exist
    // FP=1, FN=1, totalAutoMatches=0 → TP=0
    // precision = 0/(0+1) = 0, recall = 0/(0+1) = 0 → f1 = 0
    await new MatchFeedback({
      type: 'false_positive',
      customer_id: new mongoose.Types.ObjectId(),
      alias_id: new mongoose.Types.ObjectId(),
      original_confidence: 0.96,
      reported_by: 'reviewer'
    }).save();
    await new MatchFeedback({
      type: 'false_negative',
      customer_id: new mongoose.Types.ObjectId(),
      related_customer_id: new mongoose.Types.ObjectId(),
      reported_by: 'reviewer'
    }).save();

    const res = await request(app).get('/match-quality');
    expect(res.status).toBe(200);
    expect(res.body.precision).toBe(0);
    expect(res.body.recall).toBe(0);
    expect(res.body.f1).toBe(0);
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

  test('returns no adjustment when feedback is balanced', async () => {
    // Equal FP and FN → fpRate = fnRate = 0.5 → action: 'none'
    await new MatchFeedback({
      type: 'false_positive',
      customer_id: new mongoose.Types.ObjectId(),
      alias_id: new mongoose.Types.ObjectId(),
      original_confidence: 0.96,
      reported_by: 'reviewer'
    }).save();
    await new MatchFeedback({
      type: 'false_negative',
      customer_id: new mongoose.Types.ObjectId(),
      related_customer_id: new mongoose.Types.ObjectId(),
      reported_by: 'reviewer'
    }).save();

    const res = await request(app).get('/match-quality/tune');
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('none');
    expect(res.body.reason).toMatch(/balanced/);
    expect(res.body.suggested_threshold).toBe(res.body.current_threshold);
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

  test('filters by resolved status', async () => {
    await new MatchFeedback({
      type: 'false_positive',
      customer_id: new mongoose.Types.ObjectId(),
      reported_by: 'reviewer',
      resolved: false
    }).save();

    await new MatchFeedback({
      type: 'false_positive',
      customer_id: new mongoose.Types.ObjectId(),
      reported_by: 'reviewer',
      resolved: true,
      resolved_at: new Date()
    }).save();

    const unresolved = await request(app).get('/match-quality/feedback?resolved=false');
    expect(unresolved.status).toBe(200);
    expect(unresolved.body).toHaveLength(1);
    expect(unresolved.body[0].resolved).toBe(false);

    const resolved = await request(app).get('/match-quality/feedback?resolved=true');
    expect(resolved.status).toBe(200);
    expect(resolved.body).toHaveLength(1);
    expect(resolved.body[0].resolved).toBe(true);
  });
});

describe('GET /match-quality 500 errors', () => {
  test('returns 500 when metrics aggregation fails', async () => {
    const spy = jest.spyOn(Customer, 'aggregate').mockRejectedValueOnce(new Error('db error'));

    const res = await request(app).get('/match-quality');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');

    spy.mockRestore();
  });
});

describe('GET /match-quality/tune 500 errors', () => {
  test('returns 500 when suggestWeightAdjustments throws', async () => {
    const spy = jest.spyOn(MatchFeedback, 'countDocuments').mockRejectedValueOnce(new Error('db error'));

    const res = await request(app).get('/match-quality/tune');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');

    spy.mockRestore();
  });
});

describe('GET /match-quality/feedback 500 errors', () => {
  test('returns 500 when feedback query fails', async () => {
    const spy = jest.spyOn(MatchFeedback, 'find').mockImplementationOnce(() => {
      throw new Error('db error');
    });

    const res = await request(app).get('/match-quality/feedback');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');

    spy.mockRestore();
  });
});

describe('GET /customers?under_review=true', () => {
  test('returns only customers with unresolved false positive feedback', async () => {
    // Create two customers
    const cust1Res = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const cust2Res = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send({
        ...validCustomerPayload,
        email: 'jane@example.com',
        first_name: 'Jane',
        source_system: 'ERP',
        source_key: 'ERP-001'
      });

    // Only flag cust1 with unresolved false positive
    await new MatchFeedback({
      type: 'false_positive',
      customer_id: cust1Res.body._id,
      alias_id: new mongoose.Types.ObjectId(),
      original_confidence: 0.96,
      reported_by: 'reviewer',
      resolved: false
    }).save();

    const res = await request(app).get('/customers?under_review=true');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]._id).toBe(cust1Res.body._id);
  });

  test('orders by most recent feedback first', async () => {
    const cust1Res = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    const cust2Res = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send({
        ...validCustomerPayload,
        email: 'jane@example.com',
        first_name: 'Jane',
        source_system: 'ERP',
        source_key: 'ERP-001'
      });

    // Older feedback for cust1
    await new MatchFeedback({
      type: 'false_positive',
      customer_id: cust1Res.body._id,
      reported_by: 'reviewer',
      reported_at: new Date('2025-01-01'),
      resolved: false
    }).save();

    // Newer feedback for cust2
    await new MatchFeedback({
      type: 'false_positive',
      customer_id: cust2Res.body._id,
      reported_by: 'reviewer',
      reported_at: new Date('2025-06-01'),
      resolved: false
    }).save();

    const res = await request(app).get('/customers?under_review=true');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]._id).toBe(cust2Res.body._id);
    expect(res.body[1]._id).toBe(cust1Res.body._id);
  });

  test('excludes customers with only resolved feedback', async () => {
    const custRes = await request(app)
      .post('/customers')
      .set('x-user-id', 'tester')
      .send(validCustomerPayload);

    await new MatchFeedback({
      type: 'false_positive',
      customer_id: custRes.body._id,
      reported_by: 'reviewer',
      resolved: true,
      resolved_at: new Date()
    }).save();

    const res = await request(app).get('/customers?under_review=true');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  test('returns empty array when no feedback exists', async () => {
    const res = await request(app).get('/customers?under_review=true');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
