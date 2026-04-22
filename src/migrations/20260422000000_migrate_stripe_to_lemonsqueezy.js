exports.up = async function (knex) {
  // Alter users table
  await knex.schema.alterTable('users', function (table) {
    table.renameColumn('stripe_customer_id', 'lemonsqueezy_customer_id');
  });

  // Alter payments table
  await knex.schema.alterTable('payments', function (table) {
    table.renameColumn(
      'stripe_checkout_session_id',
      'lemonsqueezy_checkout_id',
    );
  });
};

exports.down = async function (knex) {
  // Alter payments table
  await knex.schema.alterTable('payments', function (table) {
    table.renameColumn(
      'lemonsqueezy_checkout_id',
      'stripe_checkout_session_id',
    );
  });

  // Alter users table
  await knex.schema.alterTable('users', function (table) {
    table.renameColumn('lemonsqueezy_customer_id', 'stripe_customer_id');
  });
};
