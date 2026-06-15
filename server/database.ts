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
export type RepairStatus = "reported" | "in_progress" | "awaiting_approval" | "resolved" | "unrepairable";

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
  phone?: string;
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
  allocated_to?: string;
  allocated_to_id?: number;
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

export interface ValuationReport {
  id: number;
  report_date: string;
  generated_by_id: number;
  generated_by_name: string;
  total_assets: number;
  total_valuation: number;
  total_repair_cost: number;
}

export interface UtilizationReport {
  id: number;
  report_date: string;
  generated_by_id: number;
  generated_by_name: string;
  total_assets: number;
  allocated_assets: number;
  available_assets: number;
  maintenance_assets: number;
}

export interface DatabaseSchema {
  users: User[];
  assets: Asset[];
  requests: Request[];
  maintenance_logs: MaintenanceLog[];
  audits: SystemAudit[];
  suggestions?: Suggestion[]; // Dynamic feedback support
  budgets?: BudgetConfig;
  utilization_reports?: UtilizationReport[];
  valuation_reports?: ValuationReport[];
}

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Initialize Supabase Connection
export let supabaseClient: SupabaseClient | null = null;
try {
  let supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  let supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    supabaseClient = createClient(supabaseUrl, supabaseKey);
    console.log("[VIIT AMS] Supabase connection successfully initialized.");
  } else {
    console.warn("[VIIT AMS] Warning: SUPABASE_URL or SUPABASE_ANON_KEY not found. Running in hybrid standalone fallback...");
  }
} catch (err) {
  console.error("[VIIT AMS] Error initializing Supabase client SDK:", err);
}

// Cleanup function
export async function cleanupSupabase() {
  if (supabaseClient) {
    console.log("[VIIT AMS] Cleaning up Supabase connections...");
    // Supabase JS doesn't require explicit termination like Firestore
    supabaseClient = null;
  }
}

// Silent retry helper with exponential backoff
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 500): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      const result = await fn();
      if (result && typeof result === "object" && "error" in result && (result as any).error) {
        throw (result as any).error;
      }
      return result;
    } catch (err: any) {
      attempt++;
      if (attempt >= retries) {
        throw err;
      }
      console.warn(`[VIIT AMS] Connection transient warning. Retrying... (attempt ${attempt}/${retries}):`, err.message || err);
      await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, attempt)));
    }
  }
}

// Global state cache serving fast reads
let dbCache: DatabaseSchema | null = null;
let lastSyncedDbStr: string = "";
export let cacheTimestamp: number = 0;
let pendingWrites: Promise<any>[] = [];

export function getPendingWrites() {
  return Promise.all(pendingWrites);
}

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

  let localBackupChanged = false;
  if (db.users) {
    db.users.forEach((u, idx) => {
      if (!u.phone) {
        const random9Digit = Math.floor(100000000 + Math.random() * 900000000);
        u.phone = `+91 9${random9Digit}`;
        localBackupChanged = true;
      }
    });
  }

  if (localBackupChanged) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  }

  if (!db.suggestions) db.suggestions = [];
  if (!db.utilization_reports) db.utilization_reports = [];
  if (!db.valuation_reports) db.valuation_reports = [];
  if (!db.budgets) db.budgets = { grossCapitalValuationOverride: null, cumulativeOutlaysOverride: null };
  if (!lastSyncedDbStr) {
    lastSyncedDbStr = JSON.stringify(db);
  }
  return db;
}

