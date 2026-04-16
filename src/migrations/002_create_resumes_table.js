const enums = require("../enums");

exports.up = function (knex) {
  return knex.schema.createTable("resumes", function (table) {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("user_id").references("id").inTable("users").onDelete("CASCADE");
    table.string("original_filename").notNullable();
    table
      .enum("source", [
        enums.RESUME_SOURCE_TYPES.UPLOAD,
        enums.RESUME_SOURCE_TYPES.BUILDER,
      ])
      .defaultTo(enums.RESUME_SOURCE_TYPES.UPLOAD);
    table.string("file_path").nullable();
    table.string("file_type").nullable(); // 'pdf' or 'docx'
    table.integer("file_size").nullable(); // in bytes
    table.text("extracted_text").nullable();
    table.json("metadata").nullable(); // Store additional file metadata
    table.boolean("is_processed").defaultTo(false);
    table.timestamps(true, true);

    // Indexes
    table.index("user_id");
    table.index("is_processed");
    table.index("created_at");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("resumes");
};
