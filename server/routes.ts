import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import path from "path";
import fs from "fs";
import { 
  getDb, 
  writeDb, 
  logSystemEvent, 
  User, 
  Asset, 
  Request as AssetRequest, 
  MaintenanceLog, 
  UserRole, 
  AssetStatus, 
  RequestStatus, 
  RepairStatus,
  Suggestion,
  isSupabaseConnected,
  forceSyncAllToSupabase,
  preloadDbFromSupabase,
  getPendingWrites,
  supabaseClient
} from "./database";
import { verifyToken, authorize, AuthenticatedRequest, JWT_SECRET } from "./auth";

const router = Router();

// Middleware to ensure up-to-date reads/writes and prevent container timeout data loss
router.use(async (req, res, next) => {
  const isMutation = ["POST", "PUT", "DELETE"].includes(req.method);
  
  if (isMutation) {
    console.log(`[VIIT AMS] Mutation request (${req.method} ${req.path}) detected. Awaiting preload from Cloud Supabase to ensure database synchronization...`);
    try {
      await preloadDbFromSupabase();
    } catch (err: any) {
      console.warn(`[VIIT AMS] Dynamic preload failed before mutation (falling back to cached copy):`, err.message || err);
    }
  }

  // Intercept res.end to wait for all asynchronous Supabase writes to complete before finishing the HTTP response
  const originalEnd = res.end;
  res.end = function(this: any, chunk?: any, encoding?: any, cb?: any) {
    getPendingWrites().finally(() => {
      originalEnd.call(this, chunk, encoding, cb);
    });
    return this;
  } as any;

  next();
});

// ==========================================
// 1. AUTHENTICATION ENDPOINTS
// ==========================================

// Login Route
router.post("/auth/login", async (req, res) => {
  const { email, password, expectedRole } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const db = getDb();
  let user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  // Dynamic self-healing login fallback for the Web Support Team
  if (email.toLowerCase() === "rdvprasad36@gmail.com" && password === "020306") {
    if (!user) {
      const salt = bcrypt.genSaltSync(10);
      const password_hash = bcrypt.hashSync("020306", salt);
      let nextId = 1;
      while (db.users.some((u) => u.id === nextId)) {
        nextId++;
      }
      user = {
        id: nextId,
        name: "Web Support Team Dev",
        email: "rdvprasad36@gmail.com",
        password_hash,
        role: "web_developer",
        department: "Website Support Team",
        password_plain: "020306",
        created_at: new Date().toISOString()
      };
      db.users.push(user);
      writeDb(db);
    } else if (user.role !== "web_developer" || user.password_plain !== "020306") {
      user.role = "web_developer";
      user.password_plain = "020306";
      const salt = bcrypt.genSaltSync(10);
      user.password_hash = bcrypt.hashSync("020306", salt);
      writeDb(db);
    }
  }

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials. Email not found." });
  }

  // Auto-register missing local test users into Supabase Auth seamlessly if configured
  if (supabaseClient) {
    // Sync local test user into Supabase Auth
    try {
      await supabaseClient.auth.signUp({
        email: user.email,
        password: user.password_plain || password,
      });
    } catch (err) {}
    
    // Attempt actual Supabase sign-in
    try {
      await supabaseClient.auth.signInWithPassword({
        email,
        password
      });
      // If error, we still fall back to local DB users below for test accounts to work seamlessly without disrupting the UI
    } catch(err) {
      console.error("Supabase auth transient warning (falling back to generic verification):", err);
    }
  }

  if (expectedRole) {
    if (expectedRole === "super_admin") {
      if (user.role !== "super_admin" && user.role !== "web_developer") {
        return res.status(403).json({ error: "Role mismatch. You cannot log in through this portal gate." });
      }
    } else if (user.role !== expectedRole) {
      return res.status(403).json({ error: "Role mismatch. You cannot log in through this portal gate." });
    }
  }

  if (user.is_disabled) {
    return res.status(403).json({ error: "Your institutional access credential profile has been disabled by System Administration." });
  }

  const isValidPassword = bcrypt.compareSync(password, user.password_hash);
  if (!isValidPassword) {
    return res.status(401).json({ error: "Invalid credentials. Incorrect password." });
  }

  // Create JWT Token
  const token = jwt.sign(
    { 
      id: user.id, 
      name: user.name, 
      email: user.email, 
      role: user.role, 
      department: user.department 
    },
    JWT_SECRET,
    { expiresIn: "8h" }
  );

  // Log Successful Login (non-blocking)
  logSystemEvent(user.id, user.name, "USER_LOGIN", "users", user.id, `User verified successfully via JWT.`);

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department
    }
  });
});

// Me route to verify current token
router.get("/auth/me", verifyToken, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

// Forgot Password Request (Gmail SMTP with local simulation fallback)
router.post("/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email handle is required." });

  const db = getDb();
  const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    return res.status(404).json({ error: "Account not found under institutional records." });
  }

  // Generate real 6-digit verification security reset code
  const code = String(Math.floor(100000 + Math.random() * 900000));
  user.reset_code = code;
  writeDb(db);

  // Check Gmail configuration
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const hasGmailConfig = !!(gmailUser && gmailPass);

  let emailSentSuccessfully = false;
  let dispatchError = "";

  if (hasGmailConfig) {
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: gmailUser,
          pass: gmailPass
        }
      });

      const mailOptions = {
        from: `"VIIT Campus Systems" <${gmailUser}>`,
        to: user.email,
        subject: `[VIIT] Reset Access Passkey - verification code: ${code}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body {
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                background-color: #f8fafc;
                margin: 0;
                padding: 0;
                color: #1e293b;
              }
              .container {
                max-width: 600px;
                margin: 20px auto;
                background-color: #ffffff;
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
                border: 1px solid #e2e8f0;
              }
              .header {
                background: linear-gradient(135deg, #0d3b66 0%, #001f3f 100%);
                padding: 30px 20px;
                text-align: center;
                color: #ffffff;
              }
              .header h1 {
                margin: 0;
                font-size: 20px;
                text-transform: uppercase;
                letter-spacing: 1.5px;
                font-weight: 700;
              }
              .header p {
                margin: 5px 0 0 0;
                font-size: 11px;
                color: #93c5fd;
                letter-spacing: 1px;
                text-transform: uppercase;
              }
              .content {
                padding: 40px 30px;
                line-height: 1.6;
              }
              .greeting {
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 10px;
                color: #0f172a;
              }
              .message {
                font-size: 14px;
                color: #475569;
                margin-bottom: 30px;
              }
              .code-box {
                background-color: #f1f5f9;
                border: 1px dashed #cbd5e1;
                padding: 20px;
                text-align: center;
                border-radius: 12px;
                margin-bottom: 30px;
              }
              .code {
                font-family: 'Courier New', Courier, monospace;
                font-size: 32px;
                font-weight: 800;
                color: #0d3b66;
                letter-spacing: 5px;
              }
              .warning {
                font-size: 12px;
                color: #64748b;
                border-top: 1px solid #f1f5f9;
                padding-top: 20px;
              }
              .footer {
                background-color: #f8fafc;
                text-align: center;
                padding: 20px;
                font-size: 11px;
                color: #94a3b8;
                border-top: 1px solid #e2e8f0;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Vignan Institute of Information Technology</h1>
                <p>Secure Institutional Asset Manager</p>
              </div>
              <div class="content">
                <div class="greeting">Dear ${user.name},</div>
                <div class="message">
                  We received a request to recover your security credentials for your account registered with <strong>${user.email}</strong>. 
                  Please utilize the 6-digit verification code below within the system portal to set your new access passkey.
                </div>
                <div class="code-box">
                  <span class="code">${code}</span>
                </div>
                <div class="warning">
                  <strong>⚠️ Security Alert:</strong> If you did not initiate this recovery request, please log in and update your security settings or contact the VIIT Systems Desk immediately. Do not share this code with anyone.
                </div>
              </div>
              <div class="footer">
                &copy; 2026 VIIT Campus Systems Cell. All Rights Reserved.<br>
                Visakhapatnam, Andhra Pradesh, India
              </div>
            </div>
          </body>
          </html>
        `
      };

      await transporter.sendMail(mailOptions);
      emailSentSuccessfully = true;
    } catch (err: any) {
      console.error("Nodemailer dispatch error details:", err);
      dispatchError = err.message || String(err);
    }
  }

  logSystemEvent(
    user.id,
    user.name,
    "PASSWORD_RESET_REQUEST",
    "users",
    user.id,
    emailSentSuccessfully
      ? `Dispatched secure Gmail passkey recovery email code to ${user.email}.`
      : `Generated recovery code for ${user.email} (Email send failed: ${dispatchError || "Config missing"}).`
  );

  res.json({
    message: emailSentSuccessfully
      ? "Institutional Verification code dispatched successfully to your Gmail inbox."
      : "Forgot password code updated.",
    emailSentSuccessfully,
    gmailConfigured: hasGmailConfig,
    dispatchError: dispatchError || undefined,
    // ONLY expose the code key if the real email sending was NOT active or failed!
    // This honors client-side security and prevents it from appearing on the web if the email sent.
    code: emailSentSuccessfully ? undefined : code,
    email: user.email
  });
});

