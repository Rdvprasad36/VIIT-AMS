import React, { useState, useEffect, useMemo } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import api from "./api";
import toast, { Toaster } from "react-hot-toast";
import { 
  LoggedInUser, 
  Asset, 
  RequisitionRequest, 
  MaintenanceLog, 
  User, 
  DashboardStatsResponse,
  AssetStatus,
  RepairStatus
} from "./types";
import Navbar from "./components/Navbar";
import DashboardOverview from "./components/DashboardOverview";
import AssetList from "./components/AssetList";
import AllocationRequests from "./components/AllocationRequests";
import MaintenanceBoard from "./components/MaintenanceBoard";
import UserManagement from "./components/UserManagement";
import DeveloperDesk from "./components/DeveloperDesk";
import { 
  LayoutDashboard, 
  Database, 
  FileCheck, 
  Wrench, 
  Users, 
  Building,
  ShieldCheck,
  Key,
  DatabaseZap,
  Lock,
  ArrowRight,
  ShieldAlert,
  Eye,
  EyeOff,
  Award,
  X,
  Send,
  CheckCircle2
} from "lucide-react";

let supabaseClientInstance: SupabaseClient | null = null;

function getClientSupabase(config: { supabaseUrl: string; supabaseAnonKey: string }) {
  if (!supabaseClientInstance) {
    supabaseClientInstance = createClient(config.supabaseUrl, config.supabaseAnonKey);
  }
  return supabaseClientInstance;
}

