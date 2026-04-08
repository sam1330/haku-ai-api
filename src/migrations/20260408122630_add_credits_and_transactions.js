exports.up = function(knex) {
  return knex.schema
    .alterTable('users', function(table) {
      table.integer('credits').notNullable().defaultTo(50);
      table.index('credits');
    })
    .createTable('credit_transactions', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id')
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
        .notNullable();
      table.integer('amount').notNullable(); // Positive for credit, negative for debit
      table.enum('transaction_type', ['top-up', 'usage', 'refund', 'bonus']).notNullable();
      table.string('description').nullable();
      table.json('metadata').nullable();
      table.timestamp('expires_at').nullable();
      table.timestamps(true, true);

      // Indexes
      table.index('user_id');
      table.index('transaction_type');
      table.index('created_at');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTable('credit_transactions')
    .alterTable('users', function(table) {
      table.dropColumn('credits');
    });
};
