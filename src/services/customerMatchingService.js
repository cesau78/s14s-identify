const stringSimilarity = require('string-similarity');

const MATCH_THRESHOLD = 0.997;

const FIELD_WEIGHTS = {
  first_name: 0.2,
  last_name: 0.25,
  email: 0.35,
  phone: 0.1,
  address_composite: 0.1
};

function normalizeString(value) {
  if (!value) return '';
  return String(value).trim().toLowerCase();
}

function buildAddressComposite(address) {
  if (!address) return '';
  return normalizeString(
    [address.street, address.city, address.state, address.zip]
      .filter(Boolean)
      .join(' ')
  );
}

function calculateConfidence(incoming, existing) {
  let totalWeight = 0;
  let weightedScore = 0;

  const pairs = [
    { field: 'first_name', a: normalizeString(incoming.first_name), b: normalizeString(existing.first_name) },
    { field: 'last_name', a: normalizeString(incoming.last_name), b: normalizeString(existing.last_name) },
    { field: 'email', a: normalizeString(incoming.email), b: normalizeString(existing.email) },
    { field: 'phone', a: normalizeString(incoming.phone), b: normalizeString(existing.phone) },
    { field: 'address_composite', a: buildAddressComposite(incoming.address), b: buildAddressComposite(existing.address) }
  ];

  for (const { field, a, b } of pairs) {
    if (!a && !b) continue;

    const weight = FIELD_WEIGHTS[field];
    totalWeight += weight;

    if (!a || !b) {
      continue;
    }

    const similarity = stringSimilarity.compareTwoStrings(a, b);
    weightedScore += similarity * weight;
  }

  if (totalWeight === 0) return 0;

  return weightedScore / totalWeight;
}

async function findMatch(Customer, incomingData) {
  const candidates = await Customer.find({ deleted_at: null });

  let bestMatch = null;
  let bestConfidence = 0;

  for (const candidate of candidates) {
    const confidence = calculateConfidence(incomingData, candidate);
    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestMatch = candidate;
    }
  }

  if (bestConfidence >= MATCH_THRESHOLD) {
    return { match: bestMatch, confidence: bestConfidence };
  }

  return { match: null, confidence: bestConfidence };
}

module.exports = {
  calculateConfidence,
  findMatch,
  normalizeString,
  buildAddressComposite,
  MATCH_THRESHOLD
};
