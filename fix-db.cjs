const fs = require('fs');
const db = JSON.parse(fs.readFileSync('./data/database.json', 'utf8'));

for (const key of Object.keys(db)) {
  if (Array.isArray(db[key])) {
    db[key] = db[key].filter(v => v.id != null && Object.keys(v).length > 0);
  }
}

fs.writeFileSync('./data/database.json', JSON.stringify(db, null, 2));
