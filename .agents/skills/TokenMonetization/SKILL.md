# Token/Credits-Based Monetization Skill

This skill documents the management and implementation of the credit-based monetization system in the Haku API.

## Overview

The Haku API uses a credit-based system where users consume credits for AI-powered actions. This replaces the traditional monthly subscription model with a "pay-as-you-go" or "pre-paid bucket" approach.

### Key Components

1.  **Users Table**: Stores the current `credits` balance for each user.
2.  **Credit Transactions Table**: A ledger of all credit inflows (top-ups, bonuses) and outflows (AI usage, refunds).
3.  **Credit Service**: The core logic for checking, deducting, and adding credits.
4.  **Credit Middleware**: Guards routes to ensure users have enough credits before processing expensive operations.

## Implementation Details

### 1. Database Schema

#### Users Table Extension
```js
table.integer('credits').defaultTo(50); // Initial welcome credits
```

#### Credit Transactions Table
```js
table.uuid('id').primary();
table.uuid('user_id').references('id').inTable('users');
table.integer('amount'); // Positive for credit, negative for debit
table.enum('type', ['top-up', 'usage', 'refund', 'bonus']);
table.string('description');
table.json('metadata');
table.timestamps(true, true);
```

### 2. Credit Service (`src/services/creditService.js`)

Always use the `creditService` to interact with user balances to ensure transactions are logged and atomic.

```javascript
const deductCredits = async (userId, amount, description, metadata = {}) => {
  return await db.transaction(async (trx) => {
    const user = await trx('users').where('id', userId).first().forUpdate();
    if (user.credits < amount) {
      throw new Error('Insufficient credits');
    }
    await trx('users').where('id', userId).decrement('credits', amount);
    await trx('credit_transactions').insert({
      user_id: userId,
      amount: -amount,
      type: 'usage',
      description,
      metadata: JSON.stringify(metadata)
    });
  });
};

const refundCredits = async (userId, originalTransactionId, reason) => {
  return await db.transaction(async (trx) => {
    const original = await trx('credit_transactions').where('id', originalTransactionId).first();
    if (!original) throw new Error('Original transaction not found');
    
    await trx('users').where('id', userId).increment('credits', Math.abs(original.amount));
    await trx('credit_transactions').insert({
      user_id: userId,
      amount: Math.abs(original.amount),
      type: 'refund',
      description: `Refund: ${reason}`,
      metadata: JSON.stringify({ original_id: originalTransactionId })
    });
  });
};
```

### 3. Credit Costs

Define standard costs in a central configuration or constant:

| Action | Cost (Credits) |
| :--- | :--- |
| Resume Analysis | 10 |
| Cover Letter Generation | 5 |
| Resume Optimization | 15 |
| LinkedIn Headline Optimization | 2 |

### 4. Expiration Policy

- **Type A: Purchased Credits**: No expiration date (`expires_at` is NULL). These are consumed only after Type B credits are exhausted.
- **Type B: Subscription Credits**: Monthly allowances that have an `expires_at` date. These are consumed first.

## How to Add New Paywalled Features

1.  **Define Cost**: Add the new action and its cost to `src/config/constants.js`.
2.  **Add Middleware**: Use the `checkCredits` middleware in your route definition.
    ```javascript
    router.post('/new-feature', checkCredits('NEW_FEATURE_COST'), async (req, res) => { ... });
    ```
3.  **Deduct Credits**: In your service or controller, call `creditService.deductCredits` at the **start** of the operation.
4.  **Handle Failures (Refund)**: Wrap the AI operation in a `try...catch`. In the `catch` block, call `creditService.refundCredits` if the error was not a user-side validation error.

```javascript
const tx = await creditService.deductCredits(userId, cost, 'Resume Analysis');
try {
  const result = await aiService.analyze(data);
  return result;
} catch (error) {
  await creditService.refundCredits(userId, tx.id, error.message);
  throw error;
}
```

## Best Practices

- **Deduct First, Refund Later**: This prevents users from triggering expensive AI calls without sufficient balance.
- **Atomic Transactions**: Always perform the balance check and deduction within a database transaction.
- **Transparency**: Always return the remaining credits in the API response.
