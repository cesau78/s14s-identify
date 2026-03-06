const { parsePhoneNumberFromString } = require('libphonenumber-js');

function sanitizeString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function sanitizeEmail(value) {
  if (!value) return '';
  return sanitizeString(value).toLowerCase();
}

function normalizePhoneToE164(value, defaultCountry) {
  if (!value) return '';
  const cleaned = sanitizeString(value);
  if (!cleaned) return '';

  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry || 'US');
  if (parsed && parsed.isValid()) {
    return parsed.format('E.164');
  }

  return '';
}

function sanitizeAddress(address) {
  if (!address || typeof address !== 'object') return {};

  const result = {};
  if (address.street !== undefined) result.street = sanitizeString(address.street);
  if (address.city !== undefined) result.city = sanitizeString(address.city);
  if (address.state !== undefined) result.state = sanitizeString(address.state).toUpperCase();
  if (address.zip !== undefined) result.zip = sanitizeString(address.zip);
  return result;
}

function sanitizeCustomerInput(body) {
  const errors = [];

  const first_name = sanitizeString(body.first_name);
  const last_name = sanitizeString(body.last_name);
  const email = sanitizeEmail(body.email);
  const source_system = sanitizeString(body.source_system);
  const source_key = sanitizeString(body.source_key);

  if (!source_system || !source_key) {
    errors.push('source_system and source_key are required');
  }
  if (!first_name) errors.push('first_name is required');
  if (!last_name) errors.push('last_name is required');
  if (!email) {
    errors.push('email is required');
  } else if (!isValidEmail(email)) {
    errors.push('email format is invalid');
  }

  const phone = normalizePhoneToE164(body.phone);
  if (body.phone && !phone) {
    errors.push('phone format is invalid or unrecognized');
  }

  const address = sanitizeAddress(body.address);

  return {
    errors,
    sanitized: {
      first_name,
      last_name,
      email,
      phone,
      address,
      source_system,
      source_key
    }
  };
}

function sanitizeCustomerUpdate(body) {
  const errors = [];
  const sanitized = {};

  if (body.first_name !== undefined) {
    const val = sanitizeString(body.first_name);
    if (!val) {
      errors.push('first_name cannot be empty');
    } else {
      sanitized.first_name = val;
    }
  }

  if (body.last_name !== undefined) {
    const val = sanitizeString(body.last_name);
    if (!val) {
      errors.push('last_name cannot be empty');
    } else {
      sanitized.last_name = val;
    }
  }

  if (body.email !== undefined) {
    const val = sanitizeEmail(body.email);
    if (!val) {
      errors.push('email cannot be empty');
    } else if (!isValidEmail(val)) {
      errors.push('email format is invalid');
    } else {
      sanitized.email = val;
    }
  }

  if (body.phone !== undefined) {
    const val = normalizePhoneToE164(body.phone);
    if (body.phone && !val) {
      errors.push('phone format is invalid or unrecognized');
    } else {
      sanitized.phone = val;
    }
  }

  if (body.address !== undefined) {
    sanitized.address = sanitizeAddress(body.address);
  }

  return { errors, sanitized };
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = {
  sanitizeString,
  sanitizeEmail,
  normalizePhoneToE164,
  sanitizeAddress,
  sanitizeCustomerInput,
  sanitizeCustomerUpdate,
  isValidEmail
};
