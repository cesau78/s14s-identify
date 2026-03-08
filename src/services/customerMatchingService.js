const jaroWinkler = require('jaro-winkler');
const { generateSearchTokens } = require('./searchTokenService');

// Fellegi-Sunter probabilistic record linkage
//
// For each comparison field we define:
//   m = P(agree | true match)     — how often this field agrees when records truly match
//   u = P(agree | not a match)    — how often this field agrees by coincidence
//
// Agreement weight:   log2(m / u)
// Disagreement weight: log2((1 - m) / (1 - u))
//
// The composite score is the sum of per-field weights.
// We convert to a probability via: P(match) = (score - min) / (max - min)

const FIELD_CONFIG = {
  first_name: {
    m: 0.95,   // true matches agree 95% (typos, nicknames reduce this)
    u: 0.005,  // random pairs share a first name ~0.5%
    compare: 'jaroWinkler',
    similarityThreshold: 0.85
  },
  last_name: {
    m: 0.95,
    u: 0.002,  // last names are more distinctive
    compare: 'jaroWinkler',
    similarityThreshold: 0.85
  },
  email: {
    m: 0.90,
    u: 0.0001, // emails are nearly unique
    compare: 'exact',
    similarityThreshold: 1.0
  },
  phone: {
    m: 0.85,
    u: 0.0005,
    compare: 'exact',
    similarityThreshold: 1.0
  },
  address_composite: {
    m: 0.80,
    u: 0.005,
    compare: 'jaroWinkler',
    similarityThreshold: 0.80
  }
};

const MATCH_THRESHOLD = 0.95;
const REVIEW_THRESHOLD = 0.70;

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

function computeAgreementWeight(m, u) {
  return Math.log2(m / u);
}

function computeDisagreementWeight(m, u) {
  return Math.log2((1 - m) / (1 - u));
}

function compareField(a, b, config) {
  if (!a && !b) return null; // both missing — skip field

  if (!a || !b) return false; // one missing — disagreement

  if (config.compare === 'jaroWinkler') {
    const similarity = jaroWinkler(a, b);
    return similarity >= config.similarityThreshold;
  }

  return a === b;
}

function calculateFellegiSunterScore(incoming, existing) {
  const pairs = [
    { field: 'first_name', a: normalizeString(incoming.first_name), b: normalizeString(existing.first_name) },
    { field: 'last_name', a: normalizeString(incoming.last_name), b: normalizeString(existing.last_name) },
    { field: 'email', a: normalizeString(incoming.email), b: normalizeString(existing.email) },
    { field: 'phone', a: normalizeString(incoming.phone), b: normalizeString(existing.phone) },
    { field: 'address_composite', a: buildAddressComposite(incoming.address), b: buildAddressComposite(existing.address) }
  ];

  let score = 0;
  let maxScore = 0;
  let minScore = 0;

  for (const { field, a, b } of pairs) {
    const config = FIELD_CONFIG[field];
    const agreeWeight = computeAgreementWeight(config.m, config.u);
    const disagreeWeight = computeDisagreementWeight(config.m, config.u);

    const agreement = compareField(a, b, config);

    if (agreement === null) continue; // both empty — skip

    maxScore += agreeWeight;
    minScore += disagreeWeight;

    if (agreement) {
      score += agreeWeight;
    } else {
      score += disagreeWeight;
    }
  }

  if (maxScore === minScore) return 0;

  return (score - minScore) / (maxScore - minScore);
}

async function findMatch(Customer, incomingData) {
  const tokens = generateSearchTokens(incomingData);

  const candidates = tokens.length > 0
    ? await Customer.find({ search_tokens: { $in: tokens }, deleted_at: null })
    : [];

  let bestMatch = null;
  let bestConfidence = 0;
  const nearMisses = [];

  for (const candidate of candidates) {
    const confidence = calculateFellegiSunterScore(incomingData, candidate);
    if (confidence > bestConfidence) {
      // Demote previous best to near-miss if it qualifies
      if (bestMatch && bestConfidence >= REVIEW_THRESHOLD && bestConfidence < MATCH_THRESHOLD) {
        nearMisses.push({ candidate: bestMatch, confidence: bestConfidence });
      }
      bestConfidence = confidence;
      bestMatch = candidate;
    } else if (confidence >= REVIEW_THRESHOLD && confidence < MATCH_THRESHOLD) {
      nearMisses.push({ candidate, confidence });
    }
  }

  if (bestConfidence >= MATCH_THRESHOLD) {
    return { match: bestMatch, confidence: bestConfidence, nearMisses: [] };
  }

  // Best match didn't meet auto-approve — include it in near-misses if it qualifies
  if (bestMatch && bestConfidence >= REVIEW_THRESHOLD) {
    nearMisses.push({ candidate: bestMatch, confidence: bestConfidence });
  }

  // Sort near-misses by confidence descending
  nearMisses.sort((a, b) => b.confidence - a.confidence);

  return { match: null, confidence: bestConfidence, nearMisses };
}

module.exports = {
  calculateFellegiSunterScore,
  findMatch,
  normalizeString,
  buildAddressComposite,
  compareField,
  computeAgreementWeight,
  computeDisagreementWeight,
  MATCH_THRESHOLD,
  REVIEW_THRESHOLD,
  FIELD_CONFIG
};
