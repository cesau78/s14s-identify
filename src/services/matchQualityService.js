const MatchFeedback = require('../models/matchFeedback');
const { FIELD_CONFIG, MATCH_THRESHOLD } = require('./customerMatchingService');

/**
 * Computes precision, recall, and F1 score from match feedback records.
 *
 * Terminology in context:
 *   - True Positive (TP):  system matched, no false_positive feedback filed
 *   - False Positive (FP): system matched, but feedback says it was wrong
 *   - False Negative (FN): system did not match, but a manual merge was required
 *
 * We derive counts from the MatchFeedback collection:
 *   FP = count of false_positive feedback records
 *   FN = count of false_negative feedback records
 *
 * For TP we need total auto-matches minus false positives. Since we don't
 * have a dedicated counter for total auto-matches, we accept it as a
 * parameter (derived from aliases with non-null match_confidence).
 */
async function computeMetrics(totalAutoMatches) {
  const [falsePositives, falseNegatives] = await Promise.all([
    MatchFeedback.countDocuments({ type: 'false_positive' }),
    MatchFeedback.countDocuments({ type: 'false_negative' })
  ]);

  const truePositives = Math.max(0, totalAutoMatches - falsePositives);

  const precision = (truePositives + falsePositives) > 0
    ? truePositives / (truePositives + falsePositives)
    : 1;

  const recall = (truePositives + falseNegatives) > 0
    ? truePositives / (truePositives + falseNegatives)
    : 1;

  const f1 = (precision + recall) > 0
    ? 2 * (precision * recall) / (precision + recall)
    : 0;

  return {
    true_positives: truePositives,
    false_positives: falsePositives,
    false_negatives: falseNegatives,
    total_auto_matches: totalAutoMatches,
    precision: Math.round(precision * 10000) / 10000,
    recall: Math.round(recall * 10000) / 10000,
    f1: Math.round(f1 * 10000) / 10000
  };
}

/**
 * Suggests adjusted field weights based on feedback patterns.
 *
 * Strategy:
 *   - For false positives (over-matching): lower m values for fields that
 *     agreed in the incorrect match, making the system more conservative.
 *   - For false negatives (under-matching): raise m values or lower the
 *     match threshold to make the system more permissive.
 *
 * The adjustments are small (1-2%) to avoid oscillation.
 */
async function suggestWeightAdjustments() {
  const [fpCount, fnCount] = await Promise.all([
    MatchFeedback.countDocuments({ type: 'false_positive' }),
    MatchFeedback.countDocuments({ type: 'false_negative' })
  ]);

  const totalFeedback = fpCount + fnCount;
  if (totalFeedback === 0) {
    return {
      action: 'none',
      reason: 'No feedback data available for tuning',
      current_weights: formatWeights(FIELD_CONFIG),
      current_threshold: MATCH_THRESHOLD,
      suggested_weights: formatWeights(FIELD_CONFIG),
      suggested_threshold: MATCH_THRESHOLD
    };
  }

  const fpRate = fpCount / totalFeedback;
  const fnRate = fnCount / totalFeedback;

  const suggested = {};
  let suggestedThreshold = MATCH_THRESHOLD;

  for (const [field, config] of Object.entries(FIELD_CONFIG)) {
    suggested[field] = { m: config.m, u: config.u };

    if (fpRate > 0.5) {
      // Too many false positives: reduce m (true match agreement probability)
      // and increase u (random agreement probability) slightly
      suggested[field].m = Math.max(0.5, config.m - 0.02);
      suggested[field].u = Math.min(0.1, config.u + 0.001);
    } else if (fnRate > 0.5) {
      // Too many false negatives: increase m and decrease u slightly
      suggested[field].m = Math.min(0.99, config.m + 0.02);
      suggested[field].u = Math.max(0.00001, config.u - 0.0005);
    }
  }

  if (fpRate > 0.5) {
    suggestedThreshold = Math.min(0.99, MATCH_THRESHOLD + 0.01);
  } else if (fnRate > 0.5) {
    suggestedThreshold = Math.max(0.80, MATCH_THRESHOLD - 0.01);
  }

  const action = fpRate > 0.5 ? 'tighten' : fnRate > 0.5 ? 'loosen' : 'none';

  return {
    action,
    reason: action === 'tighten'
      ? `${fpCount} false positives vs ${fnCount} false negatives — suggesting tighter matching`
      : action === 'loosen'
        ? `${fnCount} false negatives vs ${fpCount} false positives — suggesting looser matching`
        : 'Feedback is balanced — no adjustment needed',
    feedback_summary: {
      false_positives: fpCount,
      false_negatives: fnCount,
      fp_rate: Math.round(fpRate * 10000) / 10000,
      fn_rate: Math.round(fnRate * 10000) / 10000
    },
    current_weights: formatWeights(FIELD_CONFIG),
    current_threshold: MATCH_THRESHOLD,
    suggested_weights: suggested,
    suggested_threshold: suggestedThreshold
  };
}

function formatWeights(fieldConfig) {
  const weights = {};
  for (const [field, config] of Object.entries(fieldConfig)) {
    weights[field] = { m: config.m, u: config.u };
  }
  return weights;
}

module.exports = {
  computeMetrics,
  suggestWeightAdjustments,
  formatWeights
};