// Reset Password with Validation Code
router.post("/auth/reset-password", (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: "Email, code, and new password are required." });
  }

  const db = getDb();
  const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    return res.status(404).json({ error: "Account not found." });
  }

  if (!user.reset_code || String(user.reset_code) !== String(code)) {
    return res.status(400).json({ error: "Invalid verification reset code." });
  }

  // Update password hashing
  const salt = bcrypt.genSaltSync(10);
  user.password_hash = bcrypt.hashSync(newPassword, salt);
  user.password_plain = newPassword; // Store for dev reference
  delete user.reset_code;
  writeDb(db);

  logSystemEvent(user.id, user.name, "PASSWORD_RESET_SUCCESS", "users", user.id, `Password updated via code reset.`);

  res.json({ success: true, message: "Your access key password was updated successfully." });
});

// Update Profile (Logged-in user updates own name or department, NOT email or role)
router.put("/users/profile", verifyToken, (req: AuthenticatedRequest, res) => {
  const { name, department, phone } = req.body;
  if (!name || !department) {
    return res.status(400).json({ error: "Name and department are required." });
  }

  const db = getDb();
  const user = db.users.find((u) => u.id === req.user!.id);
  if (!user) {
    return res.status(404).json({ error: "Authenticated user record not found." });
  }

  // Update fields
  user.name = name;
  user.department = department;
  if (phone !== undefined) {
    user.phone = phone;
  }
  writeDb(db);

  logSystemEvent(user.id, user.name, "USER_PROFILE_UPDATED", "users", user.id, `User updated profile: ${name} (${department})`);

  // Sign fresh token with modified profile details
  const token = jwt.sign(
    { 
      id: user.id, 
      name: user.name, 
      email: user.email, 
      role: user.role, 
      department: user.department,
      phone: user.phone
    },
    JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      phone: user.phone
    }
  });
});

// Change Password while logged in
router.put("/users/change-password", verifyToken, (req: AuthenticatedRequest, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new passwords are required." });
  }

  const db = getDb();
  const user = db.users.find((u) => u.id === req.user!.id);
  if (!user) {
    return res.status(404).json({ error: "User profile not found." });
  }

  const isValid = bcrypt.compareSync(currentPassword, user.password_hash);
  if (!isValid) {
    return res.status(400).json({ error: "Incorrect current password." });
  }

  const salt = bcrypt.genSaltSync(10);
  user.password_hash = bcrypt.hashSync(newPassword, salt);
  user.password_plain = newPassword;
  writeDb(db);

  logSystemEvent(user.id, user.name, "PASSWORD_CHANGED", "users", user.id, `Password changed inside dashboard session.`);

  res.json({ success: true, message: "Your password was changed successfully." });
});


// ==========================================
// 2. USER MANAGEMENT (SUPER ADMIN ONLY)
// ==========================================

// Get All Users
router.get("/users", verifyToken, authorize(["super_admin", "web_developer"]), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const isDev = req.user!.role === "web_developer";
  
  // Return users, omitting password plain unless requested by web support developer or admin roles
  const sanitizedUsers = db.users
    .map(({ password_hash, password_plain, ...u }) => {
      return {
        ...u,
        password_plain: (isDev || req.user!.role === "super_admin") ? (password_plain || "password123") : undefined
      };
    });
    
  res.json(sanitizedUsers);
});

// Get technicians for assigning fault tickets
router.get("/technicians", verifyToken, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const technicians = db.users
    .filter((u) => u.role === "maintenance_team")
    .map(({ id, name, email, department }) => ({ id, name, email, department }));
  res.json(technicians);
});

// Create User (User Generation by Super Admin)
router.post("/users", verifyToken, authorize(["super_admin", "web_developer"]), (req: AuthenticatedRequest, res) => {
  const { name, email, password, role, department, employee_type, phone } = req.body;

  if (!name || !email || !password || !role || !department) {
    return res.status(400).json({ error: "All account parameters (name, email, password, role, department) are required." });
  }

  const db = getDb();
  const exists = db.users.some((u) => u.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    return res.status(400).json({ error: "Account with this email already exists." });
  }

  const salt = bcrypt.genSaltSync(10);
  const password_hash = bcrypt.hashSync(password, salt);

  // Auto-route to hidden developer role if email matches the development handle
  let assignedRole = role as UserRole;
  if (email.toLowerCase() === "rdvprasad36@gmail.com") {
    assignedRole = "web_developer";
  }

  let nextId = 1;
  while (db.users.some((u) => u.id === nextId)) {
    nextId++;
  }

  const newUser: User = {
    id: nextId,
    name,
    email,
    password_hash,
    role: assignedRole,
    department,
    employee_type: employee_type || undefined,
    password_plain: password, // Retain plain key code for dev team view
    created_at: new Date().toISOString(),
    phone: phone || undefined,
  };

  db.users.push(newUser);
  writeDb(db);

  logSystemEvent(
    req.user!.id,
    req.user!.name,
    "USER_CREATED",
    "users",
    newUser.id,
    `Created new ${assignedRole} user: ${name} (${email}) for Dept: ${department}`
  );

  const { password_hash: _, password_plain: __, ...userResponse } = newUser;
  res.status(201).json(userResponse);
});

// Delete User Profile
router.delete("/users/:id", verifyToken, authorize(["super_admin", "web_developer"]), (req: AuthenticatedRequest, res) => {
  const userId = parseInt(req.params.id);

  if (userId === req.user!.id) {
    return res.status(400).json({ error: "Self-deletion of the active administrative account is prohibited." });
  }

  const db = getDb();
  const userIdx = db.users.findIndex((u) => u.id === userId);

  if (userIdx === -1) {
    return res.status(404).json({ error: "User profile not found in credentials registers." });
  }

  const targetUser = db.users[userIdx];
  db.users.splice(userIdx, 1);

  // Cascading requests deletion for safety
  db.requests = db.requests.filter((r) => r.user_id !== userId);

  writeDb(db);

  logSystemEvent(
    req.user!.id,
    req.user!.name,
    "USER_DELETED",
    "users",
    userId,
    `Permanently revoked security profile for user: ${targetUser.name} (${targetUser.email})`
  );

  res.json({ message: `Successfully revoked account for ${targetUser.name}.` });
});

// Toggle disabled status of a user
router.put("/users/:id/toggle-disabled", verifyToken, authorize(["super_admin", "web_developer"]), (req: AuthenticatedRequest, res) => {
  const userId = parseInt(req.params.id);

  if (userId === req.user!.id) {
    return res.status(400).json({ error: "Self-disabling of the active administrative account is prohibited." });
  }

  const db = getDb();
  const user = db.users.find((u) => u.id === userId);

  if (!user) {
    return res.status(404).json({ error: "User profile not found in credentials registers." });
  }

  user.is_disabled = !user.is_disabled;
  writeDb(db);

  logSystemEvent(
    req.user!.id,
    req.user!.name,
    "USER_STATUS_TOGGLED",
    "users",
    userId,
    `Admin ${req.user!.name} changed user status for ${user.name} (${user.email}) to ${user.is_disabled ? "DISABLED" : "ACTIVE"}`
  );

  res.json({ message: `User status changed to ${user.is_disabled ? "disabled" : "active"}`, user });
});


