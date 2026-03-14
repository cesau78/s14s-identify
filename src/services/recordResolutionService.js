function resolveCustomerFields(aliases) {
  if (!aliases || aliases.length === 0) return null;

  const nonSot = aliases
    .filter(a => !a.source_of_truth)
    .sort((a, b) => new Date(a.effective_date) - new Date(b.effective_date));

  const sot = aliases
    .filter(a => a.source_of_truth)
    .sort((a, b) => new Date(a.effective_date) - new Date(b.effective_date));

  const resolved = {
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: { street: '', city: '', state: '', zip: '' }
  };

  for (const alias of [...nonSot, ...sot]) {
    if (alias.first_name) resolved.first_name = alias.first_name;
    if (alias.last_name) resolved.last_name = alias.last_name;
    if (alias.email) resolved.email = alias.email;
    if (alias.phone) resolved.phone = alias.phone;
    if (alias.address) {
      if (alias.address.street) resolved.address.street = alias.address.street;
      if (alias.address.city) resolved.address.city = alias.address.city;
      if (alias.address.state) resolved.address.state = alias.address.state;
      if (alias.address.zip) resolved.address.zip = alias.address.zip;
    }
  }

  const allDates = aliases
    .map(a => new Date(a.effective_date))
    .filter(d => !isNaN(d.getTime()));
  resolved.effective_date = allDates.length > 0
    ? new Date(Math.max(...allDates))
    : new Date();

  return resolved;
}

module.exports = { resolveCustomerFields };
