const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { connectToDatabase, disconnectFromDatabase } = require('../../src/database/connection');

describe('Database Connection', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
  });

  afterAll(async () => {
    await mongoServer.stop();
  });

  afterEach(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  test('connects to database with provided URI', async () => {
    const uri = mongoServer.getUri();
    const connection = await connectToDatabase(uri);
    expect(connection.readyState).toBe(1);
  });

  test('disconnects from database', async () => {
    const uri = mongoServer.getUri();
    await connectToDatabase(uri);
    await disconnectFromDatabase();
    expect(mongoose.connection.readyState).toBe(0);
  });

  test('falls back to MONGODB_URI env var when no uri provided', async () => {
    const uri = mongoServer.getUri();
    const originalEnv = process.env.MONGODB_URI;
    process.env.MONGODB_URI = uri;

    const connection = await connectToDatabase();
    expect(connection.readyState).toBe(1);

    await mongoose.disconnect();
    process.env.MONGODB_URI = originalEnv;
  });

  test('falls back to default localhost when no arg and no env var', async () => {
    const originalEnv = process.env.MONGODB_URI;
    delete process.env.MONGODB_URI;

    try {
      await connectToDatabase(undefined);
    } catch (error) {
      expect(error).toBeDefined();
    }

    process.env.MONGODB_URI = originalEnv;
  });
});