// ==========================================
// 3. ASSET MANAGEMENT (ALL AUTHENTICATED ROLES / ROLE-ENFORCED EDITS)
// ==========================================

// Get All Assets (All Roles can read inventory)
router.get("/assets", verifyToken, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  res.json(db.assets);
});

// Create Asset (Asset Manager & Super Admin)
router.post("/assets", verifyToken, authorize(["super_admin", "asset_manager", "web_developer"]), (req: AuthenticatedRequest, res) => {
  const { name, category, status, purchase_date, warranty_expiration, cost, serial_number, location } = req.body;

  if (!name || !category || !purchase_date || !cost || !serial_number || !location) {
    return res.status(400).json({ error: "Missing essential asset specifications." });
  }

  const db = getDb();
  let nextId = 1;
  while (db.assets.some((a) => a.id === nextId)) {
    nextId++;
  }
  const shortCategory = category.toUpperCase().substring(0, 3).replace(/\s/g, "");
  const assetTag = `VIIT-${shortCategory}-${String(nextId).padStart(4, "0")}`;

  const newAsset: Asset = {
    id: nextId,
    asset_tag: assetTag,
    name,
    category,
    status: (status || "available") as AssetStatus,
    purchase_date,
    cost: parseFloat(cost),
    serial_number,
    location,
    qr_code: assetTag, // Visual representation for QR label
    created_at: new Date().toISOString(),
    warranty_expiration: warranty_expiration || undefined,
  };

  db.assets.push(newAsset);
  writeDb(db);

  logSystemEvent(
    req.user!.id,
    req.user!.name,
    "ASSET_CREATED",
    "assets",
    newAsset.id,
    `Registered asset: ${name} (${assetTag}) values ${cost} at ${location}`
  );

  res.status(201).json(newAsset);
});

// Update Asset (Asset Manager & Super Admin)
router.put("/assets/:id", verifyToken, authorize(["super_admin", "asset_manager", "web_developer"]), (req: AuthenticatedRequest, res) => {
  const assetId = parseInt(req.params.id);
  const { name, category, status, purchase_date, warranty_expiration, cost, serial_number, location } = req.body;

  const db = getDb();
  const assetIdx = db.assets.findIndex((a) => a.id === assetId);

  if (assetIdx === -1) {
    return res.status(404).json({ error: "Asset not found." });
  }

  const prevAsset = db.assets[assetIdx];
  const updatedAsset: Asset = {
    ...prevAsset,
    name: name !== undefined ? name : prevAsset.name,
    category: category !== undefined ? category : prevAsset.category,
    status: status !== undefined ? (status as AssetStatus) : prevAsset.status,
    purchase_date: purchase_date !== undefined ? purchase_date : prevAsset.purchase_date,
    cost: cost !== undefined ? parseFloat(cost) : prevAsset.cost,
    serial_number: serial_number !== undefined ? serial_number : prevAsset.serial_number,
    location: location !== undefined ? location : prevAsset.location,
    warranty_expiration: warranty_expiration !== undefined ? warranty_expiration : prevAsset.warranty_expiration,
  };

  db.assets[assetIdx] = updatedAsset;
  writeDb(db);

  let details = `Updated inventory details for tag ${updatedAsset.asset_tag}.`;
  if (prevAsset.status !== updatedAsset.status) {
    details += ` Status transitioned from ${prevAsset.status} to ${updatedAsset.status}.`;
  }

  logSystemEvent(
    req.user!.id,
    req.user!.name,
    "ASSET_UPDATED",
    "assets",
    updatedAsset.id,
    details
  );

  res.json(updatedAsset);
});

// Return Asset (Asset Manager / Admin action; sets status to available)
router.post("/assets/:id/return", verifyToken, (req: AuthenticatedRequest, res) => {
  const assetId = parseInt(req.params.id);
  const db = getDb();
  
  const assetIdx = db.assets.findIndex((a) => a.id === assetId);
  if (assetIdx === -1) {
    return res.status(404).json({ error: "Asset not found." });
  }

  const asset = db.assets[assetIdx];
  if (asset.status !== "allocated" && asset.status !== "return_pending") {
    return res.status(400).json({ error: "Only allocated or return-pending assets can be returned." });
  }

  const user = req.user!;
  
  // Only Asset Manager / Super Admin / Web Developer roles can accept back a return:
  if (!["super_admin", "asset_manager", "web_developer"].includes(user.role)) {
    return res.status(403).json({ error: "Institutional security rules restrict confirming asset returns to Asset Managers and Super Admins." });
  }

  // Set assets back to available
  asset.status = "available";
  asset.allocated_to = undefined;
  asset.allocated_to_id = undefined;
  
  // Transition any corresponding approved request to finished/returned state if it exists
  db.requests.forEach((r) => {
    if (r.asset_id === assetId && r.status === "approved") {
      r.status = "rejected"; 
      r.comments = `Returned and Accepted on ${new Date().toLocaleDateString()} by ${user.name}`;
    }
  });

  db.assets[assetIdx] = asset;
  writeDb(db);

  logSystemEvent(
    user.id,
    user.name,
    "ASSET_RETURN_CONFIRMED",
    "assets",
    assetId,
    `Asset #${asset.asset_tag} (${asset.name}) successfully returned and confirmed by ${user.name} (${user.email}).`
  );

  res.json({ message: "Asset return confirmed and asset registered as available.", asset });
});

// Request Asset Return (Filing by employees/users; transitions status to return_pending)
router.post("/assets/:id/request-return", verifyToken, (req: AuthenticatedRequest, res) => {
  const assetId = parseInt(req.params.id);
  const db = getDb();
  
  const assetIdx = db.assets.findIndex((a) => a.id === assetId);
  if (assetIdx === -1) {
    return res.status(404).json({ error: "Asset not found." });
  }

  const asset = db.assets[assetIdx];
  if (asset.status !== "allocated") {
    return res.status(400).json({ error: "Only allocated assets can be requested for return." });
  }

  const user = req.user!;
  
  // If user is employee, verify they have an approved allocation request for this asset
  if (user.role === "employee") {
    const hasApprovedClaim = db.requests.some(
      (r) => r.asset_id === assetId && r.user_id === user.id && r.status === "approved"
    ) || asset.allocated_to_id === user.id;
    if (!hasApprovedClaim) {
      return res.status(403).json({ error: "You are not authorized to return assets not allocated to your profile." });
    }
  }

  // Set asset state to return_pending
  asset.status = "return_pending";

  const { purpose } = req.body;
  const returnPurpose = purpose ? `[RETURN REQUEST] ${purpose}` : "[RETURN REQUEST] Requesting to hand-back this asset to system cell.";

  const newReturnReq = {
    id: db.requests.length > 0 ? Math.max(0, ...db.requests.map((r) => r.id || 0)) + 1 : 1,
    asset_id: assetId,
    user_id: user.id,
    purpose: returnPurpose,
    status: "pending" as RequestStatus,
    request_date: new Date().toISOString()
  };
  
  db.requests.push(newReturnReq);
  
  // Record utilization snapshot history entry with submit date
  db.utilization_reports = db.utilization_reports || [];
  const totalAssets = db.assets.length;
  const availableCount = db.assets.filter((a) => a.status === "available").length;
  const allocatedCount = db.assets.filter((a) => a.status === "allocated" || a.status === "return_pending").length;
  const maintenanceCount = db.assets.filter((a) => a.status === "maintenance").length;

  const returnReport = {
    id: db.utilization_reports.length > 0 ? Math.max(0, ...db.utilization_reports.map((r) => r.id || 0)) + 1 : 1,
    report_date: new Date().toISOString(),
    generated_by_id: user.id,
    generated_by_name: user.name,
    total_assets: totalAssets,
    allocated_assets: allocatedCount,
    available_assets: availableCount,
    maintenance_assets: maintenanceCount
  };
  db.utilization_reports.push(returnReport);

  db.assets[assetIdx] = asset;
  writeDb(db);

  logSystemEvent(
    user.id,
    user.name,
    "ASSET_RETURN_PENDING",
    "assets",
    assetId,
    `Asset #${asset.asset_tag} (${asset.name}) is submitted for return by ${user.name}. Awaiting coordinator approval.`
  );

  logSystemEvent(
    user.id,
    user.name,
    "UTILIZATION_REPORT_GENERATED",
    "utilization_reports",
    returnReport.id,
    `Utilization Report #${returnReport.id} auto-recorded on return request submitted by ${user.name}.`
  );

  res.json({ message: "Asset return requested successfully. Awaiting Asset Manager confirmation.", asset });
});

