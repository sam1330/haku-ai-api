exports.up = function (knex) {
  return knex.schema.createTable('job_applications', function (table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table
      .uuid('resume_id')
      .references('id')
      .inTable('resumes')
      .onDelete('SET NULL');
    table.string('company_name').notNullable();
    table.string('position_title').notNullable();
    table.text('job_description').notNullable();
    table.string('application_url').nullable();
    table.timestamp('application_deadline').nullable();
    table
      .enum('status', ['draft', 'applied', 'interview', 'rejected', 'accepted'])
      .defaultTo('draft');
    table.text('notes').nullable();
    table.json('cover_letter_data').nullable(); // Store generated cover letter data
    table.timestamps(true, true);

    // Indexes
    table.index('user_id');
    table.index('resume_id');
    table.index('status');
    table.index('company_name');
    table.index('created_at');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('job_applications');
};
