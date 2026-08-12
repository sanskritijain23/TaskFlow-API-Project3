'use strict';

/**
 * Keeps `status` and `completed` consistent with each other:
 *   - status === 'completed'  implies  completed === true
 *   - completed === true      implies  status === 'completed'
 *
 * Behavior (documented in README.md / DATABASE_DESIGN.md):
 *   - If the caller explicitly supplies BOTH fields in the same request and
 *     they contradict each other, the request is rejected with a 400.
 *   - If only one of the two is explicitly supplied, the other is derived
 *     automatically so the stored row is always internally consistent:
 *       - completed: true  and status not supplied  -> status becomes 'completed'
 *       - status: 'completed' and completed not supplied -> completed becomes true
 *       - completed: false and status not supplied, but the resulting row's
 *         status is 'completed' (e.g. unchanged from an existing record)
 *         -> status is reset to 'pending'
 *       - status: <non-completed> and completed not supplied, but the
 *         resulting row's completed is true -> completed is reset to false
 *
 * @param {object} incoming - the raw fields the caller sent in this request
 *   (only the keys actually present in the request body/patch, pre-merge)
 * @param {object} merged - the full row data that will be written (already
 *   merged with existing values for PATCH, or defaults for POST/PUT). This
 *   object is mutated in place and also returned.
 * @returns {object} merged, with status/completed reconciled
 * @throws {Error} with statusCode 400 and details[] if the caller's explicit
 *   values genuinely contradict each other
 */
function reconcileStatusAndCompleted(incoming, merged) {
  const statusProvided = Object.prototype.hasOwnProperty.call(incoming, 'status');
  const completedProvided = Object.prototype.hasOwnProperty.call(incoming, 'completed');

  if (statusProvided && completedProvided) {
    const statusImpliesCompleted = incoming.status === 'completed';
    if (statusImpliesCompleted !== Boolean(incoming.completed)) {
      const error = new Error(
        'status and completed are contradictory: status "completed" requires completed to be true, ' +
          'and any other status requires completed to be false.'
      );
      error.statusCode = 400;
      error.details = [
        {
          field: 'status,completed',
          message:
            'status and completed must agree: status "completed" implies completed=true, ' +
            'and completed=true implies status "completed".',
        },
      ];
      throw error;
    }
    return merged;
  }

  if (statusProvided && !completedProvided) {
    merged.completed = incoming.status === 'completed';
    return merged;
  }

  if (completedProvided && !statusProvided) {
    if (incoming.completed === true) {
      merged.status = 'completed';
    } else if (merged.status === 'completed') {
      merged.status = 'pending';
    }
    return merged;
  }

  // Neither field touched by this request; nothing to reconcile.
  return merged;
}

module.exports = { reconcileStatusAndCompleted };