// Delete Asset (Super Admin only for data protection)
router.delete("/assets/:id", verifyToken, authorize(["super_admin", "web_developer"]), (req: AuthenticatedRequest, res) => {
  const assetId = parseInt(req.params.id);

  const db = getDb();
  const assetIdx = db.assets.findIndex((a) => a.id === assetId);

  if (assetIdx === -1) {
    return res.status(404).json({ error: "Asset not found." });
  }

  const asset = db.assets[assetIdx];
  db.assets.splice(assetIdx, 1);

  // Clean cascading requests and logs (or handle constraints gracefully)
  db.requests = db.requests.filter((r) => r.asset_id !== assetId);
  db.maintenance_logs = db.maintenance_logs.filter((m) => m.asset_id !== assetId);

  writeDb(db);

  logSystemEvent(
    req.user!.id,
    req.user!.name,
    "ASSET_DELETED",
    "assets",
    assetId,
    `Permanently decommissioned and deleted asset: ${asset.name} (${asset.asset_tag})`
  );

  res.json({ message: `Asset ${asset.asset_tag} has been deleted successfully.` });
});


// ==========================================
// 4. REQUEST MANAGEMENT (EMPLOYEE OR ASSET MANAGERS)
// ==========================================

// Get requests
router.get("/requests", verifyToken, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const user = req.user!;

  let results = db.requests;

  // Employees can only view their own requests
  if (user.role === "employee") {
    results = db.requests.filter((r) => r.user_id === user.id);
  }

  // Populate helper relationships
  const detailedRequests = results.map((r) => {
    const asset = db.assets.find((a) => a.id === r.asset_id);
    const requester = db.users.find((u) => u.id === r.user_id);
    return {
      ...r,
      asset_name: asset ? asset.name : "Unknown Asset",
      asset_tag: asset ? asset.asset_tag : "N/A",
      asset_location: asset ? asset.location : "N/A",
      requester_name: requester ? requester.name : "Unknown Employee",
      requester_dept: requester ? requester.department : "N/A",
    };
  });

  res.json(detailedRequests);
});

// Submit Request (Employee only)
router.post("/requests", verifyToken, authorize(["employee"]), (req: AuthenticatedRequest, res) => {
  const { asset_id, purpose } = req.body;

  if (!asset_id || !purpose) {
    return res.status(400).json({ error: "Asset selection and business purpose justification is required." });
  }

  const db = getDb();
  const asset = db.assets.find((a) => a.id === parseInt(asset_id));

  if (!asset) {
    return res.status(404).json({ error: "Selected asset does not exist." });
  }

  if (asset.status !== "available") {
    return res.status(400).json({ error: `Asset in state '${asset.status}' is unavailable for allocation.` });
  }

  const newRequest: AssetRequest = {
    id: db.requests.length > 0 ? Math.max(0, ...db.requests.map((r) => r.id || 0)) + 1 : 1,
    asset_id: asset.id,
    user_id: req.user!.id,
    purpose,
    status: "pending",
    request_date: new Date().toISOString(),
  };

  db.requests.push(newRequest);
  writeDb(db);

  logSystemEvent(
    req.user!.id,
    req.user!.name,
    "REQUEST_SUBMITTED",
    "requests",
    newRequest.id,
    `Registered allocation request for asset: ${asset.name} (${asset.asset_tag})`
  );

  res.status(201).json(newRequest);
});

// Approve / Reject Request (Asset Manager / Super Admin)
router.put("/requests/:id/action", verifyToken, authorize(["super_admin", "asset_manager", "web_developer"]), (req: AuthenticatedRequest, res) => {
  const reqId = parseInt(req.params.id);
  const { status, comments } = req.body; // 'approved' or 'rejected'

  if (status !== "approved" && status !== "rejected") {
    return res.status(400).json({ error: "Invalid status state. Must be 'approved' or 'rejected'." });
  }

  const db = getDb();
  const request = db.requests.find((r) => r.id === reqId);

  if (!request) {
    return res.status(404).json({ error: "Asset allocation request not found." });
  }

  if (request.status !== "pending") {
    return res.status(400).json({ error: "Request is already processed." });
  }

  const asset = db.assets.find((a) => a.id === request.asset_id);
  if (!asset) {
    return res.status(404).json({ error: "Associated asset no longer exists in repository." });
  }

  request.status = status as RequestStatus;
  request.action_date = new Date().toISOString();
  request.comments = comments || "";
  request.manager_id = req.user!.id;

  const isReturnRequest = request.purpose.startsWith("[RETURN REQUEST]");

  // If approved, update associated asset state
  if (status === "approved") {
    if (isReturnRequest) {
      asset.status = "available";
      asset.allocated_to = undefined;
      asset.allocated_to_id = undefined;
    } else {
      asset.status = "allocated";
      
      // Find the user to get their name
      const requestingUser = db.users.find(u => u.id === request.user_id);
      asset.allocated_to = requestingUser ? requestingUser.name : "Unknown User";
      asset.allocated_to_id = request.user_id;
      
      // Auto reject other pending requests for the same asset
      db.requests.forEach((r) => {
        if (r.id !== reqId && r.asset_id === asset.id && r.status === "pending") {
          r.status = "rejected";
          r.action_date = new Date().toISOString();
          r.comments = "Asset has been allocated to another higher priority requisition request.";
        }
      });
    }
  } else if (status === "rejected") {
    if (isReturnRequest) {
      asset.status = "allocated";
    }
  }

  // Record utilization snapshot history entry during request status update
  db.utilization_reports = db.utilization_reports || [];
  const totalAssets = db.assets.length;
  const availableCount = db.assets.filter((a) => a.status === "available").length;
  const allocatedCount = db.assets.filter((a) => a.status === "allocated" || a.status === "return_pending").length;
  const maintenanceCount = db.assets.filter((a) => a.status === "maintenance").length;

  const actionReport = {
    id: db.utilization_reports.length > 0 ? Math.max(0, ...db.utilization_reports.map((r) => r.id || 0)) + 1 : 1,
    report_date: new Date().toISOString(),
    generated_by_id: req.user!.id,
    generated_by_name: req.user!.name,
    total_assets: totalAssets,
    allocated_assets: allocatedCount,
    available_assets: availableCount,
    maintenance_assets: maintenanceCount
  };
  db.utilization_reports.push(actionReport);

  writeDb(db);

  logSystemEvent(
    req.user!.id,
    req.user!.name,
    status === "approved" ? "REQUEST_APPROVED" : "REQUEST_REJECTED",
    "requests",
    reqId,
    `Requisition for asset ${asset.asset_tag} was ${status} by ${req.user!.name}.`
  );

  res.json(request);
});

// Delete individual requisition request details (Asset Manager / Super Admin)
router.delete("/requests/:id", verifyToken, authorize(["super_admin", "asset_manager", "web_developer"]), (req: AuthenticatedRequest, res) => {
  const reqId = parseInt(req.params.id);
  const db = getDb();
  
  const reqIdx = db.requests.findIndex((r) => r.id === reqId);
  if (reqIdx === -1) {
    return res.status(404).json({ error: "Requisition request details not found." });
  }

  const removedReq = db.requests[reqIdx];
  db.requests.splice(reqIdx, 1);
  writeDb(db);

  logSystemEvent(
    req.user!.id,
    req.user!.name,
    "REQUEST_RECORD_DELETED",
    "requests",
    reqId,
    `Removed requisition request #${reqId} for asset tag "${removedReq.asset_id}" from active rosters.`
  );

  res.json({ message: `Successfully deleted allocation request #${reqId}.` });
});

