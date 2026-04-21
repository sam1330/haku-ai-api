exports.up = function(knex) {
  return knex.schema
    .alterTable('users', function(table) {
      table.string('stripe_customer_id').nullable().index();
    })
    .createTable('payments', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
      table.string('stripe_checkout_session_id').unique().notNullable().index();
      table.integer('amount').notNullable(); // In cents
      table.string('currency').defaultTo('usd');
      table.string('status').notNullable().defaultTo('pending'); // pending, succeeded, failed
      table.string('plan_name').notNullable();
      table.integer('credits_added').notNullable();
      table.json('metadata').nullable();
      table.timestamps(true, true);
      
      table.index('user_id');
      table.index('status');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTable('payments')
    .alterTable('users', function(table) {
      table.dropColumn('stripe_customer_id');
    });
};
