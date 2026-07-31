exports.up = async function (knex) {
  await knex.schema.raw(
    'ALTER TABLE ai_requests DROP CONSTRAINT ai_requests_request_type_check',
  );
  await knex.schema.raw(`
    ALTER TABLE ai_requests ADD CONSTRAINT ai_requests_request_type_check
    CHECK (request_type IN ('resume_analysis', 'cover_letter_generation', 'resume_optimization', 'resume_conversion'))
  `);
};

exports.down = async function (knex) {
  await knex.schema.raw(
    'ALTER TABLE ai_requests DROP CONSTRAINT ai_requests_request_type_check',
  );
  await knex.schema.raw(`
    ALTER TABLE ai_requests ADD CONSTRAINT ai_requests_request_type_check
    CHECK (request_type IN ('resume_analysis', 'cover_letter_generation', 'resume_optimization'))
  `);
};
