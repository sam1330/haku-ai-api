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

    table.string('resume_id').references('id').inTable('resumes').onDelete('CASCADE');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable('resume_analysis');
};
