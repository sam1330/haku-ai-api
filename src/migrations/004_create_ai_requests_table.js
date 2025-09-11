exports.up = function(knex) {
  return knex.schema.createTable('ai_requests', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.enum('request_type', ['resume_analysis', 'cover_letter_generation', 'resume_optimization']).notNullable();
    table.json('input_data').notNullable(); // Store input parameters
    table.json('response_data').nullable(); // Store AI response
    table.string('status').defaultTo('pending'); // pending, completed, failed
    table.text('error_message').nullable();
    table.integer('tokens_used').nullable();
    table.decimal('cost', 10, 4).nullable(); // Cost in USD
    table.timestamps(true, true);
    
    // Indexes
    table.index('user_id');
    table.index('request_type');
    table.index('status');
    table.index('created_at');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('ai_requests');
};
