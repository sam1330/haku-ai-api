exports.up = function(knex) {
  return knex.schema.createTable('resumes', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('original_filename').notNullable();
    table.string('file_path').notNullable();
    table.string('file_type').notNullable(); // 'pdf' or 'docx'
    table.integer('file_size').notNullable(); // in bytes
    table.text('extracted_text').nullable();
    table.json('analysis_results').nullable(); // Store AI analysis results
    table.json('metadata').nullable(); // Store additional file metadata
    table.boolean('is_processed').defaultTo(false);
    table.timestamps(true, true);
    
    // Indexes
    table.index('user_id');
    table.index('is_processed');
    table.index('created_at');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('resumes');
};