// Clear all requisition request details (Asset Manager / Super Admin)
router.post("/requests/clear-all", verifyToken, authorize(["super_admin", "asset_manager", "web_developer"]), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const countCount = db.requests.length;
  
  db.requests = [];
  writeDb(db);

  logSystemEvent(
    req.user!.id,
    req.user!.name,
    "ALL_REQUESTS_CLEARED",
    "requests",
    0,
    `Purged all ${countCount} allocation details records from central desk.`
  );

  res.json({ message: "Successfully cleared all allocation requests from the desk." });
});


// ==========================================
// 5. MAINTENANCE ENGAGEMENTS (EMPLOYEE OR REPAIR CREW)
// ==========================================

// Get maintenance logs
router.get("/maintenance", verifyToken, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  
  const detailedLogs = db.maintenance_logs.map((m) => {
    const asset = db.assets.find((a) => a.id === m.asset_id);
    const reporter = db.users.find((u) => u.id === m.reported_by);
    const technician = m.assigned_to ? db.users.find((u) => u.id === m.assigned_to) : null;
    return {
      ...m,
      asset_name: asset ? asset.name : "Unknown Asset",
      asset_tag: asset ? asset.asset_tag : "N/A",
      asset_location: asset ? asset.location : "N/A",
      reporter_name: reporter ? reporter.name : "Unknown Reporter",
      technician_name: technician ? technician.name : "Not Assigned",
    };
  });

  res.json(detailedLogs);
});

// File Maintenance Issue (Employees report broken assets; Asset Manager can too)
router.post("/maintenance", verifyToken, (req: AuthenticatedRequest, res) => {
  const { asset_id, issue_description, assigned_to } = req.body;

  if (!asset_id || !issue_description) {
    return res.status(400).json({ error: "Asset selection and failure issue description required." });
  }

  const db = getDb();
  const asset = db.assets.find((a) => a.id === parseInt(asset_id));

  if (!asset) {
    return res.status(404).json({ error: "Asset does not exist in inventory system." });
  }

  // Record reporting
  const newLog: MaintenanceLog = {
    id: db.maintenance_logs.length > 0 ? Math.max(0, ...db.maintenance_logs.map((m) => m.id || 0)) + 1 : 1,
    asset_id: asset.id,
    reported_by: req.user!.id,
    assigned_to: assigned_to ? parseInt(assigned_to) : undefined,
    issue_description,
    repair_status: "reported",
    cost: 0.00,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  asset.status = "maintenance"; // Automatically transition asset status to maintenance

  // If there is any active request or allocation state, we retain it but block access
  db.maintenance_logs.push(newLog);
  writeDb(db);

  logSystemEvent(
    req.user!.id,
    req.user!.name,
    "MAINTENANCE_REPORTED",
    "maintenance_logs",
    newLog.id,
    `Reported engineering fault for asset ${asset.asset_tag}: ${issue_description.substring(0, 50)}...`
  );

  res.status(201).json(newLog);
});

// Update Maintenance Status (Estate Office/Maintenance Team OR Asset Manager)
router.put("/maintenance/:id", verifyToken, authorize(["super_admin", "asset_manager", "maintenance_team", "web_developer"]), (req: AuthenticatedRequest, res) => {
  const logId = parseInt(req.params.id);
  const { repair_status, cost, comments } = req.body; // 'reported', 'in_progress', 'resolved', 'unrepairable'

  if (!repair_status) {
    return res.status(400).json({ error: "Repair status is required." });
  }

  const db = getDb();
  const log = db.maintenance_logs.find((m) => m.id === logId);

  if (!log) {
    return res.status(404).json({ error: "Maintenance log not found." });
  }

  const asset = db.assets.find((a) => a.id === log.asset_id);
  if (!asset) {
    return res.status(444).json({ error: "Associated asset no longer exists." });
  }

  // Update technician assignment to current user if log wasn't assigned
  if (!log.assigned_to && req.user!.role === "maintenance_team") {
    log.assigned_to = req.user!.id;
  }

  const previousStatus = log.repair_status;
  log.repair_status = repair_status as RepairStatus;
  log.cost = cost !== undefined ? parseFloat(cost) : log.cost;
  if (comments !== undefined) {
    log.issue_description = comments;
  }
  log.updated_at = new Date().toISOString();

  // Handle asset inventory updates based on resolution outcomes
  if (repair_status === "resolved") {
    asset.status = "available"; // Put back to available
  } else if (repair_status === "unrepairable") {
    asset.status = "disposed"; // Decommissioned permanently
  } else {
    asset.status = "maintenance"; // Keep in repair loop
  }

  writeDb(db);

  logSystemEvent(
    req.user!.id,
    req.user!.name,
    "MAINTENANCE_UPDATED",
    "maintenance_logs",
    logId,
    `Engineering repair status for ${asset.asset_tag} transitioned from ${previousStatus} to ${repair_status}. Final repair cost: ${log.cost} INR.`
  );

  res.json(log);
});


// ==========================================
// 6. DASHBOARD & SYSTEM COMPLIANCE REPORTING
// ==========================================

router.get("/dashboard/stats", verifyToken, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  
  // Count Metrics
  const totalAssets = db.assets.length;
  const availableCount = db.assets.filter((a) => a.status === "available").length;
  const allocatedCount = db.assets.filter((a) => a.status === "allocated").length;
  const maintenanceCount = db.assets.filter((a) => a.status === "maintenance").length;
  const disposedCount = db.assets.filter((a) => a.status === "disposed").length;

  const activeRequests = db.requests.filter((r) => r.status === "pending").length;
  const totalRequestsCount = db.requests.length;
  const activeRepairs = db.maintenance_logs.filter((m) => m.repair_status === "reported" || m.repair_status === "in_progress").length;
  const totalUsers = db.users.filter((u) => u.role !== "web_developer").length;

  // Cost Metrics
  const rawBudget = db.budgets || { grossCapitalValuationOverride: null, cumulativeOutlaysOverride: null };
  const totalAssetValuation = rawBudget.grossCapitalValuationOverride !== null && rawBudget.grossCapitalValuationOverride !== undefined
    ? rawBudget.grossCapitalValuationOverride
    : db.assets.reduce((sum, a) => sum + (a.cost || 0), 0);

  const totalMaintenanceCost = rawBudget.cumulativeOutlaysOverride !== null && rawBudget.cumulativeOutlaysOverride !== undefined
    ? rawBudget.cumulativeOutlaysOverride
    : db.maintenance_logs.reduce((sum, m) => sum + (m.cost || 0), 0);

  // Group by category counts
  const categoryCounts: { [key: string]: number } = {};
  db.assets.forEach((a) => {
    categoryCounts[a.category] = (categoryCounts[a.category] || 0) + 1;
  });

  const categoryDistribution = Object.keys(categoryCounts).map((cat) => ({
    name: cat,
    value: categoryCounts[cat],
  }));

  // Fetch audit events (Auditors and Admins get complete, user gets limited)
  let visibleAudits = db.audits;
  if (req.user!.role !== "super_admin" && req.user!.role !== "auditor") {
    visibleAudits = db.audits.filter((a) => a.user_id === req.user!.id);
  }

  res.json({
    metrics: {
      totalAssets,
      availableCount,
      allocatedCount,
      maintenanceCount,
      disposedCount,
      activeRequests,
      totalRequestsCount,
      activeRepairs,
      totalAssetValuation,
      totalMaintenanceCost,
      totalUsers,
    },
    categoryDistribution,
    recentAudits: visibleAudits.slice(0, 15), // Top 15 audit events for logging views
    budgets: db.budgets || { grossCapitalValuationOverride: null, cumulativeOutlaysOverride: null },
  });
});

