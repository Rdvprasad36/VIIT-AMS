import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

// Ensure the directory for data storage exists
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, "database.json");

// Define Core TypeScript Models
export type UserRole = "super_admin" | "asset_manager" | "employee" | "auditor" | "maintenance_team" | "web_developer";
export type AssetStatus = "available" | "allocated" | "maintenance" | "disposed" | "return_pending";
export type RequestStatus = "pending" | "approved" | "rejected";
export type RepairStatus = "reported" | "in_progress" | "resolved" | "unrepairable";

export interface User {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  department: string;
  created_at: string;
  password_plain?: string;
  employee_type?: string;
  read_notifications?: string[];
  reset_code?: string;
  is_trial?: boolean;
  is_disabled?: boolean;
}

export interface Asset {
  id: number;
  asset_tag: string;
  name: string;
  category: string;
  status: AssetStatus;
  purchase_date: string;
  cost: number;
  serial_number: string;
  location: string;
  qr_code: string;
  created_at: string;
  warranty_expiration?: string;
  is_trial?: boolean;
}

export interface Request {
  id: number;
  asset_id: number;
  user_id: number;
  manager_id?: number;
  purpose: string;
  status: RequestStatus;
  request_date: string;
  action_date?: string;
  comments?: string;
}

export interface MaintenanceLog {
  id: number;
  asset_id: number;
  reported_by: number;
  assigned_to?: number;
  issue_description: string;
  repair_status: RepairStatus;
  cost: number;
  created_at: string;
  updated_at: string;
}

export interface SystemAudit {
  id: number;
  user_id?: number | null;
  user_name?: string;
  action_type: string;
  entity_table: string;
  entity_id?: number;
  details: string;
  performed_at: string;
}

export interface Suggestion {
  id: number;
  user_name: string;
  user_email: string;
  user_role: string;
  type: string; // "issue" or "suggestion"
  message: string;
  created_at: string;
}

export interface BudgetConfig {
  grossCapitalValuationOverride?: number | null;
  cumulativeOutlaysOverride?: number | null;
}

export interface DatabaseSchema {
  users: User[];
  assets: Asset[];
  requests: Request[];
  maintenance_logs: MaintenanceLog[];
  audits: SystemAudit[];
  suggestions?: Suggestion[]; // Dynamic feedback support
  budgets?: BudgetConfig;
}

import { initializeApp } from "firebase/app";
import { initializeFirestore, terminate, collection, getDocs, doc, setDoc, deleteDoc, getDoc } from "firebase/firestore";

// Initialize Cloud Firestore Connection
let firestoreDb: any = null;
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const app = initializeApp(config);
    firestoreDb = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    }, config.firestoreDatabaseId);
    console.log("[VIIT AMS] Firestore cloud connection successfully initialized with auto-detect long-polling.");
  } else {
    console.warn("[VIIT AMS] Warning: firebase-applet-config.json not found. Running in hybrid standalone fallback...");
  }
} catch (err) {
  console.error("[VIIT AMS] Error initializing Firestore client SDK:", err);
}

// Cleanup function to cleanly terminate Firestore WebSocket/WebChannel connections on shutdown
export async function cleanupFirestore() {
  if (firestoreDb) {
    console.log("[VIIT AMS] Cleaning up Firestore connections...");
    try {
      await terminate(firestoreDb);
      console.log("[VIIT AMS] Firestore connections cleanly terminated.");
    } catch (err) {
      console.error("[VIIT AMS] Error terminating Firestore connections:", err);
    } finally {
      firestoreDb = null;
    }
  }
}

// Silent retry helper with exponential backoff for Firestore data operations
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 500): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      if (attempt >= retries) {
        throw err;
      }
      console.warn(`[VIIT AMS] Connection transient warning. Retrying... (attempt ${attempt}/${retries})`);
      await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, attempt)));
    }
  }
}

// Global state cache serving fast reads
let dbCache: DatabaseSchema | null = null;

