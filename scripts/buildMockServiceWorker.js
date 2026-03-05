const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, '..', 'docs');
fs.mkdirSync(docsDir, { recursive: true });

const serviceWorkerJs = `
const DB = { customers: [], nextId: 1 };

function objectId() {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return Array.from({ length: 24 }, hex).join('');
}

function shallowResponse(c) {
  return {
    _id: c._id,
    first_name: c.first_name,
    last_name: c.last_name,
    email: c.email,
    phone: c.phone || '',
    address: c.address || { street: '', city: '', state: '', zip: '' },
    aliases: c.aliases,
    created_by: c.created_by,
    created_at: c.created_at,
    updated_by: c.updated_by,
    updated_at: c.updated_at,
    deleted_by: c.deleted_by,
    deleted_at: c.deleted_at
  };
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

function normalizeString(val) {
  if (!val) return '';
  return String(val).trim().toLowerCase();
}

function similarity(a, b) {
  a = normalizeString(a);
  b = normalizeString(b);
  if (a === b) return 1;
  if (!a || !b) return 0;
  const pairs = (s) => {
    const p = [];
    for (let i = 0; i < s.length - 1; i++) p.push(s.substring(i, i + 2));
    return p;
  };
  const aPairs = pairs(a);
  const bPairs = pairs(b);
  const union = aPairs.length + bPairs.length;
  let intersection = 0;
  const bCopy = [...bPairs];
  for (const p of aPairs) {
    const idx = bCopy.indexOf(p);
    if (idx !== -1) { intersection++; bCopy.splice(idx, 1); }
  }
  return union === 0 ? 0 : (2 * intersection) / union;
}

function calculateConfidence(incoming, existing) {
  const weights = { first_name: 0.2, last_name: 0.25, email: 0.35, phone: 0.1, address: 0.1 };
  let totalWeight = 0;
  let score = 0;

  const fields = [
    { key: 'first_name', a: incoming.first_name, b: existing.first_name },
    { key: 'last_name', a: incoming.last_name, b: existing.last_name },
    { key: 'email', a: incoming.email, b: existing.email },
    { key: 'phone', a: incoming.phone, b: existing.phone },
    { key: 'address', a: [incoming.address?.street, incoming.address?.city, incoming.address?.state, incoming.address?.zip].filter(Boolean).join(' '),
                       b: [existing.address?.street, existing.address?.city, existing.address?.state, existing.address?.zip].filter(Boolean).join(' ') }
  ];

  for (const f of fields) {
    const a = normalizeString(f.a);
    const b = normalizeString(f.b);
    if (!a && !b) continue;
    totalWeight += weights[f.key];
    if (a && b) score += similarity(a, b) * weights[f.key];
  }

  return totalWeight === 0 ? 0 : score / totalWeight;
}

function findMatch(incoming) {
  let bestMatch = null;
  let bestConfidence = 0;
  for (const c of DB.customers) {
    if (c.deleted_at) continue;
    const confidence = calculateConfidence(incoming, c);
    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestMatch = c;
    }
  }
  return bestConfidence >= 0.997 ? bestMatch : null;
}

function handlePost(body, auditUser) {
  const { source_system, source_key, ...fields } = body;

  if (!source_system || !source_key) {
    return jsonResponse({ error: 'source_system and source_key are required' }, 400);
  }
  if (!fields.first_name || !fields.last_name || !fields.email) {
    return jsonResponse({ error: 'first_name, last_name, and email are required' }, 400);
  }

  const match = findMatch(fields);
  const now = new Date().toISOString();

  if (match) {
    match.aliases.push({
      _id: objectId(),
      source_system,
      source_key,
      original_payload: body,
      added_by: auditUser,
      added_at: now
    });
    match.updated_by = auditUser;
    match.updated_at = now;
    match.change_history.push({
      changed_by: auditUser,
      changed_at: now,
      delta: { aliases: { action: 'added', source_system, source_key } }
    });
    return jsonResponse(shallowResponse(match), 200);
  }

  const customer = {
    _id: objectId(),
    ...fields,
    phone: fields.phone || '',
    address: fields.address || { street: '', city: '', state: '', zip: '' },
    aliases: [{
      _id: objectId(),
      source_system,
      source_key,
      original_payload: body,
      added_by: auditUser,
      added_at: now
    }],
    change_history: [],
    created_by: auditUser,
    created_at: now,
    updated_by: null,
    updated_at: null,
    deleted_by: null,
    deleted_at: null
  };
  DB.customers.push(customer);
  return jsonResponse(shallowResponse(customer), 201);
}

function handleGetAll(url) {
  const includeDeleted = url.searchParams.get('include_deleted') === 'true';
  const results = includeDeleted
    ? DB.customers
    : DB.customers.filter(c => !c.deleted_at);
  return jsonResponse(results.map(shallowResponse), 200);
}

function handleGetOne(id) {
  const customer = DB.customers.find(c => c._id === id && !c.deleted_at);
  if (!customer) return jsonResponse({ error: 'Customer not found' }, 404);
  return jsonResponse(customer, 200);
}

function handlePut(id, body, auditUser) {
  const customer = DB.customers.find(c => c._id === id && !c.deleted_at);
  if (!customer) return jsonResponse({ error: 'Customer not found' }, 404);

  const delta = {};
  const auditFields = ['first_name', 'last_name', 'email', 'phone'];
  for (const f of auditFields) {
    if (body[f] !== undefined && body[f] !== customer[f]) {
      delta[f] = { from: customer[f], to: body[f] };
      customer[f] = body[f];
    }
  }
  if (body.address) {
    const addrFields = ['street', 'city', 'state', 'zip'];
    for (const f of addrFields) {
      if (body.address[f] !== undefined && body.address[f] !== customer.address[f]) {
        delta['address.' + f] = { from: customer.address[f], to: body.address[f] };
        customer.address[f] = body.address[f];
      }
    }
  }

  const now = new Date().toISOString();
  if (Object.keys(delta).length > 0) {
    customer.change_history.push({ changed_by: auditUser, changed_at: now, delta });
  }
  customer.updated_by = auditUser;
  customer.updated_at = now;
  return jsonResponse(shallowResponse(customer), 200);
}

function handleDelete(id, auditUser) {
  const customer = DB.customers.find(c => c._id === id && !c.deleted_at);
  if (!customer) return jsonResponse({ error: 'Customer not found' }, 404);

  const now = new Date().toISOString();
  customer.deleted_by = auditUser;
  customer.deleted_at = now;
  customer.change_history.push({ changed_by: auditUser, changed_at: now, delta: { soft_delete: true } });
  return jsonResponse({ message: 'Customer deleted', _id: customer._id }, 200);
}

function handleHistory(id) {
  const customer = DB.customers.find(c => c._id === id);
  if (!customer) return jsonResponse({ error: 'Customer not found' }, 404);
  return jsonResponse(customer.change_history, 200);
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const path = url.pathname;

  // Only intercept /api/ requests
  if (!path.startsWith('/api/')) return;

  // Handle CORS preflight
  if (event.request.method === 'OPTIONS') {
    event.respondWith(new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-user-id'
      }
    }));
    return;
  }

  event.respondWith((async () => {
    const auditUser = event.request.headers.get('x-user-id') || 'demo-user';
    const method = event.request.method;

    // Health check
    if (path === '/api/health' || path === '/s14s-identify/api/health') {
      return jsonResponse({ status: 'ok' }, 200);
    }

    // Normalize path - strip base path if present
    const normalized = path.replace(/^\\/s14s-identify/, '');

    // POST /api/customers
    if (normalized === '/api/customers' && method === 'POST') {
      const body = await event.request.json();
      return handlePost(body, auditUser);
    }

    // GET /api/customers
    if (normalized === '/api/customers' && method === 'GET') {
      return handleGetAll(url);
    }

    // GET /api/customers/:id/history
    const historyMatch = normalized.match(/^\\/api\\/customers\\/([a-f0-9]+)\\/history$/);
    if (historyMatch && method === 'GET') {
      return handleHistory(historyMatch[1]);
    }

    // GET /api/customers/:id
    const idMatch = normalized.match(/^\\/api\\/customers\\/([a-f0-9]+)$/);
    if (idMatch && method === 'GET') {
      return handleGetOne(idMatch[1]);
    }

    // PUT /api/customers/:id
    if (idMatch && method === 'PUT') {
      const body = await event.request.json();
      return handlePut(idMatch[1], body, auditUser);
    }

    // DELETE /api/customers/:id
    if (idMatch && method === 'DELETE') {
      return handleDelete(idMatch[1], auditUser);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  })());
});
`;

fs.writeFileSync(path.join(docsDir, 'mockServiceWorker.js'), serviceWorkerJs.trim());
console.log('Mock ServiceWorker written to docs/mockServiceWorker.js');