// Synchronous local file write backup
function writeLocalDbBackup(data: DatabaseSchema): void {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// Pre-heat database from Cloud Supabase asynchronously at boot time
let isPreheating = false;
let isPreheatedSuccessfully = false;

export async function preloadDbFromSupabase(forceRecalculate = false): Promise<DatabaseSchema> {
  if (isPreheatedSuccessfully && !forceRecalculate) {
    return dbCache || getLocalDbBackup();
  }

  if (isPreheating) {
    return dbCache || getLocalDbBackup();
  }

  if (pendingWrites.length > 0) {
    console.log("[VIIT AMS] Postponing preheat/down-sync because there are pending background writes in progress...");
    return dbCache || getLocalDbBackup();
  }

  const localBackup = getLocalDbBackup();

  if (!supabaseClient) {
    console.warn("[VIIT AMS] Preheating skipped (Supabase inactive). Using local backup schema.");
    dbCache = localBackup;
    return dbCache;
  }

  isPreheating = true;
  console.log("[VIIT AMS] Database preheating: synchronized with Cloud Supabase...");

  try {
    // 1. Fetch Users
    console.log("[VIIT AMS] Preheating: fetching users...");
    let usersData: any[] = [];
    try {
      const res = await withRetry(async () => supabaseClient!.from("users").select("*"));
      if (res.error) throw res.error;
      usersData = res.data || [];
    } catch (err: any) {
      console.error("[VIIT AMS] Failed fetching users collection after retries:", err.message || err);
      if (err.message && err.message.includes("Could not find the table")) {
        console.warn("[VIIT AMS] Supabase tables do not exist. Disabling Supabase. Please run the SQL schema script in your Supabase SQL Editor.");
        supabaseClient = null;
        dbCache = localBackup;
        return dbCache;
      }
    }
    
    let users: User[] = [];
    for (const d of usersData) {
      const u = d as User;
      if (!u.phone) {
        const random9Digit = Math.floor(100000000 + Math.random() * 900000000);
        u.phone = `+91 9${random9Digit}`;
        await withRetry(async () => supabaseClient!.from("users").upsert(u));
      }
      users.push(u);
    }

    // 2. Seed both Supabase and Local if Supabase contains no users
    if (users.length === 0) {
      console.log("[VIIT AMS] Cloud Supabase is empty. Assuring fallback sync...");
      const seeded = localBackup;

      for (const u of seeded.users || []) {
        await withRetry(async () => supabaseClient!.from("users").upsert(u));
      }
      for (const a of seeded.assets || []) {
        await withRetry(async () => supabaseClient!.from("assets").upsert(a));
      }
      for (const r of seeded.requests || []) {
        await withRetry(async () => supabaseClient!.from("requests").upsert(r));
      }
      for (const l of seeded.maintenance_logs || []) {
        await withRetry(async () => supabaseClient!.from("maintenance_logs").upsert(l));
      }
      for (const aud of seeded.audits || []) {
        await withRetry(async () => supabaseClient!.from("audits").upsert(aud));
      }

      const defaultBudget: BudgetConfig = { grossCapitalValuationOverride: null, cumulativeOutlaysOverride: null };
      await withRetry(async () => supabaseClient!.from("budgets").upsert({ id: 'config', ...defaultBudget }));

      dbCache = {
        ...seeded,
        suggestions: seeded.suggestions || [],
        budgets: seeded.budgets || defaultBudget
      };

      lastSyncedDbStr = JSON.stringify(dbCache);
      writeLocalDbBackup(dbCache);
      cacheTimestamp = Date.now();
      return dbCache;
    }

    // 3. Otherwise fetch allocations
    console.log("[VIIT AMS] Preheating: fetching assets...");
    let assetsData: any[] = [];
    try {
      const res = await withRetry(async () => supabaseClient!.from("assets").select("*"));
      assetsData = res.data || [];
    } catch (err: any) {
      console.error("[VIIT AMS] Failed fetching assets collection after retries:", err.message || err);
    }
    const assets: Asset[] = assetsData as Asset[];

    console.log("[VIIT AMS] Preheating: fetching requests...");
    let requestsData: any[] = [];
    try {
      const res = await withRetry(async () => supabaseClient!.from("requests").select("*"));
      requestsData = res.data || [];
    } catch (err: any) {
      console.error("[VIIT AMS] Failed fetching requests collection after retries:", err.message || err);
    }
    const requests: Request[] = requestsData as Request[];

    console.log("[VIIT AMS] Preheating: fetching maintenance_logs...");
    let logsData: any[] = [];
    try {
      const res = await withRetry(async () => supabaseClient!.from("maintenance_logs").select("*"));
      logsData = res.data || [];
    } catch (err: any) {
      console.error("[VIIT AMS] Failed fetching maintenance_logs collection after retries:", err.message || err);
    }
    const maintenance_logs: MaintenanceLog[] = logsData as MaintenanceLog[];

    console.log("[VIIT AMS] Preheating: fetching audits...");
    let auditsData: any[] = [];
    try {
      const res = await withRetry(async () => supabaseClient!.from("audits").select("*"));
      auditsData = res.data || [];
    } catch (err: any) {
      console.error("[VIIT AMS] Failed fetching audits collection after retries:", err.message || err);
    }
    const audits: SystemAudit[] = auditsData as SystemAudit[];

    console.log("[VIIT AMS] Preheating: fetching suggestions...");
    let suggestionsData: any[] = [];
    try {
      const res = await withRetry(async () => supabaseClient!.from("suggestions").select("*"));
      suggestionsData = res.data || [];
    } catch (err: any) {
      console.error("[VIIT AMS] Failed fetching suggestions collection after retries:", err.message || err);
    }
    const suggestions: Suggestion[] = suggestionsData as Suggestion[];

    console.log("[VIIT AMS] Preheating: fetching budgets...");
    let budgets: BudgetConfig = { grossCapitalValuationOverride: null, cumulativeOutlaysOverride: null };
    try {
      const budgetRes = await withRetry(async () => supabaseClient!.from("budgets").select("*").eq("id", "config").single());
      if (budgetRes.data) {
        budgets = budgetRes.data as BudgetConfig;
      }
    } catch (e: any) {
      console.warn("[VIIT AMS] Failed to fetch budgets override:", e.message || e);
    }

    console.log("[VIIT AMS] Preheating: fetching utilization_reports...");
    let utilizationReportsData: any[] = [];
    try {
      const res = await withRetry(async () => supabaseClient!.from("utilization_reports").select("*"));
      utilizationReportsData = res.data || [];
    } catch (err: any) {
      // Quietly fall back, as utilization_reports is optional and may be saved purely locally
      utilizationReportsData = localBackup.utilization_reports || [];
    }
    const utilization_reports: UtilizationReport[] = utilizationReportsData as UtilizationReport[];

    dbCache = {
      users: users.sort((a, b) => a.id - b.id),
      assets: assets.sort((a, b) => a.id - b.id),
      requests: requests.sort((a, b) => a.id - b.id),
      maintenance_logs: maintenance_logs.sort((a, b) => a.id - b.id),
      audits: audits.sort((a, b) => b.id - a.id),
      suggestions: suggestions.sort((a, b) => a.id - b.id),
      utilization_reports: utilization_reports.sort((a, b) => a.id - b.id),
      budgets
    };

    let changed = false;

    // Detect if old pre-set seeded metadata exists, then perform clean sweeps of Supabase
    const hasOldUsers = dbCache.users.some(u => ["technoblade@gmail.com"].includes(u.email));
    if (hasOldUsers) {
      console.log("[VIIT AMS] Obsolete constant data detected. Deleting old profiles, assets, and request lines inside Supabase to start fresh...");
      
      try {
        await supabaseClient!.from("assets").delete().neq("id", 0);
        await supabaseClient!.from("requests").delete().neq("id", 0);
        await supabaseClient!.from("maintenance_logs").delete().neq("id", 0);
        await supabaseClient!.from("suggestions").delete().neq("id", 0);
        
        await supabaseClient!.from("users").delete()
          .neq("email", "admin@vignaniit.edu.in")
          .neq("email", "rdvprasad36@gmail.com");
      } catch (err) {
        console.error("[VIIT AMS] Warning: some items failed to delete in Supabase sweep", err);
      }

      // Re-initialize clean blank database
      dbCache = seedDatabase();
      
      // Seed newly updated clean users in Supabase
      for (const u of dbCache.users) {
        await supabaseClient!.from("users").upsert(u);
      }
      
      changed = true;
    }

    // Ensure Hidden Web Developer rdvprasad36 is registered
    const hasRdv = dbCache.users.some(u => u.email === "rdvprasad36@gmail.com");
    if (!hasRdv) {
      const salt = bcrypt.genSaltSync(10);
      const passwordRdv_hash = bcrypt.hashSync("020306", salt);
      let validIds = dbCache.users.filter(u => typeof u.id === 'number' && !isNaN(u.id)).map(u => u.id);
      const nextId = validIds.length > 0 ? Math.max(...validIds) + 1 : 1;
      const rdvUser: User = {
        id: nextId,
        name: "Web Support Team Dev",
        email: "rdvprasad36@gmail.com",
        password_hash: passwordRdv_hash,
        role: "web_developer",
        department: "Website Support Team",
        password_plain: "020306",
        created_at: new Date().toISOString(),
        phone: "+91 9884477551",
      };
      dbCache.users.push(rdvUser);
      await supabaseClient!.from("users").upsert(rdvUser);
      changed = true;
    }

    // Ensure Super Admin is named to AdminSystemCell as requested
    const adminUser = dbCache.users.find(u => u.email === "admin@vignaniit.edu.in");
    if (adminUser && adminUser.name !== "AdminSystemCell") {
      adminUser.name = "AdminSystemCell";
      await supabaseClient!.from("users").upsert(adminUser);
      changed = true;
    }

    if (changed) {
      writeLocalDbBackup(dbCache);
    }

    console.log(`[VIIT AMS] Cloud cache ready. Loaded ${dbCache.users.length} users, ${dbCache.assets.length} assets, ${dbCache.requests.length} claims.`);
    lastSyncedDbStr = JSON.stringify(dbCache);
    cacheTimestamp = Date.now();
    isPreheatedSuccessfully = true;
    return dbCache;
  } catch (err) {
    console.error("[VIIT AMS] Error downloading from Cloud Supabase. Reverting to persistent backup:", err);
    dbCache = localBackup;
    return dbCache;
  } finally {
    isPreheating = false;
  }
}

// Read Database - returns cached snapshot immediately for low latency UI
export function getDb(): DatabaseSchema {
  if (!dbCache) {
    console.log("[VIIT AMS] Warning: DB Cache accessed before preheating finished. Sourcing local fallback...");
    dbCache = getLocalDbBackup();
  }
  
  // Background cache refresh every 15 seconds so we are never more than 15s behind but don't block reads
  if (supabaseClient && Date.now() - cacheTimestamp > 15000) {
    preloadDbFromSupabase(true).catch((err) => {
      console.warn("[VIIT AMS] Background preload automatic cache refresh failed:", err.message || err);
    });
  }
  
  return dbCache;
}

// Write Database - updates cache, updates local backup, and kicks off async cloud sync (registered in pendingWrites)
export function writeDb(data: DatabaseSchema): void {
  const prevParsed: DatabaseSchema = lastSyncedDbStr
    ? JSON.parse(lastSyncedDbStr)
    : { users: [], assets: [], requests: [], maintenance_logs: [], audits: [], suggestions: [], utilization_reports: [], valuation_reports: [] };
  
  const currentCopied = JSON.parse(JSON.stringify(data));

  dbCache = data;
  writeLocalDbBackup(data);

  if (!supabaseClient) return;

  // Sync to Supabase in the background
  const syncPromise = syncToSupabase(prevParsed, currentCopied).then(() => {
    lastSyncedDbStr = JSON.stringify(currentCopied);
    cacheTimestamp = Date.now(); // update cacheTimestamp on successful save
  }).catch((err) => {
    console.error("[VIIT AMS] Error syncing database modifications to Supabase: ", err);
  });
  
  pendingWrites.push(syncPromise);
  syncPromise.finally(() => {
    pendingWrites = pendingWrites.filter(p => p !== syncPromise);
  });
}

// Perform smart background entity delta push or delete inside Supabase
async function syncToSupabase(prev: DatabaseSchema, current: DatabaseSchema) {
  const syncCollection = async <T extends { id: number }>(
    colName: string,
    prevItems: T[],
    currItems: T[]
  ) => {
    const prevMap = new Map((prevItems || []).map((item) => [item.id, item]));
    const currMap = new Map((currItems || []).map((item) => [item.id, item]));

    // Updates & inserts
    for (const item of currItems || []) {
      const prevVal = prevMap.get(item.id);
      if (!prevVal || JSON.stringify(prevVal) !== JSON.stringify(item)) {
        await supabaseClient!.from(colName).upsert(item);
      }
    }

    // Deletions
    for (const item of prevItems || []) {
      if (!currMap.has(item.id)) {
        await supabaseClient!.from(colName).delete().eq('id', item.id);
      }
    }
  };

  try {
    await syncCollection("users", prev.users || [], current.users || []);
  } catch (err: any) {
    console.error("[VIIT AMS] Failed to sync users to Supabase:", err.message || err);
  }

  try {
    await syncCollection("assets", prev.assets || [], current.assets || []);
  } catch (err: any) {
    console.error("[VIIT AMS] Failed to sync assets to Supabase:", err.message || err);
  }

  try {
    await syncCollection("requests", prev.requests || [], current.requests || []);
  } catch (err: any) {
    console.error("[VIIT AMS] Failed to sync requests to Supabase:", err.message || err);
  }

  try {
    await syncCollection("maintenance_logs", prev.maintenance_logs || [], current.maintenance_logs || []);
  } catch (err: any) {
    console.error("[VIIT AMS] Failed to sync maintenance_logs to Supabase:", err.message || err);
  }

  try {
    await syncCollection("audits", prev.audits || [], current.audits || []);
  } catch (err: any) {
    console.error("[VIIT AMS] Failed to sync audits to Supabase:", err.message || err);
  }

  try {
    await syncCollection("utilization_reports", prev.utilization_reports || [], current.utilization_reports || []);
  } catch (err: any) {
    // Quietly ignore since utilization_reports is saved locally
  }

  try {
    await syncCollection("suggestions", prev.suggestions || [], current.suggestions || []);
  } catch (err: any) {
    console.error("[VIIT AMS] Failed to sync suggestions to Supabase:", err.message || err);
  }

  if (JSON.stringify(prev.budgets) !== JSON.stringify(current.budgets)) {
    try {
      await supabaseClient!.from("budgets").upsert({ id: "config", ...(current.budgets || { grossCapitalValuationOverride: null, cumulativeOutlaysOverride: null }) });
    } catch (err: any) {
      console.error("[VIIT AMS] Failed to sync budgets override to Supabase:", err.message || err);
    }
  }
}

export function isSupabaseConnected(): boolean {
  return supabaseClient !== null;
}

export async function forceSyncAllToSupabase(): Promise<{ success: boolean; usersCount: number; assetsCount: number; requestsCount: number; logsCount: number; auditsCount: number; suggestionsCount: number }> {
  if (!supabaseClient) {
    throw new Error("Supabase is not initiated (check environment variables)");
  }

  const current = getDb();

  // Force push every collection fully
  const forcePushCollection = async <T extends { id: number }>(colName: string, items: T[]) => {
    for (const item of items) {
      await supabaseClient!.from(colName).upsert(item);
    }
  };

  await forcePushCollection("users", current.users);
  await forcePushCollection("assets", current.assets);
  await forcePushCollection("requests", current.requests);
  await forcePushCollection("maintenance_logs", current.maintenance_logs);
  try {
    await forcePushCollection("audits", current.audits);
  } catch (err: any) {
    console.error("[VIIT AMS] Failed to force sync audits collection:", err.message || err);
  }
  
  if (current.utilization_reports) {
    try {
      await forcePushCollection("utilization_reports", current.utilization_reports);
    } catch (err: any) {
      // Quietly ignore
    }
  }
  
  if (current.suggestions) {
    try {
      await forcePushCollection("suggestions", current.suggestions);
    } catch (err: any) {
      console.error("[VIIT AMS] Failed to force sync suggestions collection:", err.message || err);
    }
  }

  try {
    await supabaseClient!.from("budgets").upsert({ id: "config", ...(current.budgets || { grossCapitalValuationOverride: null, cumulativeOutlaysOverride: null }) });
  } catch (err: any) {
    console.error("[VIIT AMS] Failed to force sync budgets config:", err.message || err);
  }

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
    suggestions: [],
    utilization_reports: [],
    valuation_reports: []
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

  // Exclude logging for anything initiated by a web_developer or involving a web_developer
  if (userId) {
    const actor = db.users.find((u) => u.id === userId);
    if (actor && actor.role === "web_developer") {
      return; // Skip logging
    }
  }

  if (entityTable === "users" && entityId) {
    const targetUser = db.users.find((u) => u.id === entityId);
    if (targetUser && targetUser.role === "web_developer") {
      return; // Skip logging
    }
  }

  const normalizedDetails = (details || "").toLowerCase();
  const normalizedAction = (actionType || "").toLowerCase();
  if (
    normalizedDetails.includes("web_developer") || 
    normalizedDetails.includes("web developer") || 
    normalizedAction.includes("web_developer") ||
    normalizedAction.includes("web developer")
  ) {
    return; // Skip logging
  }

  const newAudit: SystemAudit = {
    id: db.audits.length > 0 ? Math.max(0, ...db.audits.map((a) => a.id || 0)) + 1 : 1,
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
