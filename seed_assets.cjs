const fs = require('fs');

const dbPath = './data/database.json';
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

if (!db.assets) db.assets = [];

db.assets.push({
  id: 101,
  asset_tag: "VIIT-IT-0101",
  name: "Dell OptiPlex 7090 Tower",
  category: "IT Hardware",
  status: "available",
  purchase_date: "2026-01-15",
  cost: 75000,
  serial_number: "DL-OPT-7090-X1",
  location: "Lab 3",
  qr_code: "VIIT-IT-0101",
  created_at: new Date().toISOString()
});

db.assets.push({
  id: 102,
  asset_tag: "VIIT-IT-0102",
  name: "Logitech MX Master 3",
  category: "IT Hardware",
  status: "available",
  purchase_date: "2026-02-15",
  cost: 8500,
  serial_number: "LG-MX3-W2",
  location: "Lab 3",
  qr_code: "VIIT-IT-0102",
  created_at: new Date().toISOString()
});

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log("Seeded basic trial assets.");
