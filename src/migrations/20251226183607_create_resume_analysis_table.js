/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('resume_analysis', function (table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('target_role').notNullable();
    table.string('target_company').notNullable();
    table.text('job_description').nullable();
    table.jsonb('analysis_results').notNullable();

    table
      .uuid('resume_id')
      .references('id')
      .inTable('resumes')
      .onDelete('CASCADE')
      .notNullable();
    table
      .uuid('user_id')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
      .notNullable();
    table.timestamps(true, true);

    // Indexes
    table.index('resume_id');
    table.index('user_id');
    table.index('created_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable('resume_analysis');
};