export default function App() {
  // Authentication states
  const [user, setUser] = useState<LoggedInUser | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isLogginIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRoleData, setSelectedRoleData] = useState<any | null>(null);

  // Forgot Password States
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStep, setForgotStep] = useState<"request" | "verify">("request");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotStatus, setForgotStatus] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [receivedCodeMock, setReceivedCodeMock] = useState("");
  const [gmailConfigured, setGmailConfigured] = useState(false);
  const [emailSentSuccessfully, setEmailSentSuccessfully] = useState(false);

  // Active Tab State (RBAC checked)
  const [activeTab, setActiveTabState] = useState(() => {
    return localStorage.getItem("viit_ams_active_tab") || "dashboard";
  });

  const setActiveTab = (tab: string) => {
    localStorage.setItem("viit_ams_active_tab", tab);
    setActiveTabState(tab);
  };

  // Core Data Lists
  const [assets, setAssets] = useState<Asset[]>([]);
  const [requests, setRequests] = useState<RequisitionRequest[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);

  // Suggestions & Issues Ticketing State
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportType, setReportType] = useState<"issue" | "suggestion">("issue");
  const [reportMessage, setReportMessage] = useState("");
  const [isSubmitSuccess, setIsSubmitSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenReport = (type: "issue" | "suggestion") => {
    setReportType(type);
    setIsReportOpen(true);
  };

  const handleSendReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Please login to submit ticket.");
      return;
    }
    if (!reportMessage.trim()) return;

    try {
      setIsSubmitting(true);
      await api.post("/suggestions", {
        type: reportType,
        message: reportMessage.trim()
      });
      setIsSubmitSuccess(true);
      setReportMessage("");
      setTimeout(() => {
        setIsSubmitSuccess(false);
        setIsReportOpen(false);
      }, 2200);
    } catch (err) {
      toast.error("Failed to deliver your suggestion to the website team. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Layout Loading States
  const [isAssetsLoading, setIsAssetsLoading] = useState(false);
  const [isRequestsLoading, setIsRequestsLoading] = useState(false);
  const [isMaintenanceLoading, setIsMaintenanceLoading] = useState(false);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  // 1. Session verification on load
  useEffect(() => {
    const rawUser = localStorage.getItem("viit_ams_user");
    const token = localStorage.getItem("viit_ams_token");

    if (rawUser && token) {
      try {
        const parsed = JSON.parse(rawUser) as LoggedInUser;
        setUser(parsed);
      } catch (err) {
        handleLogout();
      }
    }

    // Attach response interceptor events for global logout catches
    const handleAuthLogoutEvent = () => {
      handleLogout();
    };
    window.addEventListener("auth_logout", handleAuthLogoutEvent);
    return () => {
      window.removeEventListener("auth_logout", handleAuthLogoutEvent);
    };
  }, []);

  // 2. Real-time Supabase Postgres changes listeners replacement
  useEffect(() => {
    if (!user) return;

    let cleanupChannel = () => {};

    const setupListeners = async () => {
      try {
        const res = await api.get("/supabase-config");
        const config = res.data;
        const supabase = getClientSupabase(config);

        setIsAssetsLoading(true);
        setIsUsersLoading(true);
        setIsRequestsLoading(true);

        const fetchAll = () => {
          fetchAssets();
          fetchRequests();
          if (user.role === "super_admin" || user.role === "web_developer") {
            fetchUsers();
          }
        };

        // Do initial fetch
        fetchAll();

        // Subscribing to public schema changes for the specified tables
        const channel = supabase.channel('schema-db-changes')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'assets' },
            (payload) => {
              console.log("[VIIT AMS] Real-time asset change:", payload);
              fetchAssets(); // re-fetch to keep it simple and perfectly sorted
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'users' },
            (payload) => {
              console.log("[VIIT AMS] Real-time user change:", payload);
              if (user.role === "super_admin" || user.role === "web_developer") fetchUsers();
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'requests' },
            (payload) => {
              console.log("[VIIT AMS] Real-time requests change:", payload);
              fetchRequests();
            }
          )
          .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
              console.log("[VIIT AMS] Successfully subscribed to Supabase Realtime channel.")
            } else if (status === 'CHANNEL_ERROR') {
              console.error("[VIIT AMS] Supabase channel error:", err);
            }
          });

        cleanupChannel = () => {
          supabase.removeChannel(channel);
        };

      } catch (err) {
        console.warn("[VIIT AMS] Standalone backup fallback or missing Config for live Supabase. Using manual pulls:", err);
        fetchAssets();
        fetchRequests();
        if (user.role === "super_admin" || user.role === "web_developer") {
          fetchUsers();
        }
      }
    };

    setupListeners();

    return () => {
      cleanupChannel();
    };
  }, [user]);

  // 2b. Pull manual statistics and repair states updates on mount & navigation shifts
  useEffect(() => {
    if (!user) return;

    if (activeTab === "dashboard") {
      fetchStats();
      fetchMaintenance();
    } else if (activeTab === "maintenance") {
      fetchMaintenance();
    }
  }, [activeTab, user]);

  // Dynamic computed requests combining referenced user and asset info real-time
  const detailedRequests = useMemo(() => {
    let filtered = requests;
    if (user && user.role === "employee") {
      filtered = requests.filter((r) => r.user_id === user.id);
    }
    return filtered.map((r) => {
      const asset = assets.find((a) => a.id === r.asset_id);
      const employee = users.find((u) => u.id === r.user_id);
      const processedBy = r.processed_by ? users.find((u) => u.id === r.processed_by) : undefined;
      
      return {
        ...r,
        asset_name: asset ? asset.name : r.asset_name || "Unknown Asset",
        asset_tag: asset ? asset.asset_tag : r.asset_tag || "N/A",
        user_name: employee ? employee.name : r.user_name || "Unknown User",
        user_email: employee ? employee.email : r.user_email || "N/A",
        processed_by_name: processedBy ? processedBy.name : r.processed_by_name
      };
    });
  }, [requests, assets, users, user]);

  // Global pullers
  const fetchStats = async () => {
    try {
      setIsStatsLoading(true);
      const res = await api.get<DashboardStatsResponse>("/dashboard/stats");
      setStats(res.data);
    } catch (err: any) {
      if (err.response?.status !== 401 && err.response?.status !== 403) {
        console.error("Failed to query dashboard overview stats.", err);
      }
    } finally {
      setIsStatsLoading(false);
    }
  };

  const fetchAssets = async () => {
    try {
      setIsAssetsLoading(true);
      const res = await api.get<Asset[]>("/assets");
      setAssets(res.data);
    } catch (err: any) {
      if (err.response?.status !== 401 && err.response?.status !== 403) {
        console.error("Failed to fetch physical asset directories.", err);
      }
    } finally {
      setIsAssetsLoading(false);
    }
  };

  const fetchRequests = async () => {
    try {
      setIsRequestsLoading(true);
      const res = await api.get<RequisitionRequest[]>("/requests");
      setRequests(res.data);
    } catch (err: any) {
      if (err.response?.status !== 401 && err.response?.status !== 403) {
        console.error("Failed to fetch requests histories.", err);
      }
    } finally {
      setIsRequestsLoading(false);
    }
  };

  const fetchMaintenance = async () => {
    try {
      setIsMaintenanceLoading(true);
      const res = await api.get<MaintenanceLog[]>("/maintenance");
      setMaintenanceLogs(res.data);
    } catch (err: any) {
      if (err.response?.status !== 401 && err.response?.status !== 403) {
        console.error("Failed to query repair logs.", err);
      }
    } finally {
      setIsMaintenanceLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setIsUsersLoading(true);
      const res = await api.get<User[]>("/users");
      setUsers(res.data);
    } catch (err: any) {
      if (err.response?.status !== 401 && err.response?.status !== 403) {
        console.error("Failed to list active users database.", err);
      }
    } finally {
      setIsUsersLoading(false);
    }
  };

  // 3. Authenticate Login Flow
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setAuthError("Email and password handle are required.");
      return;
    }

    try {
      setIsLoggingIn(true);
      setAuthError("");
      const res = await api.post<{ token: string; user: LoggedInUser }>("/auth/login", {
        email: loginEmail.trim(),
        password: loginPassword,
        expectedRole: selectedRoleData?.role,
      });

      const { token, user: loggedUser } = res.data;
      localStorage.setItem("viit_ams_token", token);
      localStorage.setItem("viit_ams_user", JSON.stringify(loggedUser));
      setUser(loggedUser);
      
      // Auto-route based on role
      setActiveTab("dashboard");
    } catch (err: any) {
      console.error(err);
      setAuthError(err.response?.data?.error || "Connection failure. Ensure server is online.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("viit_ams_token");
    localStorage.removeItem("viit_ams_user");
    setUser(null);
    setLoginEmail("");
    setLoginPassword("");
  };

  interface ForgotResponse {
    message: string;
    emailSentSuccessfully?: boolean;
    gmailConfigured?: boolean;
    dispatchError?: string;
    code?: string;
    email: string;
  }

  const handleRequestRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setForgotError("Institutional email is required.");
      return;
    }
    try {
      setForgotError("");
      setForgotStatus("");
      const res = await api.post<ForgotResponse>("/auth/forgot-password", {
        email: forgotEmail.trim()
      });
      
      const { code, gmailConfigured: isGmailConfig, emailSentSuccessfully: isSent, message } = res.data;
      
      setGmailConfigured(!!isGmailConfig);
      setEmailSentSuccessfully(!!isSent);
      setReceivedCodeMock(code || "");
      setForgotStep("verify");
      
      if (isSent) {
        setForgotStatus(`A secure verification code has been dispatched to your institutional inbox.`);
      } else if (isGmailConfig) {
        setForgotError("The system attempted to send a recovery email via Gmail SMTP, but the dispatch failed. Fallback simulation active.");
        setReceivedCodeMock(code || "");
      } else {
        setForgotStatus("Recovery verification code was successfully generated under local sandbox simulation.");
      }
    } catch (err: any) {
      setForgotError(err.response?.data?.error || "Institutional email not indexed or found.");
    }
  };

  const handleVerifyRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotCode.trim() || !forgotNewPassword.trim()) {
      setForgotError("Code and new key password are required.");
      return;
    }
    try {
      setForgotError("");
      setForgotStatus("");
      await api.post("/auth/reset-password", {
        email: forgotEmail.trim(),
        code: forgotCode.trim(),
        newPassword: forgotNewPassword.trim()
      });
      
      // Automatic session login after success
      setForgotStatus("Pass key updated! Logging in...");
      setTimeout(async () => {
        try {
          const res = await api.post<{ token: string; user: LoggedInUser }>("/auth/login", {
            email: forgotEmail.trim(),
            password: forgotNewPassword.trim(),
          });
          const { token, user: loggedUser } = res.data;
          localStorage.setItem("viit_ams_token", token);
          localStorage.setItem("viit_ams_user", JSON.stringify(loggedUser));
          setUser(loggedUser);
          setActiveTab("dashboard");
          
          // Clear states
          setShowForgotPassword(false);
          setForgotEmail("");
          setForgotCode("");
          setForgotNewPassword("");
          setForgotStep("request");
          setForgotStatus("");
        } catch (err) {
          setShowForgotPassword(false);
        }
      }, 1200);
    } catch (err: any) {
      setForgotError(err.response?.data?.error || "Invalid code validation token.");
    }
  };

  // 4. Operation Handlers cascading onto modules
  const handleCreateAsset = async (data: Partial<Asset>) => {
    await api.post("/assets", data);
    await fetchAssets();
  };

  const handleUpdateAssetStatus = async (id: number, status: AssetStatus) => {
    await api.put(`/assets/${id}`, { status });
    await fetchAssets();
  };

  const handleReturnAsset = async (id: number, purpose?: string) => {
    try {
      if (user?.role === "employee") {
        // Optimistic UI update for speed and instant visual feedback
        setAssets((prev) =>
          prev.map((asset) =>
            asset.id === id ? { ...asset, status: "return_pending" } : asset
          )
        );
        const res = await api.post(`/assets/${id}/request-return`, { purpose });
        toast.success("Return request sent successfully. Awaiting coordinator approval.");
        if (res.data?.asset) {
          setAssets((prev) =>
            prev.map((asset) =>
              asset.id === id ? res.data.asset : asset
            )
          );
        }
      } else {
        // Optimistic UI update for speed and instant visual feedback
        setAssets((prev) =>
          prev.map((asset) =>
            asset.id === id ? { ...asset, status: "available" } : asset
          )
        );
        setRequests((prev) =>
          prev.map((r) =>
            r.asset_id === id && r.status === "approved"
              ? { ...r, status: "rejected", comments: `Returned & Confirmed by ${user?.name || "Manager"}` }
              : r
          )
        );
        const res = await api.post(`/assets/${id}/return`);
        toast.success("Asset return confirmed and asset registered as available in inventory.");
        if (res.data?.asset) {
          setAssets((prev) =>
            prev.map((asset) =>
              asset.id === id ? res.data.asset : asset
            )
          );
        }
      }
      await Promise.all([fetchAssets(), fetchRequests(), fetchStats()]);
    } catch (err: any) {
      // Revert/refresh on error
      await Promise.all([fetchAssets(), fetchRequests(), fetchStats()]);
      toast.error("Return failed: " + (err.response?.data?.error || err.message));
    }
  };

  const handleDeleteRequest = async (id: number) => {
    try {
      await api.delete(`/requests/${id}`);
      await fetchRequests();
    } catch (err: any) {
      toast.error("Delete request failed: " + (err.response?.data?.error || err.message));
    }
  };

  const handleClearAllRequests = async () => {
    try {
      await api.post("/requests/clear-all");
      await fetchRequests();
    } catch (err: any) {
      toast.error("Clear all requests failed: " + (err.response?.data?.error || err.message));
    }
  };

  const handleDeleteAsset = async (id: number) => {
    try {
      const token = localStorage.getItem("viit_ams_token");
      await api.delete(`/assets/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Asset deleted successfully.");
      await fetchAssets();
    } catch (err: any) {
      toast.error("Asset deletion failed: " + (err.response?.data?.error || err.message));
    }
  };

  const handleCreateRequest = async (assetId: number, purpose: string) => {
    await api.post("/requests", { asset_id: assetId, purpose });
    await fetchRequests();
  };

  const handleActionRequest = async (id: number, status: "approved" | "rejected", comments: string) => {
    await api.put(`/requests/${id}/action`, { status, comments });
    await fetchRequests();
  };

  const handleReportMaintenance = async (assetId: number, issue: string, assignedTo?: number) => {
    try {
      await api.post("/maintenance", { asset_id: assetId, issue_description: issue, assigned_to: assignedTo });
      toast.success("Fault report ticket submitted successfully.");
      await fetchAssets();
    } catch (err: any) {
      toast.error("Failed to submit repair ticket: " + (err.response?.data?.error || err.message));
    }
  };

  const handleUpdateMaintenance = async (id: number, status: RepairStatus, cost: number, comments?: string, assignedTo?: number) => {
    await api.put(`/maintenance/${id}`, { repair_status: status, cost, comments, assigned_to: assignedTo });
    await fetchMaintenance();
  };

  const handleCreateUser = async (data: Partial<User> & { password_hash: string }) => {
    await api.post("/users", {
      name: data.name,
      email: data.email,
      password: data.password_hash, // Sent as access key
      role: data.role,
      department: data.department,
      employee_type: data.employee_type,
      phone: data.phone,
    });
    await fetchUsers();
  };

  const handleDeleteUser = async (id: number) => {
    try {
      const token = localStorage.getItem("viit_ams_token");
      await api.delete(`/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("User credentials revoked successfully.");
      await fetchUsers();
    } catch (err: any) {
      toast.error("Revoke failed: " + (err.response?.data?.error || err.message));
    }
  };

  const handleToggleDisableUser = async (id: number) => {
    try {
      await api.put(`/users/${id}/toggle-disabled`);
      await fetchUsers();
    } catch (err: any) {
      toast.error("Toggle status failed: " + (err.response?.data?.error || err.message));
    }
  };

  const handleClearAuditLogs = async () => {
    try {
      const resp = await api.post("/audit-logs/clear");
      const oldAudits = resp.data.oldAudits || [];

      if (oldAudits.length > 0) {
        const headers = ["Audit ID", "Timestamp", "Action Type", "Entity Table", "Entity ID", "Operator Name", "Detailed Log Description"];
        const rows = oldAudits.map((audit: any) => {
          const escape = (val: any) => {
            const text = String(val ?? "").replace(/"/g, '""');
            return `"${text}"`;
          };
          return [
            escape(audit.id),
            escape(audit.performed_at || audit.timestamp || new Date().toISOString()),
            escape(audit.action_type),
            escape(audit.entity_table || audit.entity_type || ""),
            escape(audit.entity_id),
            escape(audit.user_name || audit.performed_by_name || "System"),
            escape(audit.details || audit.description || "")
          ].join(",");
        });

        const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `viit_audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      toast.success("Chronological audit ledger logs cleared cleanly. Report downloaded.");
      await fetchStats();
    } catch (err: any) {
      toast.error("Failed to clear audit ledger: " + (err.response?.data?.error || err.message));
    }
  };

  // Tab definitions configuration block (Role permission filter matching)
  const tabConfig = [
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-5 h-5" />, visible: true },
    { id: "assets", label: "Asset Inventory", icon: <Database className="w-5 h-5" />, visible: true },
    { id: "requests", label: "Allocations Desk", icon: <FileCheck className="w-5 h-5" />, visible: true },
    { id: "maintenance", label: "Repairs Board", icon: <Wrench className="w-5 h-5" />, visible: true },
    { id: "users", label: "users details", icon: <Users className="w-5 h-5" />, visible: user?.role === "super_admin" || user?.role === "web_developer" },
    { id: "dev_desk", label: "Developer Desk", icon: <Building className="w-5 h-5" />, visible: user?.role === "web_developer" },
  ];

  return (
    <>
      <Toaster position="top-center" toastOptions={{ duration: 4000, style: { background: '#333', color: '#fff' } }} />
      <div className="flex flex-col min-h-screen font-sans bg-slate-50/50">
      {/* Dynamic Header navbar */}
      <Navbar 
        user={user} 
        onLogout={handleLogout} 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onOpenReport={handleOpenReport} 
        onUpdateProfile={(updatedUser) => {
          setUser(updatedUser);
          localStorage.setItem("viit_ams_user", JSON.stringify(updatedUser));
        }}
      />

      {user ? (
        // ==========================================
        // MAIN AUTHORIZED USER WORKSPACE LAYOUT
        // ==========================================
        <div className="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-6 lg:p-8 flex flex-col lg:flex-row gap-6">
          
          {/* Smart Responsive Sidebar Navigation */}
          <aside className="w-full lg:w-72 shrink-0 space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-150 shadow-xs space-y-4">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest font-mono">
                System Cell Navigation
              </span>
              
              <nav className="space-y-1">
                {tabConfig.filter(t => t.visible).map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
                        isActive 
                        ? "bg-vignanBlue text-white shadow shadow-blue-900 border border-thin border-blue-500" 
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="pt-4 border-t border-slate-100 space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest font-mono">
                  Active Connection info
                </span>
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-xs leading-relaxed space-y-1">
                  <p className="text-slate-500 font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-vignanBlue" />
                    <span>State Secure (SSL)</span>
                  </p>
                  <p className="text-slate-450 font-mono text-[10px] truncate">API Gateway: Active Tunnel</p>
                </div>
              </div>
            </div>
          </aside>

          {/* Core Content Box wrapper */}
          <main className="flex-1 min-w-0">
            {activeTab === "dashboard" && (
              <DashboardOverview 
                stats={stats} 
                user={user} 
                loading={isStatsLoading}
                requests={detailedRequests}
                assets={assets}
                maintenanceLogs={maintenanceLogs}
                onActionRequest={handleActionRequest}
                setActiveTab={setActiveTab}
                onOpenReport={handleOpenReport}
                onClearAuditLogs={handleClearAuditLogs}
              />
            )}
            
            {activeTab === "assets" && (
              <AssetList 
                assets={assets} 
                user={user} 
                loading={isAssetsLoading}
                onCreateAsset={handleCreateAsset}
                onUpdateAssetStatus={handleUpdateAssetStatus}
                onDeleteAsset={handleDeleteAsset}
                onSubmitRequest={handleCreateRequest}
                onSubmitMaintenance={handleReportMaintenance}
                onReturnAsset={handleReturnAsset}
                requests={detailedRequests}
              />
            )}
            
            {activeTab === "requests" && (
              <AllocationRequests 
                requests={detailedRequests} 
                user={user} 
                loading={isRequestsLoading}
                onActionRequest={handleActionRequest}
                onDeleteRequest={handleDeleteRequest}
                onClearAllRequests={handleClearAllRequests}
              />
            )}
            
            {activeTab === "maintenance" && (
              <MaintenanceBoard 
                logs={maintenanceLogs} 
                user={user} 
                loading={isMaintenanceLoading}
                onUpdateMaintenance={handleUpdateMaintenance}
              />
            )}

            {(activeTab === "users" && (user.role === "super_admin" || user.role === "web_developer")) && (
              <UserManagement 
                users={users} 
                loggedInUser={user} 
                loading={isUsersLoading}
                onCreateUser={handleCreateUser}
                onDeleteUser={handleDeleteUser}
                onToggleDisableUser={handleToggleDisableUser}
              />
            )}

            {activeTab === "dev_desk" && user.role === "web_developer" && (
              <DeveloperDesk user={user} />
            )}
          </main>

        </div>
      ) : (
        // ==========================================
        // GUEST AUTHENTICATION - LOGIN VIEW
        // ==========================================
        <div className="flex-1 flex flex-col justify-center items-center p-4 md:p-8 animate-fade-in relative overflow-hidden my-auto shrink-0 py-12">
          
          <div className="w-full max-w-5xl flex flex-col md:flex-row bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 relative z-10">
            
            {/* Branding Column Panel (Left section) */}
            <div className="w-full md:w-[45%] bg-gradient-to-b from-vignanBlue to-indigo-900 p-8 text-white flex flex-col justify-between relative">
              {/* Background accent shapes */}
              <div className="absolute top-0 right-0 w-44 h-44 bg-sky-500/10 rounded-full blur-2xl"></div>
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/15 rounded-full blur-2xl"></div>

              <div>
                <div className="mt-6 space-y-6">
                  <h3 className="text-2xl font-bold font-display tracking-tight leading-snug">
                    Vignan's Institute of Information Technology
                  </h3>
                  <p className="text-xs text-blue-100/90 leading-relaxed font-light">
                    The integrated Enterprise Asset Management Suite (AMS) consolidates full-lifecycle inventory cataloging, department claim authorizations, and repairs oversight diagnostics in alignment with college compliance standards.
                  </p>
                </div>
              </div>

              <div className="pt-8 border-t border-white/10 mt-8 space-y-1.5 text-xs text-blue-200">
                <p className="flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                  <span>Managed by VIIT's System Cell</span>
                </p>
                <p className="text-[10px] opacity-75 font-mono">Engine Release v1.0.0 (Relational-Linked)</p>
              </div>
            </div>

            {/* Login and Test Accounts Column (Right section) */}
            <div className="flex-1 p-8 md:p-12 space-y-6 overflow-y-auto max-h-[92vh]">
              
              {!selectedRoleData ? (
                // STEP 1: CHOOSE PORTAL ROLE
                <div className="space-y-6 animate-fade-in">
                  <div>
                    <h3 className="text-2xl font-black font-display text-slate-800 tracking-tight leading-none text-vignanBlue">VIIT Core Authorization Gates</h3>
                    <p className="text-xs text-slate-400 mt-1.5">Select a System Cell portal desk below to load institutional credentials card.</p>
                  </div>

                  {authError && (
                    <div className="p-4 bg-rose-50 border border-rose-150 rounded-xl flex items-start gap-2 text-xs text-rose-700">
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="font-semibold leading-normal">{authError}</span>
                    </div>
                  )}

                  <div className="space-y-4">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block font-mono">
                      Institutional Operation Desks (Choose one)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        {
                          role: "super_admin",
                          title: "Admin",
                          desc: "System credential administration, database overrides, and budget configuration indicators.",
                          color: "border-rose-150 bg-rose-50/10 hover:bg-rose-50/30 text-rose-900 shadow-xs",
                          icon: <ShieldAlert className="w-4 h-4 text-rose-600" />
                        },
                        {
                          role: "asset_manager",
                          title: "Asset Manager",
                          desc: "Asset tag catalogs, claim allocation check, and hardware status updates.",
                          color: "border-amber-150 bg-amber-50/10 hover:bg-amber-50/30 text-amber-900 shadow-xs",
                          icon: <Award className="w-4 h-4 text-amber-600" />
                        },
                        {
                          role: "employee",
                          title: "Employee",
                          desc: "Look up hardware tags, submit claim request forms, report Damaged assets.",
                          color: "border-indigo-150 bg-indigo-50/10 hover:bg-indigo-50/30 text-indigo-900 shadow-xs",
                          icon: <Users className="w-4 h-4 text-indigo-600" />
                        },
                        {
                          role: "auditor",
                          title: "Auditor",
                          desc: "IQAC compliance logs auditing, valuation reports, and system audits verification.",
                          color: "border-sky-150 bg-sky-50/10 hover:bg-sky-50/30 text-sky-900 shadow-xs",
                          icon: <FileCheck className="w-4 h-4 text-sky-600" />
                        },
                        {
                          role: "maintenance_team",
                          title: "Maintenance Team",
                          desc: "Trouble logs, update servicing status, register maintenance components cost.",
                          color: "border-emerald-150 bg-emerald-50/10 hover:bg-emerald-50/30 text-emerald-900 shadow-xs",
                          icon: <Wrench className="w-4 h-4 text-emerald-700" />
                        }
                      ].map((p) => (
                        <button
                          key={p.role}
                          type="button"
                          onClick={() => {
                            setSelectedRoleData(p);
                            setLoginEmail("");
                            setLoginPassword("");
                            setAuthError("");
                          }}
                          className={`text-left p-4 rounded-2xl border transition cursor-pointer flex flex-col justify-between h-24 hover:-translate-y-0.5 card-transition ${p.color}`}
                        >
                          <div className="flex justify-between items-start w-full">
                            <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                              {p.icon}
                              {p.title}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                          </div>
                          <p className="text-[10px] text-slate-500 mt-2 leading-tight flex-1 line-clamp-2">
                            {p.desc}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                // STEP 2: ACTIVE ROLE CARD & LOGIN FORM INSTEAD OF BUTTONS
                <div className="space-y-5 animate-scale-in text-left">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRoleData(null);
                        setLoginEmail("");
                        setLoginPassword("");
                        setAuthError("");
                      }}
                      className="text-xs font-bold text-slate-500 hover:text-vignanBlue flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition shrink-0 cursor-pointer"
                    >
                      <span>← Back</span>
                    </button>
                    <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-widest">
                      Authorized Gate
                    </span>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl flex items-start gap-3">
                    <div className="p-2.5 bg-white rounded-xl shadow-2xs border border-slate-100 shrink-0">
                      {selectedRoleData.icon}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 leading-tight">
                        {selectedRoleData.title}
                      </h4>
                      <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                        {selectedRoleData.desc}
                      </p>
                    </div>
                  </div>

                  {authError && (
                    <div className="p-4 bg-rose-50 border border-rose-150 rounded-xl flex items-start gap-2 text-xs text-rose-700 animate-fade-in">
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="font-semibold leading-normal">{authError}</span>
                    </div>
                  )}

                  {/* Native credentials override inputs */}
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">email</label>
                      <input 
                        type="email" 
                        required
                        placeholder="E.g., admin@vignaniit.edu.in"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-vignanBlue focus:border-transparent font-mono block text-slate-800 bg-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">password</label>
                      </div>
                      <div className="relative">
                        <input 
                          type={showPassword ? "text" : "password"} 
                          required
                          placeholder="••••••••••••"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          className="w-full pl-4 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-vignanBlue focus:border-transparent font-mono block text-slate-800 bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                          title={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4 animate-scale-in" /> : <Eye className="w-4 h-4 text-slate-400" />}
                        </button>
                      </div>
                    </div>

                    <button 
                      type="submit"
                      disabled={isLogginIn}
                      className="w-full bg-vignanBlue hover:bg-vignanBlue-hover text-white py-3 rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer mt-5"
                    >
                      <span>{isLogginIn ? "Logging in..." : "Login"}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL WEBPAGE SUPPORT / TICKETING MODAL */}
      {isReportOpen && (
        <div className="fixed inset-0 bg-slate-900/65 flex items-center justify-center p-4 z-55 backdrop-blur-xs animate-fade-in text-slate-800">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in border border-slate-100">
            {/* Header */}
            <div className="bg-vignanBlue text-white p-5 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold font-display">VIIT Web Development Support</h3>
                <p className="text-xs text-sky-200">Send logs, bug reports & suggestions to website team</p>
              </div>
              <button onClick={() => setIsReportOpen(false)} className="text-white hover:text-red-300 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            {isSubmitSuccess ? (
              <div className="p-8 text-center space-y-3 animate-scale-in">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-150">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-slate-800 text-sm">Dispatched Successfully</h4>
                <p className="text-xs text-slate-500">
                  Your ticket was registered. Web design engineers will implement corrective actions.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSendReport} className="p-6 space-y-4">
                {!user && (
                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-800 font-medium font-sans">
                    You must be signed in to submit tickets to the system support desk.
                  </div>
                )}
                {/* Type Selection */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase block tracking-wider">Submission Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      type="button"
                      onClick={() => setReportType("issue")}
                      className={`py-2 px-3 border rounded-xl text-xs font-bold transition cursor-pointer text-center ${
                        reportType === "issue" 
                        ? "bg-rose-50 border-rose-300 text-rose-700 font-extrabold" 
                        : "border-slate-200 hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                      Bug Report
                    </button>
                    <button 
                      type="button"
                      onClick={() => setReportType("suggestion")}
                      className={`py-2 px-3 border rounded-xl text-xs font-bold transition cursor-pointer text-center ${
                        reportType === "suggestion" 
                        ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-extrabold" 
                        : "border-slate-200 hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                      Suggestion
                    </button>
                  </div>
                </div>

                {/* Message input */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase block tracking-wider">Message Content *</label>
                  <textarea 
                    required
                    rows={4}
                    placeholder="Provide description of suggestions or bug behaviors spotted..."
                    value={reportMessage}
                    onChange={(e) => setReportMessage(e.target.value)}
                    className="w-full text-slate-800 px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-vignanBlue font-sans"
                  ></textarea>
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-slate-100 flex justify-end gap-2.5">
                  <button 
                    type="button"
                    onClick={() => setIsReportOpen(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-500 text-xs rounded-xl font-semibold hover:bg-slate-50 cursor-pointer"
                  >
                    Discard Ticket
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmitting || !reportMessage.trim()}
                    className="bg-vignanBlue hover:bg-[#003B7A] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? "Sending..." : "Submit Ticket"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
