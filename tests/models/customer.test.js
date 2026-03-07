const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
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

describe('Customer Model', () => {
  const validCustomerData = {
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    created_by: 'test-user',
    aliases: [{
      source_system: 'CRM',
      source_key: 'CRM-001',
      original_payload: { first_name: 'John' },
      added_by: 'test-user'
    }]
  };

  test('creates a valid customer', async () => {
    const customer = await Customer.create(validCustomerData);
    expect(customer.first_name).toBe('John');
    expect(customer.last_name).toBe('Doe');
    expect(customer.aliases).toHaveLength(1);
    expect(customer.deleted_at).toBeNull();
    expect(customer.deleted_by).toBeNull();
  });

  test('requires first_name', async () => {
    const { first_name, ...data } = validCustomerData;
    await expect(Customer.create(data)).rejects.toThrow(/first_name/);
  });

  test('requires last_name', async () => {
    const { last_name, ...data } = validCustomerData;
    await expect(Customer.create(data)).rejects.toThrow(/last_name/);
  });

  test('requires email', async () => {
    const { email, ...data } = validCustomerData;
    await expect(Customer.create(data)).rejects.toThrow(/email/);
  });

  test('requires created_by', async () => {
    const { created_by, ...data } = validCustomerData;
    await expect(Customer.create(data)).rejects.toThrow(/created_by/);
  });

  test('alias requires source_system', async () => {
    const data = {
      ...validCustomerData,
      aliases: [{ source_key: 'KEY', original_payload: {}, added_by: 'user' }]
    };
    await expect(Customer.create(data)).rejects.toThrow(/source_system/);
  });

  test('alias requires source_key', async () => {
    const data = {
      ...validCustomerData,
      aliases: [{ source_system: 'SYS', original_payload: {}, added_by: 'user' }]
    };
    await expect(Customer.create(data)).rejects.toThrow(/source_key/);
  });

  test('stores change history', async () => {
    const customer = await Customer.create(validCustomerData);
    customer.change_history.push({
      changed_by: 'updater',
      changed_at: new Date(),
      delta: { first_name: { from: 'John', to: 'Jane' } }
    });
    await customer.save();

    const found = await Customer.findById(customer._id);
    expect(found.change_history).toHaveLength(1);
    expect(found.change_history[0].changed_by).toBe('updater');
  });

  test('defaults phone to empty string', async () => {
    const customer = await Customer.create(validCustomerData);
    expect(customer.phone).toBe('');
  });

  test('defaults address fields to empty strings', async () => {
    const customer = await Customer.create(validCustomerData);
    expect(customer.address.street).toBe('');
    expect(customer.address.city).toBe('');
    expect(customer.address.state).toBe('');
    expect(customer.address.zip).toBe('');
  });

  test('stores search_tokens as array of strings', async () => {
    const customer = await Customer.create({
      ...validCustomerData,
      search_tokens: ['fn:JN', 'ln:T', 'em:john', 'ed:example.com']
    });
    expect(customer.search_tokens).toHaveLength(4);
    expect(customer.search_tokens).toContain('fn:JN');
  });

  test('defaults search_tokens to empty array', async () => {
    const customer = await Customer.create(validCustomerData);
    expect(customer.search_tokens).toEqual([]);
  });
});
