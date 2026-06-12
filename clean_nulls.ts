import { getDb, writeDb, forceSyncAllToFirestore } from "./server/database.js";

async function run() {
  const db = getDb();
  let changed = false;
  
  if (db.audits.some(a => a.id == null)) {
    db.audits = db.audits.filter(a => a.id != null);
    changed = true;
  }
  
  if (changed) {
    writeDb(db);
    console.log("Filtered null audits");
    await forceSyncAllToFirestore();
    console.log("Done");
  } else {
    console.log("No null audits found");
  }
}
run();
