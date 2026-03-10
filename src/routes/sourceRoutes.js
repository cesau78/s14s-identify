const express = require('express');
const Source = require('../models/source');

const router = express.Router();

function sourceResponse(source) {
  return {
    _id: source._id,
    name: source.name,
    entra_ad_group: source.entra_ad_group,
    reviewers: source.reviewers,
    created_by: source.created_by,
    created_at: source.created_at,
    updated_by: source.updated_by,
    updated_at: source.updated_at,
    deleted_by: source.deleted_by,
    deleted_at: source.deleted_at
  };
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Reviewer:
 *       type: object
 *       required:
 *         - first_name
 *         - last_name
 *         - email
 *       properties:
 *         first_name:
 *           type: string
 *           example: 'Jane'
 *         last_name:
 *           type: string
 *           example: 'Smith'
 *         email:
 *           type: string
 *           format: email
 *           example: 'jane.smith@company.com'
 *     SourceInput:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           description: Unique identifier for the source system
 *           example: 'CRM'
 *         entra_ad_group:
 *           type: string
 *           description: Microsoft Entra AD group name for access control
 *           example: 'SG-CRM-Reviewers'
 *         reviewers:
 *           type: array
 *           description: Users authorized to review match candidates from this source
 *           items:
 *             $ref: '#/components/schemas/Reviewer'
 *     Source:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         name:
 *           type: string
 *         entra_ad_group:
 *           type: string
 *         reviewers:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Reviewer'
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
 * /sources:
 *   post:
 *     summary: Register a new source system
 *     description: >
 *       Registers a source system that can submit customer records. The name must
 *       be unique. Optionally specify an Entra AD group and reviewers who are
 *       authorized to review match candidates from this source.
 *     tags: [Sources]
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
 *             $ref: '#/components/schemas/SourceInput'
 *     responses:
 *       201:
 *         description: Source system registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Source'
 *       400:
 *         description: Validation failed (name missing or already exists)
 *       409:
 *         description: A source with this name already exists
 */
router.post('/', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ errors: ['name is required'] });
    }

    const reviewers = Array.isArray(req.body.reviewers) ? req.body.reviewers : [];
    const reviewerErrors = [];
    for (let i = 0; i < reviewers.length; i++) {
      const r = reviewers[i];
      if (!r.first_name || !String(r.first_name).trim()) reviewerErrors.push(`reviewers[${i}].first_name is required`);
      if (!r.last_name || !String(r.last_name).trim()) reviewerErrors.push(`reviewers[${i}].last_name is required`);
      if (!r.email || !String(r.email).trim()) reviewerErrors.push(`reviewers[${i}].email is required`);
    }
    if (reviewerErrors.length > 0) {
      return res.status(400).json({ errors: reviewerErrors });
    }

    const source = new Source({
      name,
      entra_ad_group: (req.body.entra_ad_group || '').trim(),
      reviewers: reviewers.map(r => ({
        first_name: String(r.first_name).trim(),
        last_name: String(r.last_name).trim(),
        email: String(r.email).trim().toLowerCase()
      })),
      created_by: req.audit_user,
      created_at: new Date()
    });

    await source.save();
    return res.status(201).json(sourceResponse(source));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A source with this name already exists' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ errors: [error.message] });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /sources:
 *   get:
 *     summary: List all registered source systems
 *     description: Returns all active source systems. Use include_deleted=true to include soft-deleted sources.
 *     tags: [Sources]
 *     parameters:
 *       - in: query
 *         name: include_deleted
 *         schema:
 *           type: boolean
 *         description: Set to "true" to include soft-deleted sources
 *     responses:
 *       200:
 *         description: Array of source systems
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Source'
 */
router.get('/', async (req, res) => {
  try {
    const filter = req.query.include_deleted === 'true' ? {} : { deleted_at: null };
    const sources = await Source.find(filter).sort({ name: 1 });
    return res.status(200).json(sources.map(sourceResponse));
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /sources/{id}:
 *   get:
 *     summary: Get a source system by ID
 *     tags: [Sources]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Source found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Source'
 *       404:
 *         description: Source not found
 */
router.get('/:id', async (req, res) => {
  try {
    const source = await Source.findOne({ _id: req.params.id, deleted_at: null });
    if (!source) {
      return res.status(404).json({ error: 'Source not found' });
    }
    return res.status(200).json(sourceResponse(source));
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Source not found' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /sources/{id}:
 *   put:
 *     summary: Update a source system
 *     description: >
 *       Updates source system fields. Name changes are checked for uniqueness.
 *       Reviewers array replaces the existing list entirely.
 *     tags: [Sources]
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SourceInput'
 *     responses:
 *       200:
 *         description: Source updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Source'
 *       404:
 *         description: Source not found
 *       409:
 *         description: Name already taken by another source
 */
router.put('/:id', async (req, res) => {
  try {
    const source = await Source.findOne({ _id: req.params.id, deleted_at: null });
    if (!source) {
      return res.status(404).json({ error: 'Source not found' });
    }

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) {
        return res.status(400).json({ errors: ['name cannot be empty'] });
      }
      source.name = name;
    }

    if (req.body.entra_ad_group !== undefined) {
      source.entra_ad_group = String(req.body.entra_ad_group).trim();
    }

    if (req.body.reviewers !== undefined) {
      const reviewers = Array.isArray(req.body.reviewers) ? req.body.reviewers : [];
      const reviewerErrors = [];
      for (let i = 0; i < reviewers.length; i++) {
        const r = reviewers[i];
        if (!r.first_name || !String(r.first_name).trim()) reviewerErrors.push(`reviewers[${i}].first_name is required`);
        if (!r.last_name || !String(r.last_name).trim()) reviewerErrors.push(`reviewers[${i}].last_name is required`);
        if (!r.email || !String(r.email).trim()) reviewerErrors.push(`reviewers[${i}].email is required`);
      }
      if (reviewerErrors.length > 0) {
        return res.status(400).json({ errors: reviewerErrors });
      }
      source.reviewers = reviewers.map(r => ({
        first_name: String(r.first_name).trim(),
        last_name: String(r.last_name).trim(),
        email: String(r.email).trim().toLowerCase()
      }));
    }

    source.updated_by = req.audit_user;
    source.updated_at = new Date();

    await source.save();
    return res.status(200).json(sourceResponse(source));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A source with this name already exists' });
    }
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Source not found' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /sources/{id}:
 *   delete:
 *     summary: Soft delete a source system
 *     description: >
 *       Marks a source system as deleted. Existing customer aliases from this
 *       source are not affected. New submissions from this source will be rejected.
 *     tags: [Sources]
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
 *     responses:
 *       200:
 *         description: Source soft-deleted
 *       404:
 *         description: Source not found
 */
router.delete('/:id', async (req, res) => {
  try {
    const source = await Source.findOne({ _id: req.params.id, deleted_at: null });
    if (!source) {
      return res.status(404).json({ error: 'Source not found' });
    }

    source.deleted_by = req.audit_user;
    source.deleted_at = new Date();

    await source.save();
    return res.status(200).json({ message: 'Source deleted', _id: source._id });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Source not found' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
