const express = require('express');
const Customer = require('../models/customer');
const { findMatch } = require('../services/customerMatchingService');
const { computeDelta, CUSTOMER_AUDITABLE_FIELDS } = require('../services/auditDelta');

const router = express.Router();

function shallowCustomerResponse(customer) {
  return {
    _id: customer._id,
    first_name: customer.first_name,
    last_name: customer.last_name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    aliases: customer.aliases,
    created_by: customer.created_by,
    created_at: customer.created_at,
    updated_by: customer.updated_by,
    updated_at: customer.updated_at,
    deleted_by: customer.deleted_by,
    deleted_at: customer.deleted_at
  };
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Address:
 *       type: object
 *       properties:
 *         street:
 *           type: string
 *         city:
 *           type: string
 *         state:
 *           type: string
 *         zip:
 *           type: string
 *     Alias:
 *       type: object
 *       required:
 *         - source_system
 *         - source_key
 *       properties:
 *         source_system:
 *           type: string
 *           description: Identifier for the source system
 *         source_key:
 *           type: string
 *           description: Primary key from the source system
 *         original_payload:
 *           type: object
 *           description: Original POST data from the source system
 *         added_by:
 *           type: string
 *         added_at:
 *           type: string
 *           format: date-time
 *     ChangeRecord:
 *       type: object
 *       properties:
 *         changed_by:
 *           type: string
 *         changed_at:
 *           type: string
 *           format: date-time
 *         delta:
 *           type: object
 *     CustomerInput:
 *       type: object
 *       required:
 *         - first_name
 *         - last_name
 *         - email
 *         - source_system
 *         - source_key
 *       properties:
 *         first_name:
 *           type: string
 *         last_name:
 *           type: string
 *         email:
 *           type: string
 *         phone:
 *           type: string
 *         address:
 *           $ref: '#/components/schemas/Address'
 *         source_system:
 *           type: string
 *           description: Identifier for the originating system
 *         source_key:
 *           type: string
 *           description: Primary key in the originating system
 *     CustomerUpdate:
 *       type: object
 *       properties:
 *         first_name:
 *           type: string
 *         last_name:
 *           type: string
 *         email:
 *           type: string
 *         phone:
 *           type: string
 *         address:
 *           $ref: '#/components/schemas/Address'
 *     Customer:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         first_name:
 *           type: string
 *         last_name:
 *           type: string
 *         email:
 *           type: string
 *         phone:
 *           type: string
 *         address:
 *           $ref: '#/components/schemas/Address'
 *         aliases:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Alias'
 *         change_history:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ChangeRecord'
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
 *         deleted_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /customers:
 *   post:
 *     summary: Create or match a customer
 *     description: >
 *       If a probabilistic match of 99.7% confidence or better is found,
 *       the incoming data is added as an alias to the existing record (200).
 *       Otherwise, a new customer record is created (201).
 *     tags: [Customers]
 *     parameters:
 *       - in: header
 *         name: x-user-id
 *         schema:
 *           type: string
 *         description: User performing the action
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CustomerInput'
 *     responses:
 *       200:
 *         description: Matched existing customer - alias added
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Customer'
 *       201:
 *         description: New customer created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Customer'
 *       400:
 *         description: Validation error
 */
router.post('/', async (req, res) => {
  try {
    const { source_system, source_key, ...customerFields } = req.body;

    if (!source_system || !source_key) {
      return res.status(400).json({ error: 'source_system and source_key are required' });
    }

    if (!customerFields.first_name || !customerFields.last_name || !customerFields.email) {
      return res.status(400).json({ error: 'first_name, last_name, and email are required' });
    }

    const { match } = await findMatch(Customer, customerFields);

    if (match) {
      match.aliases.push({
        source_system,
        source_key,
        original_payload: req.body,
        added_by: req.audit_user,
        added_at: new Date()
      });
      match.updated_by = req.audit_user;
      match.updated_at = new Date();
      match.change_history.push({
        changed_by: req.audit_user,
        changed_at: new Date(),
        delta: { aliases: { action: 'added', source_system, source_key } }
      });

      await match.save();
      return res.status(200).json(shallowCustomerResponse(match));
    }

    const now = new Date();
    const customer = new Customer({
      ...customerFields,
      aliases: [{
        source_system,
        source_key,
        original_payload: req.body,
        added_by: req.audit_user,
        added_at: now
      }],
      change_history: [],
      created_by: req.audit_user,
      created_at: now
    });

    await customer.save();
    return res.status(201).json(shallowCustomerResponse(customer));
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /customers:
 *   get:
 *     summary: List all active customers
 *     tags: [Customers]
 *     parameters:
 *       - in: query
 *         name: include_deleted
 *         schema:
 *           type: boolean
 *         description: Include soft-deleted customers
 *     responses:
 *       200:
 *         description: Array of customers
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Customer'
 */
router.get('/', async (req, res) => {
  try {
    const filter = req.query.include_deleted === 'true' ? {} : { deleted_at: null };
    const customers = await Customer.find(filter);
    return res.status(200).json(customers.map(shallowCustomerResponse));
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /customers/{id}:
 *   get:
 *     summary: Get a customer by ID
 *     tags: [Customers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Customer found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Customer'
 *       404:
 *         description: Customer not found
 */
router.get('/:id', async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, deleted_at: null });
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    return res.status(200).json(customer);
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
 *         description: User performing the action
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CustomerUpdate'
 *     responses:
 *       200:
 *         description: Customer updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Customer'
 *       404:
 *         description: Customer not found
 */
router.put('/:id', async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, deleted_at: null });
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const originalData = customer.toObject();
    const updateFields = req.body;

    if (updateFields.first_name !== undefined) customer.first_name = updateFields.first_name;
    if (updateFields.last_name !== undefined) customer.last_name = updateFields.last_name;
    if (updateFields.email !== undefined) customer.email = updateFields.email;
    if (updateFields.phone !== undefined) customer.phone = updateFields.phone;
    if (updateFields.address !== undefined) {
      const currentAddress = customer.toObject().address;
      customer.address = { ...currentAddress, ...updateFields.address };
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

    await customer.save();
    return res.status(200).json(shallowCustomerResponse(customer));
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Customer not found' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /customers/{id}:
 *   delete:
 *     summary: Soft delete a customer
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
 *         description: User performing the action
 *     responses:
 *       200:
 *         description: Customer soft-deleted
 *       404:
 *         description: Customer not found
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
 * /customers/{id}/history:
 *   get:
 *     summary: Get change history for a customer
 *     tags: [Customers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Change history array
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ChangeRecord'
 *       404:
 *         description: Customer not found
 */
router.get('/:id/history', async (req, res) => {
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
