const db = require('./src/config/database');

db('resumes')
  .orderBy('updated_at', 'desc')
  .limit(3)
  .select('id', 'original_filename', 'source', 'updated_at', 'extracted_text')
  .then((rows) => {
    rows.forEach((r) => {
      console.log('---');
      console.log(r.id, r.original_filename, r.source, r.updated_at);
      console.log(r.extracted_text);
    });
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
