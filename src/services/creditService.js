const db = require("../config/database");
const { TRANSACTION_TYPES } = require("../config/constants");

class CreditService {
  /**
   * Get target user's current credit balance
   * @param {string} userId
   * @returns {Promise<number>}
   */
  async getUserCredits(userId) {
    const user = await db("users")
      .where("id", userId)
      .select("credits")
      .first();

    return user ? user.credits : 0;
  }

  /**
   * Check if user has sufficient credits for an action
   * @param {string} userId
   * @param {number} requiredAmount
   * @returns {Promise<boolean>}
   */
  async hasSufficientCredits(userId, requiredAmount) {
    const currentBalance = await this.getUserCredits(userId);
    return currentBalance >= requiredAmount;
  }

  /**
   * Deduct credits from user's account
   * @param {string} userId
   * @param {number} amount
   * @param {string} description
   * @param {object} metadata
   * @returns {Promise<object>} The transaction record
   */
  async deductCredits(userId, amount, description, metadata = {}) {
    return await db.transaction(async (trx) => {
      // Get user with lock for update to prevent race conditions
      const user = await trx("users")
        .where("id", userId)
        .select("credits")
        .first()
        .forUpdate();

      if (!user) {
        throw new Error("User not found");
      }

      if (user.credits < amount) {
        throw new Error("Insufficient credits");
      }

      // Decrement credits
      await trx("users").where("id", userId).decrement("credits", amount);

      // Create transaction record
      const [transaction] = await trx("credit_transactions")
        .insert({
          amount: -amount,
          description: description,
          metadata: metadata,
          transaction_type: TRANSACTION_TYPES.USAGE,
          user_id: userId,
        })
        .returning("*");

      return transaction;
    });
  }

  /**
   * Refund credits to user's account
   * @param {string} userId
   * @param {string} originalTransactionId
   * @param {string} reason
   * @returns {Promise<object>} The transaction record
   */
  async refundCredits(userId, originalTransactionId, reason) {
    return await db.transaction(async (trx) => {
      // Find original transaction
      const originalTx = await trx("credit_transactions")
        .where({ id: originalTransactionId, user_id: userId })
        .first();

      if (!originalTx) {
        throw new Error("Original transaction not found");
      }

      if (originalTx.transaction_type !== TRANSACTION_TYPES.USAGE) {
        throw new Error("Can only refund usage transactions");
      }

      // Check if already refunded (simple check in metadata for now)
      const parsedMeta =
        typeof originalTx.metadata === "string"
          ? JSON.parse(originalTx.metadata)
          : originalTx.metadata || {};

      if (parsedMeta.refunded) {
        throw new Error("Transaction already refunded");
      }

      const refundAmount = Math.abs(originalTx.amount);

      // Increment credits
      await trx("users").where("id", userId).increment("credits", refundAmount);

      // Mark original as refunded
      const updatedMetadata =
        typeof originalTx.metadata === "string"
          ? JSON.parse(originalTx.metadata)
          : originalTx.metadata || {};
      updatedMetadata.refunded = true;
      updatedMetadata.refund_reason = reason;

      await trx("credit_transactions")
        .where("id", originalTransactionId)
        .update({ metadata: JSON.stringify(updatedMetadata) });

      // Create refund transaction record
      const [refundTx] = await trx("credit_transactions")
        .insert({
          user_id: userId,
          amount: refundAmount,
          transaction_type: TRANSACTION_TYPES.REFUND,
          description: `Refund: ${reason.substring(0, 100)}`,
          metadata: JSON.stringify({
            original_transaction_id: originalTransactionId,
          }),
        })
        .returning("*");

      return refundTx;
    });
  }

  /**
   * Add credits to user's account (top-up, bonus, etc.)
   * @param {string} userId
   * @param {number} amount
   * @param {string} type
   * @param {string} description
   * @param {object} options { expiresAt, metadata }
   * @returns {Promise<object>} The transaction record
   */
  async addCredits(userId, amount, type, description, options = {}) {
    return await db.transaction(async (trx) => {
      await trx("users").where("id", userId).increment("credits", amount);

      const [transaction] = await trx("credit_transactions")
        .insert({
          user_id: userId,
          amount: amount,
          transaction_type: type,
          description,
          metadata: options.metadata ? JSON.stringify(options.metadata) : null,
          expires_at: options.expiresAt || null,
        })
        .returning("*");

      return transaction;
    });
  }

  /**
   * Get transaction history for a user
   * @param {string} userId
   * @param {number} limit
   * @param {number} offset
   * @returns {Promise<Array>}
   */
  async getTransactionHistory(userId, limit = 20, offset = 0) {
    return await db("credit_transactions")
      .where("user_id", userId)
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset);
  }
}

module.exports = new CreditService();