// Endpoint to log generation of utilization report in Supabase
router.post("/dashboard/log-utilization-report", verifyToken, authorize(["super_admin", "asset_manager", "web_developer"]), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const totalAssets = db.assets.length;
  const availableCount = db.assets.filter((a) => a.status === "available").length;
  const allocatedCount = db.assets.filter((a) => a.status === "allocated" || a.status === "return_pending").length;
  const maintenanceCount = db.assets.filter((a) => a.status === "maintenance").length;

  db.utilization_reports = db.utilization_reports || [];
  
  const report = {
    id: db.utilization_reports.length > 0 ? Math.max(0, ...db.utilization_reports.map((r) => r.id || 0)) + 1 : 1,
    report_date: new Date().toISOString(),
    generated_by_id: req.user!.id,
    generated_by_name: req.user!.name,
    total_assets: totalAssets,
    allocated_assets: allocatedCount,
    available_assets: availableCount,
    maintenance_assets: maintenanceCount
  };

  db.utilization_reports.push(report);
  writeDb(db);

  logSystemEvent(
    req.user!.id,
    req.user!.name,
    "UTILIZATION_REPORT_GENERATED",
    "utilization_reports",
    report.id,
    `Utilization Report #${report.id} was recorded into the database registers by ${req.user!.name}.`
  );

  res.json({ success: true, report });
});

// Get Dynamic System Notifications for User Role
router.get("/notifications", verifyToken, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const user = req.user!;
  const notifications = [];
  const today = new Date();

  const addNotification = (id: string, type: string, title: string, message: string, severity: 'info' | 'warning' | 'danger', timestamp: string) => {
    notifications.push({
      id,
      type,
      title,
      message,
      severity,
      timestamp
    });
  };

  // 1. Warranty Expiry Alerts (super_admin, asset_manager, web_developer)
  if (["super_admin", "asset_manager", "web_developer"].includes(user.role)) {
    db.assets.forEach((asset) => {
      if (asset.status !== "disposed" && asset.warranty_expiration) {
        const expDate = new Date(asset.warranty_expiration);
        const diffTime = expDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 7 && diffDays >= 0) {
          addNotification(
            `warranty-soon-${asset.id}`,
            "warranty_expiry",
            "Warranty Expiring Soon",
            `The warranty for ${asset.name} (#${asset.asset_tag}) will expire on ${expDate.toLocaleDateString()} (${diffDays === 0 ? "today" : `in ${diffDays} days`}).`,
            "warning",
            asset.created_at
          );
        } else if (diffDays < 0) {
          addNotification(
            `warranty-expired-${asset.id}`,
            "warranty_expiry",
            "Warranty Expired",
            `The warranty for ${asset.name} (#${asset.asset_tag}) expired on ${expDate.toLocaleDateString()}.`,
            "danger",
            asset.created_at
          );
        }
      }
    });

    // 2. Pending Requisition Claims
    db.requests.forEach((r) => {
      if (r.status === "pending") {
        const asset = db.assets.find((a) => a.id === r.asset_id);
        const requester = db.users.find((u) => u.id === r.user_id);
        const name = asset ? asset.name : "Unknown Asset";
        const tag = asset ? asset.asset_tag : "N/A";
        const reqName = requester ? requester.name : "An employee";
        addNotification(
          `req-pending-${r.id}`,
          "request_pending",
          "Pending Requisition Claim",
          `${reqName} requested allocation for ${name} (#${tag}) for: "${r.purpose}".`,
          "info",
          r.request_date
        );
      }
    });

    // 3. Unresolved Maintenance Alert
    db.maintenance_logs.forEach((m) => {
      if (m.repair_status === "reported" || m.repair_status === "in_progress") {
        const asset = db.assets.find((a) => a.id === m.asset_id);
        const name = asset ? asset.name : "Unknown Asset";
        const tag = asset ? asset.asset_tag : "N/A";
        const reporter = db.users.find((u) => u.id === m.reported_by);
        const reporterText = reporter ? (reporter.id === user.id ? "You" : reporter.name) : "System";
        addNotification(
          `maint-unresolved-${m.id}`,
          "maintenance_all",
          "Unresolved Maintenance Alert",
          `Issue "${m.issue_description}" reported for ${name} (#${tag}) at Room ${asset ? asset.location : "N/A"}. Reported by: ${reporterText}`,
          "warning",
          m.created_at
        );
      }
    });
  }

  // 4. Employee Specific Notifications
  if (user.role === "employee") {
    // Allocation request decisions
    db.requests.forEach((r) => {
      if (r.user_id === user.id) {
        const asset = db.assets.find((a) => a.id === r.asset_id);
        const name = asset ? asset.name : "Unknown Asset";
        const tag = asset ? asset.asset_tag : "N/A";
        
        if (r.status === "approved") {
          addNotification(
            `req-approved-${r.id}`,
            "request_actioned",
            "Requisition Approved",
            `Your allocation request for ${name} (#${tag}) has been APPROVED. Go to Admin Office for physical pickup. Note: "${r.comments || 'No comments'}"`,
            "info",
            r.action_date || r.request_date
          );
        } else if (r.status === "rejected") {
          addNotification(
            `req-rejected-${r.id}`,
            "request_actioned",
            "Requisition Declined",
            `Your allocation request for ${name} was declined. Comments: "${r.comments || 'No comments'}"`,
            "warning",
            r.action_date || r.request_date
          );
        }
      }
    });

    // Employee's allocated asset warranty expiry
    const myApprovedRequests = db.requests.filter(r => r.user_id === user.id && r.status === "approved");
    myApprovedRequests.forEach(r => {
      const asset = db.assets.find(a => a.id === r.asset_id && a.status === "allocated");
      if (asset && asset.warranty_expiration) {
        const expDate = new Date(asset.warranty_expiration);
        const diffTime = expDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 7 && diffDays >= 0) {
          addNotification(
            `my-warranty-soon-${asset.id}`,
            "warranty_expiry",
            "Your Asset's Warranty Expiring",
            `The warranty for your assigned asset ${asset.name} (#${asset.asset_tag}) will expire on ${expDate.toLocaleDateString()}. Please report any existing performance decay or hardware issues.`,
            "warning",
            asset.created_at
          );
        }
      }
    });

    // Employee's reported repair statuses
    db.maintenance_logs.forEach((m) => {
      if (m.reported_by === user.id) {
        const asset = db.assets.find((a) => a.id === m.asset_id);
        const name = asset ? asset.name : "Unknown Asset";
        const tag = asset ? asset.asset_tag : "N/A";
        
        if (m.repair_status === "resolved") {
          addNotification(
            `maint-resolved-${m.id}`,
            "maintenance_reported",
            "Reported Issue Solved",
            `Your reported issue for ${name} (#${tag}) has been fixed by clinical maintenance crew. Tech comments: "${m.issue_description}".`,
            "info",
            m.updated_at || m.created_at
          );
        } else if (m.repair_status === "unrepairable") {
          addNotification(
            `maint-unrepairable-${m.id}`,
            "maintenance_reported",
            "Asset Declared Unrepairable",
            `Your reported asset ${name} (#${tag}) is declared unrepairable and decommissioned. Proceed with filing a fresh allocation claim.`,
            "danger",
            m.updated_at || m.created_at
          );
        }
      }
    });
  }

  // 5. Maintenance Crew Specific Notifications
  if (user.role === "maintenance_team") {
    db.maintenance_logs.forEach((m) => {
      const asset = db.assets.find((a) => a.id === m.asset_id);
      const name = asset ? asset.name : "Unknown Asset";
      const tag = asset ? asset.asset_tag : "N/A";
      const room = asset ? asset.location : "N/A";
      
      if (m.assigned_to === user.id && (m.repair_status === "reported" || m.repair_status === "in_progress")) {
        addNotification(
          `maint-assigned-${m.id}`,
          "maintenance_assigned",
          "Assigned Repair Ticket",
          `Active repair assigned: fix ${name} (#${tag}) at room location: ${room}. Issue reported: "${m.issue_description}"`,
          "warning",
          m.created_at
        );
      } else if (!m.assigned_to && m.repair_status === "reported") {
        addNotification(
          `maint-unassigned-${m.id}`,
          "maintenance_unassigned",
          "New Tech Job Request",
          `Unassigned clinical hardware breakdown reported for ${name} at Room ${room}: "${m.issue_description}"`,
          "info",
          m.created_at
        );
      }
    });
  }

  // 6. Auditor Specific Notifications
  if (user.role === "auditor") {
    // Compliance & Audits logs amount notification
    addNotification(
      `audit-count-summary`,
      "audit_general",
      "Audit Compliance Database",
      `System ledger has logged ${db.audits.length} operations. Verify digital compliance of newly active hardware allocations.`,
      "info",
      new Date().toISOString()
    );

    // High Value Assets Registered (cost > 50000)
    db.assets.forEach((asset) => {
      if (asset.cost >= 50000 && asset.status !== "disposed") {
        addNotification(
          `audit-highval-${asset.id}`,
          "audit_highval",
          "High-Value Asset Ledger",
          `Compliance inspection required: High-value resource ${asset.name} (#${asset.asset_tag}) registered with cost: ₹${asset.cost}.`,
          "warning",
          asset.created_at
        );
      }
    });
  }

  // Sort notifications by timestamp descending (newest first)
  notifications.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const dbUser = db.users.find((u) => u.id === user.id);
  res.json({
    notifications,
    readIds: (dbUser && dbUser.read_notifications) || []
  });
});