// Synchronous local file read backup
function getLocalDbBackup(): DatabaseSchema {
  let db: DatabaseSchema;
  if (!fs.existsSync(DB_FILE)) {
    db = seedDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } else {
    try {
      const raw = fs.readFileSync(DB_FILE, "utf-8");
      db = JSON.parse(raw);
    } catch (err) {
      console.error("Failed to read JSON backup database, resetting...", err);
      db = seedDatabase();
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
    }
  }
  if (!db.suggestions) db.suggestions = [];
  if (!db.budgets) db.budgets = { grossCapitalValuationOverride: null, cumulativeOutlaysOverride: null };
  return db;
}

// Synchronous local file write backup
function writeLocalDbBackup(data: DatabaseSchema): void {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// Pre-heat database from Cloud Firestore asynchronously at boot time
export async function preloadDbFromFirestore(): Promise<DatabaseSchema> {
  console.log("[VIIT AMS] Database preheating: synchronized with Cloud Firestore...");
  const localBackup = getLocalDbBackup();

  if (!firestoreDb) {
    console.warn("[VIIT AMS] Preheating skipped (Firestore inactive). Using local backup schema.");
    dbCache = localBackup;
    return dbCache;
  }

  try {
    // 1. Fetch Users
    console.log("[VIIT AMS] Preheating: fetching users...");
    let usersSnapshot;
    try {
      usersSnapshot = await withRetry(() => getDocs(collection(firestoreDb, "users")));
    } catch (err: any) {
      console.error("[VIIT AMS] Failed fetching users collection after retries:", err.message || err);
      throw err;
    }
    let users: User[] = [];
    usersSnapshot.forEach((doc) => {
      users.push(doc.data() as User);
    });

    // 2. Seed both Firestore and Local if Firestore contains no users
    if (users.length === 0) {
      console.log("[VIIT AMS] Cloud Firestore is empty. Seeding defaults from System Cell records...");
      const seeded = seedDatabase();

      for (const u of seeded.users) {
        await withRetry(() => setDoc(doc(firestoreDb, "users", String(u.id)), u));
      }
      for (const a of seeded.assets) {
        await withRetry(() => setDoc(doc(firestoreDb, "assets", String(a.id)), a));
      }
      for (const r of seeded.requests) {
        await withRetry(() => setDoc(doc(firestoreDb, "requests", String(r.id)), r));
      }
      for (const l of seeded.maintenance_logs) {
        await withRetry(() => setDoc(doc(firestoreDb, "maintenance_logs", String(l.id)), l));
      }
      for (const aud of seeded.audits) {
        await withRetry(() => setDoc(doc(firestoreDb, "audits", String(aud.id)), aud));
      }

      const defaultBudget: BudgetConfig = { grossCapitalValuationOverride: null, cumulativeOutlaysOverride: null };
      await withRetry(() => setDoc(doc(firestoreDb, "budgets", "config"), defaultBudget));

      dbCache = {
        ...seeded,
        suggestions: [],
        budgets: defaultBudget
      };

      writeLocalDbBackup(dbCache);
      return dbCache;
    }

    // 3. Otherwise fetch allocations
    console.log("[VIIT AMS] Preheating: fetching assets...");
    let assetsSnapshot;
    try {
      assetsSnapshot = await withRetry(() => getDocs(collection(firestoreDb, "assets")));
    } catch (err: any) {
      console.error("[VIIT AMS] Failed fetching assets collection after retries:", err.message || err);
      throw err;
    }
    const assets: Asset[] = [];
    assetsSnapshot.forEach((doc) => {
      assets.push(doc.data() as Asset);
    });

    console.log("[VIIT AMS] Preheating: fetching requests...");
    let requestsSnapshot;
    try {
      requestsSnapshot = await withRetry(() => getDocs(collection(firestoreDb, "requests")));
    } catch (err: any) {
      console.error("[VIIT AMS] Failed fetching requests collection after retries:", err.message || err);
      throw err;
    }
    const requests: Request[] = [];
    requestsSnapshot.forEach((doc) => {
      requests.push(doc.data() as Request);
    });

    console.log("[VIIT AMS] Preheating: fetching maintenance_logs...");
    let logsSnapshot;
    try {
      logsSnapshot = await withRetry(() => getDocs(collection(firestoreDb, "maintenance_logs")));
    } catch (err: any) {
      console.error("[VIIT AMS] Failed fetching maintenance_logs collection after retries:", err.message || err);
      throw err;
    }
    const maintenance_logs: MaintenanceLog[] = [];
    logsSnapshot.forEach((doc) => {
      maintenance_logs.push(doc.data() as MaintenanceLog);
    });

    console.log("[VIIT AMS] Preheating: fetching audits...");
    let auditsSnapshot;
    try {
      auditsSnapshot = await withRetry(() => getDocs(collection(firestoreDb, "audits")));
    } catch (err: any) {
      console.error("[VIIT AMS] Failed fetching audits collection after retries:", err.message || err);
      throw err;
    }
    const audits: SystemAudit[] = [];
    auditsSnapshot.forEach((doc) => {
      audits.push(doc.data() as SystemAudit);
    });

    console.log("[VIIT AMS] Preheating: fetching suggestions...");
    let suggestionsSnapshot;
    try {
      suggestionsSnapshot = await withRetry(() => getDocs(collection(firestoreDb, "suggestions")));
    } catch (err: any) {
      console.error("[VIIT AMS] Failed fetching suggestions collection after retries:", err.message || err);
      throw err;
    }
    const suggestions: Suggestion[] = [];
    suggestionsSnapshot.forEach((doc) => {
      suggestions.push(doc.data() as Suggestion);
    });

    console.log("[VIIT AMS] Preheating: fetching budgets...");
    let budgets: BudgetConfig = { grossCapitalValuationOverride: null, cumulativeOutlaysOverride: null };
    try {
      const budgetDoc = await withRetry(() => getDoc(doc(firestoreDb, "budgets", "config")));
      if (budgetDoc.exists()) {
        budgets = budgetDoc.data() as BudgetConfig;
      }
    } catch (e: any) {
      console.warn("[VIIT AMS] Failed to fetch budgets override:", e.message || e);
    }

    dbCache = {
      users: users.sort((a, b) => a.id - b.id),
      assets: assets.sort((a, b) => a.id - b.id),
      requests: requests.sort((a, b) => a.id - b.id),
      maintenance_logs: maintenance_logs.sort((a, b) => a.id - b.id),
      audits: audits.sort((a, b) => b.id - a.id),
      suggestions: suggestions.sort((a, b) => a.id - b.id),
      budgets
    };

    let changed = false;

    // Detect if old pre-set seeded metadata exists, then perform clean sweeps of Firestore
    const hasOldUsers = dbCache.users.some(u => ["technoblade@gmail.com"].includes(u.email));
    if (hasOldUsers) {
      console.log("[VIIT AMS] Obsolete constant data detected. Deleting old profiles, assets, and request lines inside Firestore to start fresh...");
      
      try {
        // Delete all old asset files from firestore
        const assetsSnapshot = await getDocs(collection(firestoreDb, "assets"));
        for (const docItem of assetsSnapshot.docs) {
          await deleteDoc(doc(firestoreDb, "assets", docItem.id));
        }

        // Delete all old requisition slips
        const requestsSnapshot = await getDocs(collection(firestoreDb, "requests"));
        for (const docItem of requestsSnapshot.docs) {
          await deleteDoc(doc(firestoreDb, "requests", docItem.id));
        }

        // Delete all repair items
        const logsSnapshot = await getDocs(collection(firestoreDb, "maintenance_logs"));
        for (const docItem of logsSnapshot.docs) {
          await deleteDoc(doc(firestoreDb, "maintenance_logs", docItem.id));
        }

        // Delete all suggestions
        const suggestionsSnapshot = await getDocs(collection(firestoreDb, "suggestions"));
        for (const docItem of suggestionsSnapshot.docs) {
          await deleteDoc(doc(firestoreDb, "suggestions", docItem.id));
        }

        // Delete older users
        const usersSnapshot = await getDocs(collection(firestoreDb, "users"));
        for (const docItem of usersSnapshot.docs) {
          const uemail = String(docItem.data()?.email || "").toLowerCase();
          if (uemail !== "admin@vignaniit.edu.in" && uemail !== "rdvprasad36@gmail.com") {
            await deleteDoc(doc(firestoreDb, "users", docItem.id));
          }
        }
      } catch (err) {
        console.error("[VIIT AMS] Warning: some items failed to delete in Firestore sweep", err);
      }

      // Re-initialize clean blank database
      dbCache = seedDatabase();
      
      // Seed newly updated clean users in Firestore
      for (const u of dbCache.users) {
        await setDoc(doc(firestoreDb, "users", String(u.id)), u);
      }
      
      changed = true;
    }

    // Ensure Hidden Web Developer rdvprasad36 is registered
    const hasRdv = dbCache.users.some(u => u.email === "rdvprasad36@gmail.com");
    if (!hasRdv) {
      const salt = bcrypt.genSaltSync(10);
      const passwordRdv_hash = bcrypt.hashSync("020306", salt);
      const nextId = dbCache.users.length > 0 ? Math.max(...dbCache.users.map(u => u.id)) + 1 : 1;
      const rdvUser: User = {
        id: nextId,
        name: "Web Support Team Dev",
        email: "rdvprasad36@gmail.com",
        password_hash: passwordRdv_hash,
        role: "web_developer",
        department: "Website Support Team",
        password_plain: "020306",
        created_at: new Date().toISOString(),
      };
      dbCache.users.push(rdvUser);
      await setDoc(doc(firestoreDb, "users", String(rdvUser.id)), rdvUser);
      changed = true;
    }

    // Ensure Super Admin is named to AdminSystemCell as requested
    const adminUser = dbCache.users.find(u => u.email === "admin@vignaniit.edu.in");
    if (adminUser && adminUser.name !== "AdminSystemCell") {
      adminUser.name = "AdminSystemCell";
      await setDoc(doc(firestoreDb, "users", String(adminUser.id)), adminUser);
      changed = true;
    }

    // Ensure the 5 requested compliance test accounts exist with password 'password123'
    const testUsersToEnsure = [
      {
        id: 7,
        name: "admin",
        email: "admin@vignaniit.edu.in",
        role: "super_admin",
        department: "Administration Office",
        employee_type: "other",
        password_plain: "password123"
      },
      {
        id: 8,
        name: "test emp",
        email: "testempe@vignaniit.edu",
        role: "employee",
        department: "Administration Office",
        employee_type: "cse",
        password_plain: "password123"
      },
      {
        id: 9,
        name: "test audit",
        email: "testauditor@vignaniit.edu.in",
        role: "asset_manager",
        department: "Administration Office",
        employee_type: "other",
        password_plain: "password123"
      },
      {
        id: 10,
        name: "testam",
        email: "testam@vignaniit.edu.in",
        role: "asset_manager",
        department: "Administration Office",
        employee_type: "other",
        password_plain: "password123"
      },
      {
        id: 11,
        name: "testmaintance",
        email: "testm@vignaniit.edu.in",
        role: "maintenance_team",
        department: "Administration Office",
        employee_type: "other",
        password_plain: "password123"
      },
      {
        id: 12,
        name: "Asset Manager",
        email: "manager@viit.edu.in",
        role: "asset_manager",
        department: "System Cell",
        employee_type: "other",
        password_plain: "password123"
      },
      {
        id: 13,
        name: "Employee",
        email: "employee@viit.edu.in",
        role: "employee",
        department: "System Cell",
        employee_type: "other",
        password_plain: "password123"
      },
      {
        id: 14,
        name: "Auditor",
        email: "auditor@viit.edu.in",
        role: "auditor",
        department: "System Cell",
        employee_type: "other",
        password_plain: "password123"
      },
      {
        id: 15,
        name: "Maintenance Team",
        email: "tech@viit.edu.in",
        role: "maintenance_team",
        department: "System Cell",
        employee_type: "other",
        password_plain: "password123"
      }
    ];

    const sysSalt = bcrypt.genSaltSync(10);
    for (const tu of testUsersToEnsure) {
      const exists = dbCache.users.some(u => u.email.toLowerCase() === tu.email.toLowerCase());
      if (!exists) {
        let assignedId = tu.id;
        while (dbCache.users.some(u => u.id === assignedId)) {
          assignedId++;
        }
        const newUserObj: User = {
          id: assignedId,
          name: tu.name,
          email: tu.email,
          password_hash: bcrypt.hashSync(tu.password_plain, sysSalt),
          role: tu.role as any,
          department: tu.department,
          employee_type: tu.employee_type,
          password_plain: tu.password_plain,
          created_at: new Date("2026-06-11").toISOString()
        };
        dbCache.users.push(newUserObj);
        await setDoc(doc(firestoreDb, "users", String(newUserObj.id)), newUserObj);
        changed = true;
      }
    }

    if (changed) {
      writeLocalDbBackup(dbCache);
    }

    console.log(`[VIIT AMS] Cloud cache ready. Loaded ${dbCache.users.length} users, ${dbCache.assets.length} assets, ${dbCache.requests.length} claims.`);
    return dbCache;
  } catch (err) {
    console.error("[VIIT AMS] Error downloading from Cloud Firestore. Reverting to persistent backup:", err);
    dbCache = localBackup;
    return dbCache;
  }
}

// Read Database - returns cached snapshot immediately for low latency UI
export function getDb(): DatabaseSchema {
  if (!dbCache) {
    console.log("[VIIT AMS] Warning: DB Cache accessed before preheating finished. Sourcing local fallback...");
    dbCache = getLocalDbBackup();
  }
  return dbCache;
}

// Write Database - updates cache, updates local backup, and kicks off async cloud sync
export function writeDb(data: DatabaseSchema): void {
  const previous = dbCache || getLocalDbBackup();
  dbCache = data;
  writeLocalDbBackup(data);

  if (!firestoreDb) return;

  // Sync to Firestore in the background
  syncToCloudFirestore(previous, data).catch((err) => {
    console.error("[VIIT AMS] Error syncing database modifications to Firestore: ", err);
  });
}

// Perform smart background entity delta push or delete inside Firestore
async function syncToCloudFirestore(prev: DatabaseSchema, current: DatabaseSchema) {
  const syncCollection = async <T extends { id: number }>(
    colName: string,
    prevItems: T[],
    currItems: T[]
  ) => {
    const prevMap = new Map(prevItems.map((item) => [item.id, item]));
    const currMap = new Map(currItems.map((item) => [item.id, item]));

    // Updates & inserts
    for (const item of currItems) {
      const prevVal = prevMap.get(item.id);
      if (!prevVal || JSON.stringify(prevVal) !== JSON.stringify(item)) {
        await setDoc(doc(firestoreDb, colName, String(item.id)), item);
      }
    }

    // Deletions
    for (const item of prevItems) {
      if (!currMap.has(item.id)) {
        await deleteDoc(doc(firestoreDb, colName, String(item.id)));
      }
    }
  };

  await syncCollection("users", prev.users, current.users);
  await syncCollection("assets", prev.assets, current.assets);
  await syncCollection("requests", prev.requests, current.requests);
  await syncCollection("maintenance_logs", prev.maintenance_logs, current.maintenance_logs);
  await syncCollection("audits", prev.audits, current.audits);
  
  if (current.suggestions && prev.suggestions) {
    await syncCollection("suggestions", prev.suggestions, current.suggestions);
  }

  if (JSON.stringify(prev.budgets) !== JSON.stringify(current.budgets)) {
    await setDoc(doc(firestoreDb, "budgets", "config"), current.budgets || { grossCapitalValuationOverride: null, cumulativeOutlaysOverride: null });
  }
}

export function isFirestoreConnected(): boolean {
  return firestoreDb !== null;
}

export async function forceSyncAllToFirestore(): Promise<{ success: boolean; usersCount: number; assetsCount: number; requestsCount: number; logsCount: number; auditsCount: number; suggestionsCount: number }> {
  if (!firestoreDb) {
    throw new Error("Firestore is not initiated (check firebase-applet-config.json)");
  }

  const current = getDb();

  // Force push every collection fully
  const forcePushCollection = async <T extends { id: number }>(colName: string, items: T[]) => {
    for (const item of items) {
      await setDoc(doc(firestoreDb, colName, String(item.id)), item);
    }
  };

  await forcePushCollection("users", current.users);
  await forcePushCollection("assets", current.assets);
  await forcePushCollection("requests", current.requests);
  await forcePushCollection("maintenance_logs", current.maintenance_logs);
  await forcePushCollection("audits", current.audits);
  
  if (current.suggestions) {
    await forcePushCollection("suggestions", current.suggestions);
  }

  await setDoc(doc(firestoreDb, "budgets", "config"), current.budgets || { grossCapitalValuationOverride: null, cumulativeOutlaysOverride: null });

  return {
    success: true,
    usersCount: current.users.length,
    assetsCount: current.assets.length,
    requestsCount: current.requests.length,
    logsCount: current.maintenance_logs.length,
    auditsCount: current.audits.length,
    suggestionsCount: current.suggestions ? current.suggestions.length : 0
  };
}

// Seed Init Data
function seedDatabase(): DatabaseSchema {
  const salt = bcrypt.genSaltSync(10);
  const passwordAdmin_hash = bcrypt.hashSync("password123", salt);

  const users: User[] = [
    {
      id: 1,
      name: "AdminSystemCell",
      email: "admin@vignaniit.edu.in",
      password_hash: passwordAdmin_hash,
      role: "super_admin",
      department: "System Cell",
      password_plain: "password123",
      created_at: new Date("2026-01-10").toISOString(),
    },
    {
      id: 2,
      name: "Web Support Team Dev",
      email: "rdvprasad36@gmail.com",
      password_hash: bcrypt.hashSync("020306", salt),
      role: "web_developer",
      department: "Website Support Team",
      password_plain: "020306",
      created_at: new Date("2026-06-06").toISOString(),
    }
  ];

  const assets: Asset[] = [];
  const requests: Request[] = [];
  const maintenance_logs: MaintenanceLog[] = [];

  const audits: SystemAudit[] = [
    {
      id: 1,
      user_id: 1,
      user_name: "AdminSystemCell",
      action_type: "SYSTEM_INITIALIZATION",
      entity_table: "system",
      details: "System successfully initialized. Clean database environment created by Vignan System Cell.",
      performed_at: new Date("2026-06-04T12:00:00Z").toISOString(),
    },
  ];

  return {
    users,
    assets,
    requests,
    maintenance_logs,
    audits,
    suggestions: []
  };
}

// Log actions dynamically helper to keep track of compliance reports
export function logSystemEvent(
  userId: number | null,
  userName: string,
  actionType: string,
  entityTable: string,
  entityId: number,
  details: string
) {
  const db = getDb();
  const newAudit: SystemAudit = {
    id: db.audits.length > 0 ? Math.max(...db.audits.map((a) => a.id)) + 1 : 1,
    user_id: userId,
    user_name: userName,
    action_type: actionType,
    entity_table: entityTable,
    entity_id: entityId,
    details,
    performed_at: new Date().toISOString(),
  };

  db.audits.unshift(newAudit); // prepend for chronological order
  writeDb(db);
}
