exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email').unique().notNullable();
    table.string('password_hash').notNullable();
    table.string('first_name').notNullable();
    table.string('last_name').notNullable();
    table.enum('subscription_type', ['candidate', 'recruiter']).defaultTo('candidate');
    table.enum('subscription_tier', ['free', 'pro']).defaultTo('free');
    table.timestamp('subscription_expires_at').nullable();
    table.boolean('is_active').defaultTo(true);
    table.integer('credits').notNullable().defaultTo(30);
    table.string('password_reset_token').nullable();
    table.timestamp('password_reset_expires_at').nullable();
    table.string('email_verification_token').nullable();
    table.timestamp('email_verification_token_expires_at').nullable();
    table.timestamp('email_verified_at').nullable();
    table.timestamp('last_login_at').nullable();
    table.timestamps(true, true);
    
    // Indexes
    table.index('email');
    table.index('subscription_type');
    table.index('is_active');
    table.index('credits');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('users');
};