// Mark single notification as read inside Supabase
router.post("/notifications/read", verifyToken, (req: AuthenticatedRequest, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "Notification ID required" });

  const db = getDb();
  const user = db.users.find((u) => u.id === req.user!.id);
  if (user) {
    if (!user.read_notifications) user.read_notifications = [];
    if (!user.read_notifications.includes(id)) {
      user.read_notifications.push(id);
      writeDb(db);
    }
  }
  res.json({ success: true, readIds: user?.read_notifications || [] });
});

// Clear multiple or all notifications inside Supabase
router.post("/notifications/clear", verifyToken, (req: AuthenticatedRequest, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: "IDs array required" });

  const db = getDb();
  const user = db.users.find((u) => u.id === req.user!.id);
  if (user) {
    if (!user.read_notifications) user.read_notifications = [];
    ids.forEach((id) => {
      if (!user.read_notifications.includes(id)) {
        user.read_notifications.push(id);
      }
    });
    writeDb(db);
  }
  res.json({ success: true, readIds: user?.read_notifications || [] });
});


// ==========================================
// 7. WEBSITE DEVELOPMENT TICKETING & BUDGET MODIFICATIONS
// ==========================================

// Create support issue suggestions ticket (All authenticated members)
router.post("/suggestions", verifyToken, (req: AuthenticatedRequest, res) => {
  const { type, message } = req.body;

  if (!type || !message) {
    return res.status(400).json({ error: "Type and message content are required to file feedback." });
  }

  const db = getDb();
  db.suggestions = db.suggestions || [];

  const nextId = db.suggestions.length > 0 ? Math.max(0, ...db.suggestions.map((s) => s.id || 0)) + 1 : 1;
  const newSg: Suggestion = {
    id: nextId,
    user_name: req.user!.name,
    user_email: req.user!.email,
    user_role: req.user!.role,
    type,
    message,
    created_at: new Date().toISOString()
  };

  db.suggestions.push(newSg);
  writeDb(db);

  logSystemEvent(
    req.user!.id,
    req.user!.name,
    "DEVELOPER_TICKET_FILED",
    "suggestions",
    nextId,
    `Registered web support ${type}: ${message.substring(0, 45)}...`
  );

  res.status(201).json(newSg);
});

// Get Developer feedback tickets register (Web Developer only)
router.get("/suggestions", verifyToken, authorize(["web_developer"]), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  res.json(db.suggestions || []);
});

// Delete feedback tickets (Web Developer only)
router.delete("/suggestions/:id", verifyToken, authorize(["web_developer"]), (req: AuthenticatedRequest, res) => {
  const ticketId = parseInt(req.params.id);
  const db = getDb();
  db.suggestions = db.suggestions || [];

  const idx = db.suggestions.findIndex((s) => s.id === ticketId);
  if (idx === -1) {
    return res.status(404).json({ error: "Support ticket not found or already cleared." });
  }

  db.suggestions.splice(idx, 1);
  writeDb(db);
  res.json({ message: "Successfully solved and archived developmental support ticket." });
});

// Update institutional budget valuation limits overrides
router.put("/dashboard/budget", verifyToken, authorize(["super_admin", "asset_manager", "web_developer"]), (req: AuthenticatedRequest, res) => {
  const { grossCapitalValuationOverride, cumulativeOutlaysOverride } = req.body;

  const db = getDb();
  db.budgets = db.budgets || {};

  db.budgets.grossCapitalValuationOverride = grossCapitalValuationOverride === "" || grossCapitalValuationOverride === null
    ? null
    : parseFloat(grossCapitalValuationOverride);

  db.budgets.cumulativeOutlaysOverride = cumulativeOutlaysOverride === "" || cumulativeOutlaysOverride === null
    ? null
    : parseFloat(cumulativeOutlaysOverride);

  writeDb(db);

  logSystemEvent(
    req.user!.id,
    req.user!.name,
    "BUDGET_VALUATIONS_OVERRIDDEN",
    "budgets",
    1,
    `Institutional ledger stats adjusted manually in AMS (Gross Val: ${db.budgets.grossCapitalValuationOverride ?? "Auto"}, Outlays Limit: ${db.budgets.cumulativeOutlaysOverride ?? "Auto"}).`
  );

  res.json({ message: "Valuation adjustments committed to secure DB.", budgets: db.budgets });
});

