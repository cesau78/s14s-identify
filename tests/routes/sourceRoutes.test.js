const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const app = require('../../src/app');
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

afterEach(async () => {
  await Source.deleteMany({});
});

describe('POST /sources', () => {
  test('creates a new source and returns 201', async () => {
    const res = await request(app)
      .post('/sources')
      .set('x-user-id', 'admin')
      .send({ name: 'CRM', entra_ad_group: 'SG-CRM-Reviewers' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('CRM');
    expect(res.body.entra_ad_group).toBe('SG-CRM-Reviewers');
    expect(res.body.created_by).toBe('admin');
    expect(res.body.reviewers).toEqual([]);
  });

  test('creates a source with reviewers', async () => {
    const res = await request(app)
      .post('/sources')
      .set('x-user-id', 'admin')
      .send({
        name: 'BILLING',
        reviewers: [
          { first_name: 'Jane', last_name: 'Smith', email: 'Jane.Smith@company.com' },
          { first_name: 'Bob', last_name: 'Jones', email: 'Bob.Jones@company.com' }
        ]
      });

    expect(res.status).toBe(201);
    expect(res.body.reviewers).toHaveLength(2);
    expect(res.body.reviewers[0].first_name).toBe('Jane');
    expect(res.body.reviewers[0].email).toBe('jane.smith@company.com');
    expect(res.body.reviewers[1].email).toBe('bob.jones@company.com');
  });

  test('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/sources')
      .set('x-user-id', 'admin')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.errors).toContain('name is required');
  });

  test('returns 409 for duplicate name', async () => {
    await request(app)
      .post('/sources')
      .set('x-user-id', 'admin')
      .send({ name: 'CRM' });

    const res = await request(app)
      .post('/sources')
      .set('x-user-id', 'admin')
      .send({ name: 'CRM' });

    expect(res.status).toBe(409);
  });

  test('returns 400 when reviewer is missing required fields', async () => {
    const res = await request(app)
      .post('/sources')
      .set('x-user-id', 'admin')
      .send({
        name: 'CRM',
        reviewers: [{ first_name: 'Jane' }]
      });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/last_name/),
      expect.stringMatching(/email/)
    ]));
  });

  test('returns 400 when POST reviewers have missing fields', async () => {
    const res = await request(app)
      .post('/sources')
      .set('x-user-id', 'admin')
      .send({
        name: 'REVIEW-TEST',
        reviewers: [{ last_name: 'Smith' }]
      });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/first_name/),
      expect.stringMatching(/email/)
    ]));
  });

  test('returns 400 on ValidationError from Mongoose', async () => {
    const saveSpy = jest.spyOn(Source.prototype, 'save').mockRejectedValueOnce(
      Object.assign(new Error('Validation failed'), { name: 'ValidationError' })
    );

    const res = await request(app)
      .post('/sources')
      .set('x-user-id', 'admin')
      .send({ name: 'VALID' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toContain('Validation failed');
    saveSpy.mockRestore();
  });

  test('returns 500 on unexpected error', async () => {
    const saveSpy = jest.spyOn(Source.prototype, 'save').mockRejectedValueOnce(
      new Error('Something broke')
    );

    const res = await request(app)
      .post('/sources')
      .set('x-user-id', 'admin')
      .send({ name: 'VALID' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    saveSpy.mockRestore();
  });
});

describe('GET /sources', () => {
  test('returns all active sources', async () => {
    await Source.insertMany([
      { name: 'CRM', created_by: 'admin', created_at: new Date() },
      { name: 'ERP', created_by: 'admin', created_at: new Date() }
    ]);

    const res = await request(app).get('/sources');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('excludes soft-deleted sources by default', async () => {
    await Source.insertMany([
      { name: 'CRM', created_by: 'admin', created_at: new Date() },
      { name: 'OLD', created_by: 'admin', created_at: new Date(), deleted_at: new Date(), deleted_by: 'admin' }
    ]);

    const res = await request(app).get('/sources');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('CRM');
  });

  test('includes soft-deleted sources when requested', async () => {
    await Source.insertMany([
      { name: 'CRM', created_by: 'admin', created_at: new Date() },
      { name: 'OLD', created_by: 'admin', created_at: new Date(), deleted_at: new Date(), deleted_by: 'admin' }
    ]);

    const res = await request(app).get('/sources?include_deleted=true');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('returns 500 on unexpected error', async () => {
    const findSpy = jest.spyOn(Source, 'find').mockReturnValueOnce({
      sort: jest.fn().mockRejectedValueOnce(new Error('DB down'))
    });

    const res = await request(app).get('/sources');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    findSpy.mockRestore();
  });
});

describe('GET /sources/:id', () => {
  test('returns a source by ID', async () => {
    const source = await Source.create({ name: 'CRM', created_by: 'admin', created_at: new Date() });

    const res = await request(app).get(`/sources/${source._id}`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('CRM');
  });

  test('returns 404 for non-existent source', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/sources/${fakeId}`);

    expect(res.status).toBe(404);
  });

  test('returns 404 for soft-deleted source', async () => {
    const source = await Source.create({
      name: 'OLD', created_by: 'admin', created_at: new Date(),
      deleted_at: new Date(), deleted_by: 'admin'
    });

    const res = await request(app).get(`/sources/${source._id}`);

    expect(res.status).toBe(404);
  });

  test('returns 404 for invalid ID (CastError)', async () => {
    const res = await request(app).get('/sources/not-a-valid-id');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Source not found');
  });

  test('returns 500 on unexpected error', async () => {
    const findOneSpy = jest.spyOn(Source, 'findOne').mockRejectedValueOnce(
      new Error('DB down')
    );

    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/sources/${fakeId}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    findOneSpy.mockRestore();
  });
});

describe('PUT /sources/:id', () => {
  test('updates source name and entra_ad_group', async () => {
    const source = await Source.create({ name: 'CRM', created_by: 'admin', created_at: new Date() });

    const res = await request(app)
      .put(`/sources/${source._id}`)
      .set('x-user-id', 'admin')
      .send({ name: 'CRM-V2', entra_ad_group: 'SG-CRM-V2' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('CRM-V2');
    expect(res.body.entra_ad_group).toBe('SG-CRM-V2');
    expect(res.body.updated_by).toBe('admin');
  });

  test('replaces reviewers list', async () => {
    const source = await Source.create({
      name: 'CRM', created_by: 'admin', created_at: new Date(),
      reviewers: [{ first_name: 'Old', last_name: 'Reviewer', email: 'old@co.com' }]
    });

    const res = await request(app)
      .put(`/sources/${source._id}`)
      .set('x-user-id', 'admin')
      .send({
        reviewers: [
          { first_name: 'New', last_name: 'Reviewer', email: 'new@co.com' }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.reviewers).toHaveLength(1);
    expect(res.body.reviewers[0].first_name).toBe('New');
  });

  test('returns 409 when renaming to existing name', async () => {
    await Source.insertMany([
      { name: 'CRM', created_by: 'admin', created_at: new Date() },
      { name: 'ERP', created_by: 'admin', created_at: new Date() }
    ]);

    const crm = await Source.findOne({ name: 'CRM' });
    const res = await request(app)
      .put(`/sources/${crm._id}`)
      .set('x-user-id', 'admin')
      .send({ name: 'ERP' });

    expect(res.status).toBe(409);
  });

  test('returns 404 for non-existent source', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .put(`/sources/${fakeId}`)
      .set('x-user-id', 'admin')
      .send({ name: 'X' });

    expect(res.status).toBe(404);
  });

  test('returns 400 when name is set to empty string', async () => {
    const source = await Source.create({ name: 'CRM', created_by: 'admin', created_at: new Date() });

    const res = await request(app)
      .put(`/sources/${source._id}`)
      .set('x-user-id', 'admin')
      .send({ name: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toContain('name cannot be empty');
  });

  test('returns 400 when reviewer is missing required fields', async () => {
    const source = await Source.create({ name: 'CRM', created_by: 'admin', created_at: new Date() });

    const res = await request(app)
      .put(`/sources/${source._id}`)
      .set('x-user-id', 'admin')
      .send({
        reviewers: [{ email: 'test@co.com' }]
      });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/first_name/),
      expect.stringMatching(/last_name/)
    ]));
  });

  test('returns 400 when reviewer is missing email', async () => {
    const source = await Source.create({ name: 'CRM', created_by: 'admin', created_at: new Date() });

    const res = await request(app)
      .put(`/sources/${source._id}`)
      .set('x-user-id', 'admin')
      .send({
        reviewers: [{ first_name: 'Bob', last_name: 'Smith' }]
      });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/email/)
    ]));
  });

  test('treats non-array reviewers as empty array on PUT', async () => {
    const source = await Source.create({ name: 'CRM', created_by: 'admin', created_at: new Date() });

    const res = await request(app)
      .put(`/sources/${source._id}`)
      .set('x-user-id', 'admin')
      .send({ reviewers: 'not-an-array' });

    expect(res.status).toBe(200);
  });

  test('returns 404 for invalid ID (CastError)', async () => {
    const res = await request(app)
      .put('/sources/not-a-valid-id')
      .set('x-user-id', 'admin')
      .send({ name: 'X' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Source not found');
  });

  test('returns 500 on unexpected error', async () => {
    const findOneSpy = jest.spyOn(Source, 'findOne').mockRejectedValueOnce(
      new Error('DB down')
    );

    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .put(`/sources/${fakeId}`)
      .set('x-user-id', 'admin')
      .send({ name: 'X' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    findOneSpy.mockRestore();
  });
});

describe('DELETE /sources/:id', () => {
  test('soft-deletes a source', async () => {
    const source = await Source.create({ name: 'CRM', created_by: 'admin', created_at: new Date() });

    const res = await request(app)
      .delete(`/sources/${source._id}`)
      .set('x-user-id', 'admin');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Source deleted');

    const deleted = await Source.findById(source._id);
    expect(deleted.deleted_at).toBeTruthy();
    expect(deleted.deleted_by).toBe('admin');
  });

  test('returns 404 for non-existent source', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/sources/${fakeId}`)
      .set('x-user-id', 'admin');

    expect(res.status).toBe(404);
  });

  test('returns 404 for already deleted source', async () => {
    const source = await Source.create({
      name: 'OLD', created_by: 'admin', created_at: new Date(),
      deleted_at: new Date(), deleted_by: 'admin'
    });

    const res = await request(app)
      .delete(`/sources/${source._id}`)
      .set('x-user-id', 'admin');

    expect(res.status).toBe(404);
  });

  test('returns 404 for invalid ID (CastError)', async () => {
    const res = await request(app)
      .delete('/sources/not-a-valid-id')
      .set('x-user-id', 'admin');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Source not found');
  });

  test('returns 500 on unexpected error', async () => {
    const findOneSpy = jest.spyOn(Source, 'findOne').mockRejectedValueOnce(
      new Error('DB down')
    );

    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/sources/${fakeId}`)
      .set('x-user-id', 'admin');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    findOneSpy.mockRestore();
  });
});
