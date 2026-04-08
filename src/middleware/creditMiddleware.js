const creditService = require('../services/creditService');
const { CREDIT_COSTS } = require('../config/constants');

/**
 * Middleware to check if user has enough credits before proceeding
 * @param {number|string} amountOrAction The credit amount or the action key from CREDIT_COSTS
 */
const checkCredits = (amountOrAction) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id; // Assumes user is authenticated and attached to req.user
      
      let requiredAmount = 0;
      if (typeof amountOrAction === 'number') {
        requiredAmount = amountOrAction;
      } else if (typeof amountOrAction === 'string' && CREDIT_COSTS[amountOrAction]) {
        requiredAmount = CREDIT_COSTS[amountOrAction];
      } else {
        console.error(`Invalid credit check parameter: ${amountOrAction}`);
        return res.status(500).json({ error: 'Internal server error during credit check' });
      }

      const hasCredits = await creditService.hasSufficientCredits(userId, requiredAmount);
      
      if (!hasCredits) {
        return res.status(402).json({
          error: 'Insufficient credits',
          required: requiredAmount,
          message: 'You keep running out of fuel! Top up your credits to continue.'
        });
      }

      // Attach the cost to the request for easier deduction later
      req.creditCost = requiredAmount;
      req.creditAction = typeof amountOrAction === 'string' ? amountOrAction : 'unspecified_action';
      
      next();
    } catch (error) {
      console.error('Credit check middleware error:', error);
      res.status(500).json({ error: 'Failed to verify credit balance' });
    }
  };
};

module.exports = { checkCredits };
