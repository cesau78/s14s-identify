const express = require('express');
const Customer = require('../models/customer');
const MatchFeedback = require('../models/matchFeedback');
const { computeMetrics, suggestWeightAdjustments } = require('../services/matchQualityService');

const router = express.Router();

/**
 * @swagger
 * /match-quality:
 *   get:
 *     summary: Get match quality metrics (F1 score)
 *     description: >
 *       Computes precision, recall, and F1 score based on match feedback.
 *       Precision measures how many auto-matches were correct.
 *       Recall measures how many true matches the system found automatically.
 *       F1 is the harmonic mean of precision and recall.
 *     tags: [Match Quality]
 *     responses:
 *       200:
 *         description: Current match quality metrics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MatchQualityMetrics'
 */
router.get('/', async (req, res) => {
  try {
    // Count total auto-matches: aliases with non-null match_confidence
    const result = await Customer.aggregate([
      { $unwind: '$aliases' },
      { $match: { 'aliases.match_confidence': { $ne: null } } },
      { $count: 'total' }
    ]);

    const totalAutoMatches = result.length > 0 ? result[0].total : 0;
    const metrics = await computeMetrics(totalAutoMatches);

    return res.status(200).json(metrics);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /match-quality/tune:
 *   get:
 *     summary: Get suggested weight adjustments
 *     description: >
 *       Analyzes match feedback to suggest adjustments to the Fellegi-Sunter
 *       field weights and match threshold. Returns current weights, suggested
 *       weights, and the rationale for the adjustment.
 *
 *
 *       Does not apply changes automatically — review the suggestions and
 *       update the configuration manually if appropriate.
 *     tags: [Match Quality]
 *     responses:
 *       200:
 *         description: Suggested weight adjustments based on feedback analysis
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TuningSuggestion'
 */
router.get('/tune', async (req, res) => {
  try {
    const suggestion = await suggestWeightAdjustments();
    return res.status(200).json(suggestion);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /match-quality/feedback:
 *   get:
 *     summary: List all match feedback records
 *     description: >
 *       Returns all match feedback records, optionally filtered by type and/or
 *       resolved status.
 *     tags: [Match Quality]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [false_positive, false_negative]
 *         description: Filter by feedback type
 *       - in: query
 *         name: resolved
 *         schema:
 *           type: boolean
 *         description: Filter by resolved status (true or false)
 *     responses:
 *       200:
 *         description: Array of match feedback records
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MatchFeedback'
 */
router.get('/feedback', async (req, res) => {
  try {
    const filter = {};
    if (req.query.type) {
      filter.type = req.query.type;
    }
    if (req.query.resolved !== undefined) {
      filter.resolved = req.query.resolved === 'true';
    }
    const feedback = await MatchFeedback.find(filter).sort({ reported_at: -1 });
    return res.status(200).json(feedback);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
