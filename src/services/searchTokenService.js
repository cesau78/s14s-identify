const DoubleMetaphone = require('doublemetaphone');
const { STREET_SUFFIXES, DIRECTIONALS, SECONDARY_UNITS } = require('./addressStandardizer');

const encoder = new DoubleMetaphone();

function phoneticTokens(value, prefix) {
  if (!value) return [];
  const result = encoder.doubleMetaphone(value.toLowerCase());
  if (!result || !result.primary) return [];
  const tokens = [`${prefix}${result.primary}`];
  if (result.alternate && result.alternate !== result.primary) {
    tokens.push(`${prefix}${result.alternate}`);
  }
  return tokens;
}

function prefixTokens(value, prefix, minLen = 2) {
  if (!value) return [];
  const lower = value.toLowerCase().trim();
  const tokens = [];
  for (let i = minLen; i <= lower.length; i++) {
    tokens.push(`${prefix}${lower.slice(0, i)}`);
  }
  return tokens;
}

function nameTokens(firstName, lastName) {
  return [
    ...phoneticTokens(firstName, 'fn:'),
    ...phoneticTokens(lastName, 'ln:'),
    ...prefixTokens(firstName, 'fp:'),
    ...prefixTokens(lastName, 'lp:')
  ];
}

function emailTokens(email) {
  if (!email) return [];
  const parts = email.toLowerCase().split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return [];
  return [`em:${parts[0]}`, `ed:${parts[1]}`];
}

function phoneTokens(phone) {
  if (!phone) return [];
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return [];
  const tokens = [`ph:${digits.slice(-4)}`];
  if (digits.length >= 7) {
    tokens.push(`ph:${digits.slice(-7)}`);
  }
  return tokens;
}

function isNonNameWord(word) {
  const lower = word.toLowerCase();
  return !!(STREET_SUFFIXES[lower] || DIRECTIONALS[lower] || SECONDARY_UNITS[lower]);
}

function addressTokens(address) {
  if (!address) return [];
  const tokens = [];

  if (address.street) {
    const words = address.street.trim().split(/\s+/);
    const numberMatch = words[0] && words[0].match(/^(\d+[A-Za-z]?)$/);
    if (numberMatch) {
      tokens.push(`sn:${numberMatch[1]}`);
    }

    for (const word of words) {
      if (/^\d/.test(word)) continue;
      if (isNonNameWord(word)) continue;
      if (word.length <= 1) continue;
      const phonetic = phoneticTokens(word, 'ss:');
      tokens.push(...phonetic);
    }
  }

  if (address.zip) {
    const zipDigits = address.zip.replace(/\D/g, '');
    if (zipDigits.length >= 5) {
      tokens.push(`zp:${zipDigits.slice(0, 5)}`);
    }
  }

  return tokens;
}

function generateSearchTokens(data) {
  if (!data) return [];

  const tokens = [
    ...nameTokens(data.first_name, data.last_name),
    ...emailTokens(data.email),
    ...phoneTokens(data.phone),
    ...addressTokens(data.address)
  ];

  return [...new Set(tokens)];
}

const { getFormalName } = require('./nicknameDictionary');

function generateSearchQueryTokens(query) {
  if (!query) return [];
  const term = query.toLowerCase().trim();
  if (term.length < 2) return [];
  const tokens = [`fp:${term}`, `lp:${term}`];
  // If the query is a known nickname, also search by the formal name prefix
  const formal = getFormalName(term);
  if (formal) {
    tokens.push(`fp:${formal}`, `lp:${formal}`);
  }
  return [...new Set(tokens)];
}

module.exports = {
  generateSearchTokens,
  generateSearchQueryTokens,
  nameTokens,
  emailTokens,
  phoneTokens,
  addressTokens,
  phoneticTokens,
  prefixTokens,
  isNonNameWord
};