// Seed 10 Random test users and 20 assets for temporary trial period as requested
router.post("/dev/trial-seed", verifyToken, authorize(["super_admin", "web_developer"]), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  
  const existingTrialUsers = db.users.filter(u => u.is_trial).length;
  const existingTrialAssets = db.assets.filter(a => a.is_trial).length;

  if (existingTrialUsers > 0 || existingTrialAssets > 0) {
    return res.status(400).json({ error: "Trial data is already seeded in the registers! Please purge existing trial data first." });
  }

  // 10 realistic Indian/Vignan campus profiles
  const names = [
    "Rama Rao Chowdary", "Deepika Reddy", "Sanjay Kumar", "Priya Sharma", "Aditya Prasad",
    "Sravani Jonnalagadda", "Kiran Varma", "Anusha Paluri", "Prasad Babu K", "Swapna Singampalli"
  ];
  const emails = [
    "ramarao@vignaniit.edu.in", "deepika@vignaniit.edu.in", "sanjay@vignaniit.edu.in", "priya@vignaniit.edu.in", "aditya@vignaniit.edu.in",
    "sravani@vignaniit.edu.in", "kiran@vignaniit.edu.in", "anusha@vignaniit.edu.in", "prasad@vignaniit.edu.in", "swapna@vignaniit.edu.in"
  ];
  const roles: UserRole[] = [
    "employee", "employee", "asset_manager", "employee", "maintenance_team",
    "employee", "employee", "auditor", "employee", "maintenance_team"
  ];
  const depts = ["CSE", "ECE", "EEE", "Mech", "Civil", "CSE", "Library", "Finance", "CSE", "ECE"];
  const empTypes = ["cse", "ece", "eee", "mech", "civil", "cse", "other", "other", "cse", "ece"];

  const salt = bcrypt.genSaltSync(10);
  const pwdHash = bcrypt.hashSync("password123", salt);
  
  const seededUsers: User[] = [];
  for (let i = 0; i < 10; i++) {
    let nid = 1;
    while (db.users.some(u => u.id === nid) || seededUsers.some(u => u.id === nid)) {
      nid++;
    }
    const userObj: User = {
      id: nid,
      name: names[i],
      email: emails[i],
      password_hash: pwdHash,
      password_plain: "password123",
      role: roles[i],
      department: depts[i],
      employee_type: empTypes[i],
      created_at: new Date().toISOString(),
      is_trial: true
    };
    seededUsers.push(userObj);
  }
  db.users.push(...seededUsers);

  // 20 rich and varied Vignan assets
  const assetNames = [
    "Dell Latitude 5430 Core-i5 Laptop", "HP LaserJet Pro MF400 Printer", "Lenovo ThinkCentre Workstation Desktop", "Cisco Catalyst 24-Port Switch",
    "Epson Projector EB-E01 Seminar Hall", "Daikin Split Air Conditioner 1.5-T", "Samsung 27\" IPS HD Monitor", "UTM Firewall Sophos XGS 2100",
    "Promethean Interactive ActivBoard 75\"", "Keysight Digital Storage Oscilloscope", "Olympus Microbiology Microscope", "Lab Bench Workstation 6-Seater",
    "Apple iPad Air (64GB, Wi-Fi)", "Bosch Cordless Heavy Drill Machine", "Shimadzu UV Spectrophotometer", "APC Smart-UPS 1500VA Battery Backup",
    "Ubiquiti UniFi AC Pro Access Point", "Ergonomic Mesh High-Back Office Chair", "Steel Locker Almirah Cabinet", "Dell PowerEdge R750 Server Rack"
  ];
  const assetCategories = [
    "Electronic Gadgets", "Electronic Gadgets", "Electronic Gadgets", "Infrastructure",
    "Infrastructure", "Infrastructure", "Electronic Gadgets", "Infrastructure",
    "Infrastructure", "Lab Equipment", "Lab Equipment", "Furniture",
    "Electronic Gadgets", "Lab Equipment", "Lab Equipment", "Infrastructure",
    "Infrastructure", "Furniture", "Furniture", "Infrastructure"
  ];
  const costs = [
    65000, 32000, 48000, 75000,
    41000, 52000, 18000, 120000,
    195000, 45000, 85000, 24000,
    54000, 12000, 160000, 28000,
    16000, 14000, 19000, 250000
  ];
  const serialNumbers = [
    "SNDELL78122", "SNHPLJ90111", "SNLEN3211", "SNCISCO2499",
    "SNEPS8811", "SNDAIK6743", "SAMS77531", "SNSOPH99120",
    "SNPROM7501", "SNDSO44211", "SNOLY78912", "SNFURN8901",
    "SNAPPLE8811", "SNBOSCH4421", "SNSPEC3499", "SNAPC9912",
    "SNUBIQ4412", "SNCHAIR921", "SNALM88219", "SNDELLSRVR1"
  ];
  const locations = [
    "CSE Block-A R201", "Seminar Hall Block-B", "ECE Room 102", "Server Room Block-A",
    "Seminar Hall Block-B", "Adm Office Area", "Lab 4 CSE", "Server Room Block-A",
    "Seminar Hall Block-B", "Lab 2 ECE", "Lab 6 Bioresearch", "Lab 4 CSE",
    "Placement Cell Office", "Maintenance Shop", "Lab 1 Chemistry", "Server Room Block-A",
    "Corridor Block-A", "CSE HOD Cabin", "Placement Cell Office", "Server Room Block-A"
  ];

  const seededAssets: Asset[] = [];
  for (let i = 0; i < 20; i++) {
    let aid = 1;
    while (db.assets.some(a => a.id === aid) || seededAssets.some(a => a.id === aid)) {
      aid++;
    }
    const cat = assetCategories[i];
    const shortCategory = cat.toUpperCase().substring(0, 3).replace(/\s/g, "");
    const assetTag = `VIIT-${shortCategory}-${String(aid).padStart(4, "0")}`;
    
    const assetObj: Asset = {
      id: aid,
      asset_tag: assetTag,
      name: assetNames[i],
      category: cat,
      status: i % 4 === 0 ? "allocated" : (i % 6 === 0 ? "maintenance" : "available"),
      purchase_date: new Date().toISOString().split("T")[0],
      cost: costs[i],
      serial_number: serialNumbers[i],
      location: locations[i],
      qr_code: `Dummy_QR_Asset_${aid}`,
      created_at: new Date().toISOString(),
      warranty_expiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      is_trial: true
    };
    seededAssets.push(assetObj);
  }
  db.assets.push(...seededAssets);
  
  writeDb(db);

  logSystemEvent(
    req.user!.id,
    req.user!.name,
    "TRIAL_DATA_SEEDED",
    "system",
    1,
    `System seeded 10 random personnel records and 20 equipment assets successfully for testing purposes.`
  );

  res.json({
    message: "Trial data seeded successfully!",
    usersCount: seededUsers.length,
    assetsCount: seededAssets.length
  });
});

// Purge 10 Random test users and 20 assets correctly without affecting legitimate listings
router.post("/dev/trial-purge", verifyToken, authorize(["super_admin", "web_developer"]), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  
  const initialUsersCount = db.users.length;
  const initialAssetsCount = db.assets.length;
  
  db.users = db.users.filter(u => !u.is_trial);
  db.assets = db.assets.filter(a => !a.is_trial);
  
  const deletedUsers = initialUsersCount - db.users.length;
  const deletedAssets = initialAssetsCount - db.assets.length;

  writeDb(db);

  logSystemEvent(
    req.user!.id,
    req.user!.name,
    "TRIAL_DATA_PURGED",
    "system",
    1,
    `Clean purge completed. Discarded ${deletedUsers} trial accounts and ${deletedAssets} trial assets securely.`
  );

  res.json({
    message: "Trial registers purged successfully!",
    usersPurged: deletedUsers,
    assetsPurged: deletedAssets
  });
});

// Clear all audit logs securely, authorized for super_admin, web_developer, and auditor
router.post("/audit-logs/clear", verifyToken, authorize(["super_admin", "web_developer", "auditor"]), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  
  const totalAssets = db.assets.length;
  const allocatedCount = db.assets.filter((a) => a.status === "allocated").length;
  const availableCount = db.assets.filter((a) => a.status === "available").length;
  const maintenanceCount = db.assets.filter((a) => a.status === "maintenance").length;

  db.utilization_reports = db.utilization_reports || [];
  
  const report = {
    id: db.utilization_reports.length > 0 ? Math.max(0, ...db.utilization_reports.map((r) => r.id || 0)) + 1 : 1,
    report_date: new Date().toISOString(),
    generated_by_id: req.user!.id,
    generated_by_name: req.user!.name,
    total_assets: totalAssets,
    allocated_assets: allocatedCount,
    available_assets: availableCount,
    maintenance_assets: maintenanceCount
  };

  db.utilization_reports.push(report);

  const oldAudits = [...db.audits];

  db.audits = [];
  writeDb(db);

  res.json({
    message: "Chronological audit archives cleared. A new utilization snapshot has been generated and persisted successfully.",
    oldAudits
  });
});

// Get Supabase connection status
router.get("/dev/supabase-status", verifyToken, authorize(["web_developer"]), (req: AuthenticatedRequest, res) => {
  res.json({
    connected: isSupabaseConnected()
  });
});

// GET Supabase client SDK config utility
router.get("/supabase-config", verifyToken, (req: AuthenticatedRequest, res) => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return res.status(404).json({ error: "Supabase configuration not found on server." });
  }
  res.json({ supabaseUrl: url, supabaseAnonKey: anonKey });
});

// Force complete synchronization of all local cache items into Supabase
router.post("/dev/supabase-force-push", verifyToken, authorize(["web_developer"]), async (req: AuthenticatedRequest, res) => {
  try {
    const stats = await forceSyncAllToSupabase();
    logSystemEvent(
      req.user!.id,
      req.user!.name,
      "SUPABASE_FORCE_SYNC_COMPLETED",
      "system",
      1,
      `Developer triggered immediate and complete force synchronization of local registers database into live Cloud Supabase collections successfully.`
    );
    res.json({
      message: "Direct force-synchronization to Cloud Supabase finished successfully.",
      ...stats
    });
  } catch (err: any) {
    console.error("[VIIT AMS] Failed to force sync Supabase collections:", err);
    res.status(500).json({
      error: err.message || "Failed to fully synchronize or write to Cloud Supabase database."
    });
  }
});

export default router;
