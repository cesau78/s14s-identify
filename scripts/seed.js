require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('../src/models/customer');
const { generateSearchTokens } = require('../src/services/searchTokenService');
const { standardizeAddress } = require('../src/services/addressStandardizer');
const { normalizePhoneToE164 } = require('../src/services/inputSanitizer');

const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
  'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Christopher', 'Karen', 'Charles', 'Lisa', 'Daniel', 'Nancy',
  'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley',
  'Steven', 'Kimberly', 'Paul', 'Emily', 'Andrew', 'Donna', 'Joshua', 'Michelle',
  'Kenneth', 'Carol', 'Kevin', 'Amanda', 'Brian', 'Dorothy', 'George', 'Melissa',
  'Timothy', 'Deborah'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
  'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
  'Carter', 'Roberts'
];

const STREETS = [
  'Main', 'Oak', 'Elm', 'Maple', 'Cedar', 'Pine', 'Walnut', 'Washington',
  'Park', 'Lake', 'Hill', 'Sunset', 'Lincoln', 'Jackson', 'Church', 'Mill',
  'Spring', 'Highland', 'Forest', 'Meadow', 'River', 'Valley', 'Willow', 'Birch'
];

const SUFFIXES = ['Street', 'Avenue', 'Boulevard', 'Drive', 'Lane', 'Court', 'Road', 'Place', 'Way', 'Circle'];
const DIRECTIONALS = ['', '', '', '', 'North', 'South', 'East', 'West']; // weighted toward no directional
const CITIES = [
  'Springfield', 'Dallas', 'Austin', 'Chicago', 'Houston', 'Phoenix', 'San Antonio',
  'San Diego', 'Denver', 'Portland', 'Seattle', 'Nashville', 'Charlotte', 'Columbus',
  'Indianapolis', 'Jacksonville', 'Memphis', 'Milwaukee', 'Raleigh', 'Richmond'
];
const STATES = ['IL', 'TX', 'CA', 'NY', 'FL', 'OH', 'PA', 'GA', 'NC', 'MI', 'CO', 'WA', 'OR', 'TN', 'AZ'];
const EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 'proton.me', 'icloud.com', 'mail.com'];
const SOURCE_SYSTEMS = ['CRM', 'BILLING', 'SUPPORT', 'ECOMMERCE', 'LOYALTY'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePhone() {
  const area = randomInt(200, 999);
  const exchange = randomInt(200, 999);
  const subscriber = randomInt(1000, 9999);
  return `(${area}) ${exchange}-${subscriber}`;
}

function generateZip() {
  return String(randomInt(10000, 99999));
}

function generateCustomer(index) {
  const firstName = pick(FIRST_NAMES);
  const lastName = pick(LAST_NAMES);
  const emailLocal = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomInt(1, 999)}`;
  const email = `${emailLocal}@${pick(EMAIL_DOMAINS)}`;
  const phone = normalizePhoneToE164(generatePhone());

  const dir = pick(DIRECTIONALS);
  const streetNum = randomInt(100, 9999);
  const rawStreet = `${dir ? dir + ' ' : ''}${streetNum} ${pick(STREETS)} ${pick(SUFFIXES)}`;
  const rawAddress = {
    street: rawStreet,
    city: pick(CITIES),
    state: pick(STATES),
    zip: generateZip()
  };
  const address = standardizeAddress(rawAddress);

  const sourceSystem = pick(SOURCE_SYSTEMS);
  const sourceKey = `${sourceSystem}-${randomInt(10000, 99999)}`;

  const customerFields = { first_name: firstName, last_name: lastName, email, phone, address };
  const now = new Date();

  return {
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    address,
    aliases: [{
      source_system: sourceSystem,
      source_key: sourceKey,
      original_payload: { first_name: firstName, last_name: lastName, email, phone, address: rawAddress, source_system: sourceSystem, source_key: sourceKey },
      added_by: 'seed-script',
      added_at: now,
      match_confidence: null,
      match_algorithm: null
    }],
    change_history: [],
    created_by: 'seed-script',
    created_at: now,
    search_tokens: generateSearchTokens(customerFields)
  };
}

async function seed() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/s14s-identify';
  console.log(`Connecting to ${uri}...`);
  await mongoose.connect(uri);

  const existing = await Customer.countDocuments();
  console.log(`Existing customers: ${existing}`);

  const COUNT = parseInt(process.argv[2], 10) || 1000;
  console.log(`Generating ${COUNT} customers...`);

  const batch = [];
  for (let i = 0; i < COUNT; i++) {
    batch.push(generateCustomer(i));
  }

  await Customer.insertMany(batch);
  console.log(`Seeded ${COUNT} customers. Total: ${existing + COUNT}`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
