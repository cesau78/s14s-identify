function computeDelta(original, updated, fields) {
  const delta = {};

  for (const field of fields) {
    const oldVal = getNestedValue(original, field);
    const newVal = getNestedValue(updated, field);

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      delta[field] = { from: oldVal, to: newVal };
    }
  }

  return delta;
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current !== undefined && current !== null ? current[key] : undefined;
  }, obj);
}

const CUSTOMER_AUDITABLE_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'address.street',
  'address.city',
  'address.state',
  'address.zip'
];

module.exports = { computeDelta, getNestedValue, CUSTOMER_AUDITABLE_FIELDS };
