const express = require('express');
const mongoose = require('mongoose');
const Customer = require('../models/customer');
const MatchFeedback = require('../models/matchFeedback');
const { findMatch } = require('../services/customerMatchingService');
const { computeDelta, CUSTOMER_AUDITABLE_FIELDS } = require('../services/auditDelta');
const { sanitizeCustomerInput, sanitizeCustomerUpdate } = require('../services/inputSanitizer');
const { generateSearchTokens, generateSearchQueryTokens } = require('../services/searchTokenService');

const router = express.Router();

function customerResponse(customer, show = []) {
  const response = {
    _id: customer._id,
    first_name: customer.first_name,
    last_name: customer.last_name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    created_by: customer.created_by,
    created_at: customer.created_at,
    updated_by: customer.updated_by,
    updated_at: customer.updated_at,
    deleted_by: customer.deleted_by,
    deleted_at: customer.deleted_at
  };
  if (show.includes('aliases')) response.aliases = customer.aliases;
  if (show.includes('changes')) response.changes = customer.change_history;
  return response;
}

function parseShow(query) {
  if (!query.show) return [];
  return query.show.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Address:
 *       type: object
 *       description: Physical mailing address. State is stored uppercase (e.g. "TX").
 *       properties:
 *         street:
 *           type: string
 *           example: '123 Main St'
 *         city:
 *           type: string
 *           example: 'Springfield'
 *         state:
 *           type: string
 *           description: Two-letter state code (auto-uppercased)
 *           example: 'IL'
 *         zip:
 *           type: string
 *           example: '62701'
 *     Alias:
 *       type: object
 *       description: A cross-system identity link. Each alias represents the same physical person as identified by a different source system.
 *       required:
 *         - source_system
 *         - source_key
 *       properties:
 *         source_system:
 *           type: string
 *           description: Identifier for the source system (e.g. "CRM", "BILLING")
 *           example: 'CRM'
 *         source_key:
 *           type: string
 *           description: Primary key from the source system
 *           example: 'CRM-10042'
 *         original_payload:
 *           type: object
 *           description: Complete original POST body, preserved as-is for traceability
 *         added_by:
 *           type: string
 *           description: User who linked this alias (from x-user-id header)
 *         added_at:
 *           type: string
 *           format: date-time
 *         match_confidence:
 *           type: number
 *           nullable: true
 *           description: >
 *             Fellegi-Sunter match confidence score (0-1) when this alias was linked
 *             to an existing record. Null for the first alias (record creation).
 *           example: 0.998
 *         match_algorithm:
 *           type: string
 *           nullable: true
 *           description: >
 *             Algorithm used for matching (e.g. "fellegi-sunter").
 *             Null for the first alias (record creation).
 *           example: 'fellegi-sunter'
 *     ChangeRecord:
 *       type: object
 *       description: An audit trail entry recording who changed what and when.
 *       properties:
 *         changed_by:
 *           type: string
 *           description: User who made the change (from x-user-id header)
 *         changed_at:
 *           type: string
 *           format: date-time
 *         delta:
 *           type: object
 *           description: 'Field-level diff with { from, to } values for each changed field'
 *           example:
 *             email:
 *               from: 'old@example.com'
 *               to: 'new@example.com'
 *     ValidationError:
 *       type: object
 *       description: Returned when input validation fails. All errors are collected and returned at once.
 *       properties:
 *         errors:
 *           type: array
 *           items:
 *             type: string
 *           description: List of validation error messages
 *           example:
 *             - 'first_name is required'
 *             - 'email format is invalid'
 *     CustomerInput:
 *       type: object
 *       description: >
 *         Payload for creating or matching a customer. All string fields are trimmed.
 *         Email is lowercased. Phone is normalized to E.164 format (e.g. +12148675309).
 *         The system uses Fellegi-Sunter probabilistic matching to determine if this
 *         record matches an existing customer at >= 99.7% confidence.
 *       required:
 *         - first_name
 *         - last_name
 *         - email
 *         - source_system
 *         - source_key
 *       properties:
 *         first_name:
 *           type: string
 *           example: 'John'
 *         last_name:
 *           type: string
 *           example: 'Doe'
 *         email:
 *           type: string
 *           format: email
 *           description: Validated and stored lowercase
 *           example: 'john.doe@example.com'
 *         phone:
 *           type: string
 *           description: >
 *             Optional. Accepts any common format — parentheses, dashes, spaces, or
 *             country code prefix. Normalized to E.164 format for storage
 *             (e.g. "(214) 867-5309" becomes "+12148675309"). Validated against real
 *             telephony rules using libphonenumber. Default country is US.
 *           example: '(214) 867-5309'
 *         address:
 *           $ref: '#/components/schemas/Address'
 *         source_system:
 *           type: string
 *           description: Identifier for the originating system
 *           example: 'CRM'
 *         source_key:
 *           type: string
 *           description: Primary key in the originating system
 *           example: 'CRM-10042'
 *     CustomerUpdate:
 *       type: object
 *       description: >
 *         Partial update payload. Only include fields you want to change.
 *         Fields present in the body cannot be set to empty (prevents accidental data erasure).
 *         Phone is normalized to E.164. Email is validated and lowercased.
 *       properties:
 *         first_name:
 *           type: string
 *         last_name:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         phone:
 *           type: string
 *           description: Normalized to E.164 format. Send empty string to clear.
 *         address:
 *           $ref: '#/components/schemas/Address'
 *     Customer:
 *       type: object
 *       description: >
 *         The canonical customer record. Phone is stored in E.164 format.
 *         The aliases array links this record to identities in other systems.
 *       properties:
 *         _id:
 *           type: string
 *         first_name:
 *           type: string
 *         last_name:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         phone:
 *           type: string
 *           description: Stored in E.164 format (e.g. "+12148675309")
 *         address:
 *           $ref: '#/components/schemas/Address'
 *         aliases:
 *           type: array
 *           description: Cross-system identity links added via POST matching or manual linking
 *           items:
 *             $ref: '#/components/schemas/Alias'
 *         created_by:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_by:
 *           type: string
 *         updated_at:
 *           type: string
 *           format: date-time
 *         deleted_by:
 *           type: string
 *           description: Set when soft-deleted
 *         deleted_at:
 *           type: string
 *           format: date-time
 *           description: Set when soft-deleted
 */

/**
 * @swagger
 * /customers:
 *   post:
 *     summary: Create or match a customer
 *     description: >
 *       Runs the incoming record through the Fellegi-Sunter probabilistic matching
 *       algorithm against all existing customers. Uses Jaro-Winkler distance for
 *       name/address comparison and exact matching for email/phone.
 *
 *
 *       If a match of >= 99.7% confidence is found, the incoming data is added as
 *       an alias to the existing record (200). Otherwise, a new customer record
 *       is created (201).
 *
 *
 *       All inputs are sanitized: strings are trimmed, email is lowercased, phone
 *       is normalized to E.164 format, and address state is uppercased.
 *     tags: [Customers]
 *     parameters:
 *       - in: header
 *         name: x-user-id
 *         schema:
 *           type: string
 *         description: User performing the action (used for audit trail)
 *         example: 'admin-user'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CustomerInput'
 *     responses:
 *       200:
 *         description: >
 *           Matched existing customer at >= 99.7% confidence.
 *           The incoming data was added as an alias to the existing record.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Customer'
 *       201:
 *         description: >
 *           No match found. A new customer record was created with the
 *           incoming data as its first alias.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Customer'
 *       400:
 *         description: >
 *           Input validation failed. Returns all errors at once so the client
 *           can fix them in a single pass.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 */
router.post('/', async (req, res) => {
  try {
    const { errors, sanitized } = sanitizeCustomerInput(req.body);

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const { source_system, source_key, ...customerFields } = sanitized;

    const { match, confidence } = await findMatch(Customer, customerFields);

    if (match) {
      match.aliases.push({
        source_system,
        source_key,
        original_payload: req.body,
        added_by: req.audit_user,
        added_at: new Date(),
        match_confidence: confidence,
        match_algorithm: 'fellegi-sunter'
      });
      match.updated_by = req.audit_user;
      match.updated_at = new Date();
      match.change_history.push({
        changed_by: req.audit_user,
        changed_at: new Date(),
        delta: { aliases: { action: 'added', source_system, source_key } }
      });

      await match.save();
      return res.status(200).json(customerResponse(match));
    }

    const now = new Date();
    const customer = new Customer({
      ...customerFields,
      aliases: [{
        source_system,
        source_key,
        original_payload: req.body,
        added_by: req.audit_user,
        added_at: now,
        match_confidence: null,
        match_algorithm: null
      }],
      change_history: [],
      created_by: req.audit_user,
      created_at: now,
      search_tokens: generateSearchTokens(customerFields)
    });

    await customer.save();
    return res.status(201).json(customerResponse(customer));
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ errors: [error.message] });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /customers:
 *   get:
 *     summary: List all active customers
 *     description: >
 *       Returns all customers that have not been soft-deleted.
 *       Use the include_deleted query parameter to also include soft-deleted records.
 *       Use under_review=true to return only customers with unresolved false positive
 *       feedback, ordered by most recent feedback first.
 *       Results are paginated.
 *     tags: [Customers]
 *     parameters:
 *       - in: query
 *         name: under_review
 *         schema:
 *           type: boolean
 *         description: >
 *           When true, returns only customers that have unresolved false positive
 *           match feedback. Results are ordered by most recent feedback first.
 *           Mutually exclusive with include_deleted.
 *       - in: query
 *         name: include_deleted
 *         schema:
 *           type: boolean
 *         description: Set to "true" to include soft-deleted customers in the results
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number (default 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Items per page (default 100, max 1000)
 *     responses:
 *       200:
 *         description: Array of customers (excludes change_history for brevity)
 *         headers:
 *           X-Total-Count:
 *             description: Total number of records matching criteria
 *             schema:
 *               type: integer
 *           X-Page:
 *             description: Current page
 *             schema:
 *               type: integer
 *           X-Limit:
 *             description: Current limit
 *             schema:
 *               type: integer
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Customer'
 */
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const defaultLimit = parseInt(process.env.DEFAULT_PAGE_SIZE, 10) || 100;
    const maxLimit = parseInt(process.env.MAX_PAGE_SIZE, 10) || 1000;

    let limit = parseInt(req.query.limit, 10) || defaultLimit;
    if (limit > maxLimit) limit = maxLimit;
    if (limit < 1) limit = 1;

    const skip = (page - 1) * limit;

    let customers, total;

    if (req.query.under_review === 'true') {
      // Find customers with unresolved false positive feedback, ordered by most recent feedback
      const feedback = await MatchFeedback.find({
        type: 'false_positive',
        resolved: false
      }).sort({ reported_at: -1 });

      // Deduplicate customer IDs while preserving order
      const seen = new Set();
      const orderedCustomerIds = [];
      for (const f of feedback) {
        const id = f.customer_id.toString();
        if (!seen.has(id)) {
          seen.add(id);
          orderedCustomerIds.push(f.customer_id);
        }
      }

      total = orderedCustomerIds.length;
      const pagedIds = orderedCustomerIds.slice(skip, skip + limit);

      const fetched = await Customer.find({ _id: { $in: pagedIds } });
      // Re-sort to match feedback order
      const idOrder = new Map(pagedIds.map((id, i) => [id.toString(), i]));
      customers = fetched.sort((a, b) => idOrder.get(a._id.toString()) - idOrder.get(b._id.toString()));
    } else {
      const filter = req.query.include_deleted === 'true' ? {} : { deleted_at: null };

      [customers, total] = await Promise.all([
        Customer.find(filter).skip(skip).limit(limit),
        Customer.countDocuments(filter)
      ]);
    }

    res.set('X-Total-Count', total.toString());
    res.set('X-Page', page.toString());
    res.set('X-Limit', limit.toString());

    const lastPage = Math.ceil(total / limit) || 1;
    const links = [];
    const generateUrl = (p) => {
      const params = new URLSearchParams(req.query);
      params.set('page', p);
      params.set('limit', limit);
      return `${req.protocol}://${req.get('host')}${req.baseUrl}?${params.toString()}`;
    };

    if (page < lastPage) {
      links.push(`<${generateUrl(page + 1)}>; rel="next"`);
    }
    if (page > 1) {
      links.push(`<${generateUrl(page - 1)}>; rel="prev"`);
    }
    links.push(`<${generateUrl(1)}>; rel="first"`);
    links.push(`<${generateUrl(lastPage)}>; rel="last"`);

    if (links.length > 0) {
      res.set('Link', links.join(', '));
    }

    return res.status(200).json(customers.map(c => customerResponse(c)));
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /customers/search:
 *   get:
 *     summary: Typeahead search for customers by name
 *     description: >
 *       Prefix-based search across first and last names, optimized for typeahead
 *       at scale (10M+ records). Requires at least 2 characters. Uses indexed
 *       prefix tokens for O(log n) lookups — no collection scans.
 *     tags: [Customers]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: >
 *           Name prefix to search for (minimum 2 characters). Matches against
 *           the beginning of first_name or last_name, case-insensitive.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Maximum results to return (default 20, max 100)
 *     responses:
 *       200:
 *         description: Array of matching customers
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Customer'
 *       400:
 *         description: Query too short (minimum 2 characters)
 */
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    let limit = parseInt(req.query.limit, 10) || 20;
    if (limit > 100) limit = 100;
    if (limit < 1) limit = 1;

    const queryTokens = generateSearchQueryTokens(q);

    const customers = await Customer.find({
      search_tokens: { $in: queryTokens },
      deleted_at: null
    }).limit(limit);

    return res.status(200).json(customers.map(c => customerResponse(c)));
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /customers/{id}:
 *   get:
 *     summary: Get a customer by ID
 *     description: >
 *       Returns a single customer record. Soft-deleted customers are not returned.
 *       By default, aliases and changes are excluded. Use the show query parameter
 *       to include them (e.g. ?show=aliases,changes).
 *     tags: [Customers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: show
 *         schema:
 *           type: string
 *         description: >
 *           Comma-separated list of child resources to include in the response.
 *           Valid values: aliases, changes. Example: ?show=aliases,changes
 *       - in: query
 *         name: source_system
 *         schema:
 *           type: string
 *         description: >
 *           When provided, returns the original record from the specified source system
 *           instead of the canonical/standardized record. The response fields (first_name,
 *           last_name, email, phone, address) are overlaid from the alias's original_payload.
 *           Returns 404 if no alias exists for the given source_system.
 *     responses:
 *       200:
 *         description: Customer found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Customer'
 *       404:
 *         description: Customer not found or has been soft-deleted
 */
router.get('/:id', async (req, res) => {
  try {
    // Retrieve record regardless of deletion status to check for merges
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (customer.merged_into) {
      return res.status(301).location(`/customers/${customer.merged_into}`).json({
        error: 'Moved Permanently',
        message: 'This record has been merged into another.',
        target_id: customer.merged_into
      });
    }

    if (customer.deleted_at) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const show = parseShow(req.query);
    const response = customerResponse(customer, show);

    // If source_system is specified, overlay original_payload from that alias
    if (req.query.source_system) {
      const alias = customer.aliases.find(
        a => a.source_system === req.query.source_system
      );
      if (!alias) {
        return res.status(404).json({
          error: `No alias found for source_system '${req.query.source_system}'`
        });
      }
      const orig = alias.original_payload || {};
      if (orig.first_name !== undefined) response.first_name = orig.first_name;
      if (orig.last_name !== undefined) response.last_name = orig.last_name;
      if (orig.email !== undefined) response.email = orig.email;
      if (orig.phone !== undefined) response.phone = orig.phone;
      if (orig.address !== undefined) response.address = orig.address;
      response.source_system = alias.source_system;
      response.source_key = alias.source_key;
    }

    return res.status(200).json(response);
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Customer not found' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /customers/{id}:
 *   put:
 *     summary: Update a customer
 *     description: >
 *       Partially updates a customer record. Only include fields you want to change.
 *       Fields cannot be set to empty (prevents accidental data erasure).
 *       Phone is normalized to E.164, email is validated and lowercased.
 *       All changes are recorded in the audit trail with field-level deltas.
 *     tags: [Customers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: x-user-id
 *         schema:
 *           type: string
 *         description: User performing the action (used for audit trail)
 *         example: 'admin-user'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CustomerUpdate'
 *     responses:
 *       200:
 *         description: Customer updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Customer'
 *       400:
 *         description: Input validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       404:
 *         description: Customer not found or has been soft-deleted
 */
router.put('/:id', async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, deleted_at: null });
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const { errors, sanitized } = sanitizeCustomerUpdate(req.body);

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const originalData = customer.toObject();

    if (sanitized.first_name !== undefined) customer.first_name = sanitized.first_name;
    if (sanitized.last_name !== undefined) customer.last_name = sanitized.last_name;
    if (sanitized.email !== undefined) customer.email = sanitized.email;
    if (sanitized.phone !== undefined) customer.phone = sanitized.phone;
    if (sanitized.address !== undefined) {
      const currentAddress = customer.toObject().address;
      customer.address = { ...currentAddress, ...sanitized.address };
    }

    const delta = computeDelta(originalData, customer.toObject(), CUSTOMER_AUDITABLE_FIELDS);

    if (Object.keys(delta).length > 0) {
      customer.change_history.push({
        changed_by: req.audit_user,
        changed_at: new Date(),
        delta
      });
    }

    customer.updated_by = req.audit_user;
    customer.updated_at = new Date();

    customer.search_tokens = generateSearchTokens({
      first_name: customer.first_name,
      last_name: customer.last_name,
      email: customer.email,
      phone: customer.phone,
      address: customer.toObject().address
    });

    await customer.save();
    return res.status(200).json(customerResponse(customer));
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Customer not found' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ errors: [error.message] });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /customers/{id}:
 *   patch:
 *     summary: Merge another customer into this one
 *     description: >
 *       Merges a source customer into the target customer identified by {id}.
 *       The source customer's aliases are transferred to the target, the source
 *       is soft-deleted, and its merged_into field is set to the target's ID.
 *       Future GET requests for the source will return 301 redirecting to the target.
 *       Both records receive audit trail entries documenting the merge.
 *     tags: [Customers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the target (surviving) customer
 *       - in: header
 *         name: x-user-id
 *         schema:
 *           type: string
 *         description: User performing the action (used for audit trail)
 *         example: 'admin-user'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - merge
 *             properties:
 *               merge:
 *                 type: string
 *                 description: ID of the source customer to merge into the target
 *                 example: '60d5f484f1a2c8b1f8e4e1a2'
 *     responses:
 *       200:
 *         description: Merge completed successfully. Returns the updated target customer.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Customer'
 *       400:
 *         description: >
 *           Invalid request — merge field is missing, target and source are the same,
 *           or the source customer has already been merged.
 *       404:
 *         description: Target or source customer not found (or already soft-deleted)
 */
router.patch('/:id', async (req, res) => {
  try {
    const { merge: sourceId } = req.body;

    if (!sourceId) {
      return res.status(400).json({ error: 'merge field is required' });
    }

    if (req.params.id === sourceId) {
      return res.status(400).json({ error: 'Cannot merge a customer into itself' });
    }

    const [target, source] = await Promise.all([
      Customer.findOne({ _id: req.params.id, deleted_at: null }),
      Customer.findOne({ _id: sourceId, deleted_at: null })
    ]);

    if (!target) {
      return res.status(404).json({ error: 'Target customer not found' });
    }
    if (!source) {
      return res.status(404).json({ error: 'Source customer not found' });
    }
    if (source.merged_into) {
      return res.status(400).json({ error: 'Source customer has already been merged' });
    }

    const now = new Date();

    // Transfer aliases from source to target
    for (const alias of source.aliases) {
      target.aliases.push(alias);
    }

    target.updated_by = req.audit_user;
    target.updated_at = now;
    target.change_history.push({
      changed_by: req.audit_user,
      changed_at: now,
      delta: {
        merge: {
          action: 'merged',
          source_id: source._id,
          aliases_transferred: source.aliases.length
        }
      }
    });

    target.search_tokens = generateSearchTokens({
      first_name: target.first_name,
      last_name: target.last_name,
      email: target.email,
      phone: target.phone,
      address: target.toObject().address
    });

    // Mark source as merged and soft-deleted
    source.merged_into = target._id;
    source.deleted_by = req.audit_user;
    source.deleted_at = now;
    source.change_history.push({
      changed_by: req.audit_user,
      changed_at: now,
      delta: {
        merge: {
          action: 'merged_into',
          target_id: target._id
        }
      }
    });

    // Record false negative — the system failed to auto-match these records
    const falseNegative = new MatchFeedback({
      type: 'false_negative',
      customer_id: target._id,
      related_customer_id: source._id,
      reported_by: req.audit_user,
      reported_at: now,
      resolved: true,
      resolved_at: now,
      notes: 'Auto-recorded: manual merge indicates missed auto-match'
    });

    // All three saves must succeed or none — use a transaction
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await target.save({ session });
        await source.save({ session });
        await falseNegative.save({ session });
      });
    } finally {
      await session.endSession();
    }

    return res.status(200).json(customerResponse(target));
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Customer not found' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /customers/{id}:
 *   delete:
 *     summary: Soft delete a customer
 *     description: >
 *       Marks a customer as deleted by setting deleted_by and deleted_at.
 *       The record is not physically removed and can still be retrieved
 *       using the include_deleted query parameter on the list endpoint.
 *       The deletion is recorded in the audit trail.
 *     tags: [Customers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: x-user-id
 *         schema:
 *           type: string
 *         description: User performing the action (used for audit trail)
 *         example: 'admin-user'
 *     responses:
 *       200:
 *         description: Customer soft-deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 'Customer deleted'
 *                 _id:
 *                   type: string
 *       404:
 *         description: Customer not found or already deleted
 */
router.delete('/:id', async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, deleted_at: null });
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    customer.deleted_by = req.audit_user;
    customer.deleted_at = new Date();
    customer.change_history.push({
      changed_by: req.audit_user,
      changed_at: new Date(),
      delta: { soft_delete: true }
    });

    await customer.save();
    return res.status(200).json({ message: 'Customer deleted', _id: customer._id });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Customer not found' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /customers/{id}/aliases:
 *   get:
 *     summary: Get aliases for a customer
 *     description: >
 *       Returns all cross-system identity links for a customer.
 *       Available even for soft-deleted customers.
 *     tags: [Customers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of aliases
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Alias'
 *       404:
 *         description: Customer not found
 */
router.get('/:id/aliases', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    return res.status(200).json(customer.aliases);
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Customer not found' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /customers/{id}/aliases/{aliasId}/feedback:
 *   post:
 *     summary: Report a false positive match
 *     description: >
 *       Reports that a specific alias was incorrectly matched to this customer
 *       (false positive). This feedback is used to compute F1 quality metrics
 *       and to suggest adjustments to the matching algorithm weights.
 *     tags: [Match Quality]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *       - in: path
 *         name: aliasId
 *         required: true
 *         schema:
 *           type: string
 *         description: Alias ID to report as incorrectly matched
 *       - in: header
 *         name: x-user-id
 *         schema:
 *           type: string
 *         description: User reporting the feedback
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 description: Optional explanation of why this match was incorrect
 *     responses:
 *       201:
 *         description: Feedback recorded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MatchFeedback'
 *       404:
 *         description: Customer or alias not found
 *       400:
 *         description: Alias was not an auto-match (no match_confidence)
 */
router.post('/:id/aliases/:aliasId/feedback', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const alias = customer.aliases.id(req.params.aliasId);
    if (!alias) {
      return res.status(404).json({ error: 'Alias not found' });
    }

    if (alias.match_confidence === null) {
      return res.status(400).json({ error: 'This alias was not an auto-match — no feedback applicable' });
    }

    const feedback = new MatchFeedback({
      type: 'false_positive',
      customer_id: customer._id,
      alias_id: alias._id,
      original_confidence: alias.match_confidence,
      original_algorithm: alias.match_algorithm,
      reported_by: req.audit_user,
      reported_at: new Date(),
      notes: (req.body && req.body.notes) || null
    });

    await feedback.save();
    return res.status(201).json(feedback);
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Customer or alias not found' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /customers/{id}/changes:
 *   get:
 *     summary: Get change history for a customer
 *     description: >
 *       Returns the full audit trail for a customer, including field-level deltas
 *       for every update, alias additions, and soft-deletion events.
 *       Available even for soft-deleted customers.
 *     tags: [Customers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chronological array of change records with field-level deltas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ChangeRecord'
 *       404:
 *         description: Customer not found
 */
router.get('/:id/changes', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    return res.status(200).json(customer.change_history);
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Customer not found' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
