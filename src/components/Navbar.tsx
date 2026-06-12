import React, { useState, useEffect, useRef } from "react";
import { LoggedInUser } from "../types";
import { 
  LogOut, 
  ShieldAlert, 
  Award, 
  UserCheck, 
  Settings, 
  Users, 
  MessageSquare,
  Bell,
  CheckCheck,
  AlertCircle,
  Info,
  Clock,
  Check,
  X,
  Lock
} from "lucide-react";
import api from "../api";

interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "danger";
  timestamp: string;
}

interface NavbarProps {
  user: LoggedInUser | null;
  onLogout: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenReport: (type: "issue" | "suggestion") => void;
  onUpdateProfile?: (updated: LoggedInUser) => void;
}

export default function Navbar({ user, onLogout, activeTab, setActiveTab, onOpenReport, onUpdateProfile }: NavbarProps) {
  const logoUrl = "https://www.pngitem.com/pimgs/m/340-3400877_vignan-logo-vignan-institute-of-pharmaceutical-technology-hd.png";
  
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);

  // Profile update and password change states
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState<"profile" | "password">("profile");
  const [profileName, setProfileName] = useState("");
  const [profileDept, setProfileDept] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [curPassword, setCurPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [modalError, setModalError] = useState("");
  const [modalSuccess, setModalSuccess] = useState("");
  const [isSavingUser, setIsSavingUser] = useState(false);

  useEffect(() => {
    if (user && isProfileModalOpen) {
      setProfileName(user.name);
      setProfileDept(user.department);
      setProfilePhone(user.phone || "");
      setCurPassword("");
      setNewPassword("");
      setModalError("");
      setModalSuccess("");
    }
  }, [user, isProfileModalOpen]);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const response = await api.get<{ notifications: AppNotification[]; readIds?: string[] }>("/notifications");
      if (response && response.data) {
        setNotifications(response.data.notifications || []);
        if (response.data.readIds) {
          setReadIds(response.data.readIds);
        }
      }
    } catch (err) {
      console.error("Failed to fetch dynamic notifications:", err);
      setNotifications([]);
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 20000); // 20-sec refresh rate
      return () => clearInterval(interval);
    }
  }, [user]);

  const markAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!readIds.includes(id)) {
      const updated = [...readIds, id];
      setReadIds(updated);
      try {
        await api.post("/notifications/read", { id });
      } catch (err) {
        console.error("Failed to sync read ID to database:", err);
      }
    }
  };

  const markAllAsRead = async () => {
    const list = Array.isArray(notifications) ? notifications : [];
    const allIds = list.map(n => n.id);
    const updated = Array.from(new Set([...readIds, ...allIds]));
    setReadIds(updated);
    try {
      await api.post("/notifications/clear", { ids: allIds });
    } catch (err) {
      console.error("Failed to sync all read IDs to database:", err);
    }
  };

  const clearAllHistory = () => {
    markAllAsRead();
    setShowNotifications(false);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) {
      setModalError("Name cannot be left blank.");
      return;
    }
    try {
      setIsSavingUser(true);
      setModalError("");
      setModalSuccess("");
      const res = await api.put("/users/profile", {
        name: profileName.trim(),
        department: profileDept.trim(),
        phone: profilePhone.trim()
      });
      setModalSuccess("Dynamic profile updated successfully!");
      if (onUpdateProfile) {
        onUpdateProfile(res.data.user);
      }
      setTimeout(() => {
        setIsProfileModalOpen(false);
      }, 1200);
    } catch (err: any) {
      setModalError(err.response?.data?.error || "Failed to update profile.");
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!curPassword.trim() || !newPassword.trim()) {
      setModalError("Please complete both current and new password fields.");
      return;
    }
    try {
      setIsSavingUser(true);
      setModalError("");
      setModalSuccess("");
      await api.put("/users/change-password", {
        currentPassword: curPassword,
        newPassword: newPassword
      });
      setModalSuccess("Access key credentials rotated successfully.");
      setCurPassword("");
      setNewPassword("");
      setTimeout(() => {
        setIsProfileModalOpen(false);
      }, 1200);
    } catch (err: any) {
      setModalError(err.response?.data?.error || "Failed to rotate credentials.");
    } finally {
      setIsSavingUser(false);
    }
  };

  const getRoleIcon = (role?: string) => {
    switch (role) {
      case "super_admin":
        return <ShieldAlert className="w-4 h-4 text-rose-500" />;
      case "web_developer":
        return <Settings className="w-4 h-4 text-purple-500" />;
      case "asset_manager":
        return <Award className="w-4 h-4 text-yellow-500" />;
      case "maintenance_team":
        return <Settings className="w-4 h-4 text-emerald-500" />;
      case "auditor":
        return <Users className="w-4 h-4 text-sky-500" />;
      default:
        return <UserCheck className="w-4 h-4 text-indigo-500" />;
    }
  };

  const getRoleBadgeLabel = (role?: string) => {
    if (!role) return "Guest";
    if (role === "web_developer") return "Senior Web Developer";
    if (role === "super_admin") return "Admin";
    return role.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  };

  const getRoleAlertHeader = (role?: string) => {
    switch (role) {
      case "super_admin":
        return "System Control & Hardware Oversight Alerts Log";
      case "asset_manager":
        return "Asset Expiration & Allocation Requests Check";
      case "maintenance_team":
        return "Assigned Trouble Tickets & Unassigned Repair Work";
      case "auditor":
        return "System Security & Compliance Valuation Logs";
      case "employee":
        return "My Allocation Approvals & Active Asset Status";
      default:
        return "Work Action Queue Desk";
    }
  };

  const unreadCount = Array.isArray(notifications) 
    ? notifications.filter(n => !readIds.includes(n.id)).length 
    : 0;

  return (
    <>
      <nav className="bg-vignanBlue text-white px-6 py-4 flex flex-col md:flex-row justify-between items-center shadow-md border-b border-blue-900 sticky top-0 z-50">
        {/* Brand Section */}
        <div className="flex items-center gap-4 mb-3 md:mb-0">
          {/* Vignan Logo Circular Frame - Zoomed and Elegant */}
          <div className="w-14 h-14 bg-white rounded-full overflow-hidden border-2 border-white flex items-center justify-center shadow-lg shrink-0 relative p-0.5 bg-white transition hover:scale-110 duration-300">
            <img 
              src={logoUrl} 
              alt="Vignan Logo" 
              className="w-12 h-12 object-contain rounded-full scale-125" 
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold font-display tracking-tight leading-none text-white">VIIT AMS</span>
              <span className="text-[10px] bg-sky-800 text-sky-200 px-1.5 py-0.5 rounded uppercase font-semibold">Enterprise</span>
            </div>
            <p className="text-[11px] uppercase tracking-widest font-mono text-cyan-200 mt-1">System Cell</p>
          </div>
        </div>

        {/* Dynamic Action Controls (Notifications dropdown, suggestions and profile) */}
        <div className="flex flex-wrap items-center gap-3 md:gap-4 w-full md:w-auto justify-center md:justify-end relative">
          
          {/* Unified web support ticketing system represented by a message symbol action */}
          <button 
            onClick={() => onOpenReport("issue")}
            className="p-2.5 bg-blue-950/50 hover:bg-blue-950/90 border border-blue-800 rounded-lg text-cyan-200 hover:text-white transition-all duration-200 hover:scale-105 cursor-pointer flex items-center justify-center shadow-sm"
            title="Website Developers Support Ticket Cell"
          >
            <MessageSquare className="w-5 h-5" />
          </button>

          {/* Dynamic Work Info Notification Bell & Dropdown */}
          {user && (
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  if (!showNotifications) {
                    fetchNotifications();
                  }
                }}
                className={`p-2.5 relative rounded-lg border cursor-pointer transition-all duration-250 flex items-center justify-center shadow-sm ${
                  showNotifications 
                    ? "bg-amber-600 border-amber-500 text-white scale-105" 
                    : "bg-blue-950/50 hover:bg-blue-950/90 border border-blue-800 text-cyan-200 hover:text-white"
                }`}
                title="Work Alerts Desk"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4.5 min-w-4.5 px-1 items-center justify-center rounded-full bg-rose-600 text-[10px] font-extrabold text-white border-2 border-vignanBlue ring-1 ring-rose-300">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Overlay Backdrop to Dismiss easily */}
              {showNotifications && (
                <div 
                  className="fixed inset-0 z-40 bg-transparent" 
                  onClick={() => setShowNotifications(false)}
                />
              )}

              {/* Notification Dropdown Container */}
              {showNotifications && (
                <div className="absolute right-0 mt-2.5 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 text-slate-800 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-3 duration-200">
                  {/* Dropdown Header */}
                  <div className="bg-gradient-to-r from-vignanBlue to-blue-900 text-white p-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <Bell className="w-4.5 h-4.5 text-amber-300" />
                        <h4 className="font-bold text-xs uppercase tracking-wider">Alerts</h4>
                      </div>
                      {unreadCount > 0 && (
                        <button 
                          onClick={markAllAsRead}
                          className="flex items-center gap-1 text-[10px] bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded font-bold uppercase tracking-tight cursor-pointer transition"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* List Container */}
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 bg-slate-50/50">
                    {!Array.isArray(notifications) || notifications.filter((n) => !readIds.includes(n.id)).length === 0 ? (
                      <div className="p-8 text-center flex flex-col items-center justify-center">
                        <CheckCheck className="w-10 h-10 text-emerald-400 mb-2.5 opacity-80" />
                        <p className="text-xs font-bold text-slate-700">No Pending Alerts</p>
                        <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] leading-relaxed">
                          Your role credentials are fully compliant! There are no outstanding alerts.
                        </p>
                      </div>
                    ) : (
                      (Array.isArray(notifications) ? notifications : [])
                        .filter((n) => !readIds.includes(n.id))
                        .map((n) => {
                          const isUnread = true;
                          
                          let sevBg = "bg-sky-50/50 border-sky-100 hover:bg-sky-50";
                          let sevText = "text-sky-700";
                          if (n.severity === "warning") {
                            sevBg = "bg-amber-50/50 border-amber-100 hover:bg-amber-50";
                            sevText = "text-amber-700";
                          } else if (n.severity === "danger") {
                            sevBg = "bg-rose-50/50 border-rose-100 hover:bg-rose-50";
                            sevText = "text-rose-700";
                          }

                          return (
                            <div
                              key={n.id}
                              className={`p-3.5 transition-all text-left relative flex gap-3 border-l-3 ${sevBg} border-l-indigo-600 bg-indigo-50/15`}
                            >
                              <div className="shrink-0 mt-0.5">
                                {n.severity === "danger" ? (
                                  <AlertCircle className="w-4 h-4 text-rose-500 animate-pulse" />
                                ) : (
                                  <Info className={`w-4 h-4 ${sevText}`} />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1 w-full">
                                  <span className="font-bold text-[11px] uppercase tracking-wide text-gray-850 block truncate">
                                    {n.title}
                                  </span>
                                {isUnread && (
                                  <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full shrink-0" title="Unread Alert" />
                                )}
                              </div>
                              <p className="text-[10.5px] text-slate-600 mt-1 leading-relaxed">
                                {n.message}
                              </p>
                              <div className="flex items-center gap-1.5 mt-2 text-[9px] text-slate-400 font-mono">
                                <Clock className="w-3 h-3" />
                                <span>{new Date(n.timestamp).toLocaleDateString()} at {new Date(n.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                              </div>
                            </div>
                            
                            {/* Clear ("into mark" cross icon) trigger */}
                            <button 
                              onClick={(e) => markAsRead(n.id, e)}
                              className="h-6 w-6 mt-0.5 rounded-full hover:bg-slate-200/60 flex items-center justify-center transition shrink-0 cursor-pointer text-slate-400 hover:text-rose-600 text-slate-450"
                              title="Clear Alert"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* User Section (Session-only) */}
          {user && (
            <div className="relative">
              {/* User Info chip - interactive button dropdown toggle */}
              <button 
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className="flex items-center gap-2.5 bg-blue-950/65 px-3 py-1.5 rounded-lg border border-blue-800 text-xs shadow-md cursor-pointer hover:bg-blue-900/80 transition text-left"
              >
                <div className="text-right hidden sm:block">
                  <p className="font-semibold text-white leading-tight">{user.name}</p>
                  <p className="text-[10px] text-slate-300 flex items-center justify-end gap-1 mt-0.5">
                    {getRoleIcon(user.role)}
                    <span className="truncate max-w-[125px] font-medium">{getRoleBadgeLabel(user.role)}</span>
                    <span className="text-blue-400 font-mono text-[9px]">({user.department})</span>
                  </p>
                </div>
                <div className="w-8 h-8 rounded-full bg-vignanBlue border border-sky-400 flex items-center justify-center font-bold text-xs text-cyan-200 shadow-sm uppercase font-mono shrink-0 transition hover:rotate-6">
                  {user.name.split(" ").slice(-1)[0]?.charAt(0) || user.name.charAt(0)}
                </div>
              </button>

              {/* Dropdown Overlay Backdrop */}
              {showUserDropdown && (
                <div 
                  className="fixed inset-0 z-40 bg-transparent" 
                  onClick={() => setShowUserDropdown(false)}
                />
              )}

              {/* User Actions Dropdown Menu */}
              {showUserDropdown && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-slate-105 z-50 text-slate-800 flex flex-col overflow-hidden py-1 divide-y divide-slate-100 font-sans text-xs">
                  <div className="px-3.5 py-2.5 bg-slate-50/50">
                    <p className="font-bold text-slate-800 truncate">{user.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                  </div>
                  
                  <button 
                    onClick={() => {
                      setActiveModalTab("profile");
                      setIsProfileModalOpen(true);
                      setShowUserDropdown(false);
                    }}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 text-slate-750 hover:text-vignanBlue font-semibold transition flex items-center gap-2 cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4 text-slate-400" />
                    <span>Profile Update</span>
                  </button>
                  
                  <button 
                    onClick={() => {
                      setActiveModalTab("password");
                      setIsProfileModalOpen(true);
                      setShowUserDropdown(false);
                    }}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 text-slate-755 hover:text-vignanBlue font-semibold transition flex items-center gap-2 cursor-pointer"
                  >
                    <Lock className="w-4 h-4 text-slate-400" />
                    <span>Change Password</span>
                  </button>
                  
                  <button 
                    onClick={() => {
                      onLogout();
                      setShowUserDropdown(false);
                    }}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-rose-50 text-rose-600 font-bold transition flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-rose-455" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* PROFILE UPDATE & PASS KEY ROTATION CONSOLE DIALOG MODAL */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 bg-slate-900/65 flex items-center justify-center p-4 z-55 backdrop-blur-xs text-slate-800">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in border border-slate-100">
            {/* Header */}
            <div className="bg-vignanBlue text-white p-5 flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold font-display">Manage Profile Security</h3>
                <p className="text-[11px] text-sky-200">Refine credentials and departmental markers</p>
              </div>
              <button 
                onClick={() => setIsProfileModalOpen(false)} 
                className="text-white hover:text-red-300 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selector Tab headers */}
            <div className="flex border-b border-slate-100 bg-slate-50/50 p-1">
              <button
                onClick={() => {
                  setActiveModalTab("profile");
                  setModalError("");
                  setModalSuccess("");
                }}
                className={`flex-1 py-2 text-xs font-bold text-center rounded-xl transition cursor-pointer ${
                  activeModalTab === "profile" 
                    ? "bg-white text-vignanBlue shadow-2xs font-black border border-slate-200" 
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Profile Update
              </button>
              <button
                onClick={() => {
                  setActiveModalTab("password");
                  setModalError("");
                  setModalSuccess("");
                }}
                className={`flex-1 py-2 text-xs font-bold text-center rounded-xl transition cursor-pointer ${
                  activeModalTab === "password" 
                    ? "bg-white text-vignanBlue shadow-2xs font-black border border-slate-200" 
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Change Password
              </button>
            </div>

            {/* Modal Form inputs */}
            <div className="p-6">
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-150 text-rose-700 rounded-xl text-xs font-medium mb-4 animate-fade-in text-left">
                  {modalError}
                </div>
              )}
              {modalSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-150 text-emerald-800 rounded-xl text-xs font-medium mb-4 animate-fade-in text-left">
                  {modalSuccess}
                </div>
              )}

              {activeModalTab === "profile" ? (
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="space-y-1 text-left">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Login Handle Email (Read-Only)</label>
                    <input 
                      type="text" 
                      disabled
                      value={user?.email || ""}
                      className="w-full px-3.5 py-2 border border-slate-200 bg-slate-50 text-slate-400 rounded-xl text-xs font-mono block cursor-not-allowed"
                    />
                  </div>

                  <div className="space-y-1 text-left">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Full Legal Name</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Enter legal name"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs block text-slate-800 bg-white"
                    />
                  </div>

                  <div className="space-y-1 text-left">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Institutional Department</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Enter Department"
                      value={profileDept}
                      onChange={(e) => setProfileDept(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs block text-slate-800 bg-white"
                    />
                  </div>

                  <div className="space-y-1 text-left">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Phone Number (Optional)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. +91 9999999999"
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs block text-slate-800 bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingUser}
                    className="w-full bg-[#004A99] hover:bg-vignanBlue-hover text-white py-2.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>{isSavingUser ? "Saving..." : "Save Profile Details"}</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="space-y-1 text-left">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Current Access Key Password</label>
                    <input 
                      type="password" 
                      required
                      placeholder="••••••••••••"
                      value={curPassword}
                      onChange={(e) => setCurPassword(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs block text-slate-800 bg-white"
                    />
                  </div>

                  <div className="space-y-1 text-left">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">New Access Key Password</label>
                    <input 
                      type="password" 
                      required
                      placeholder="••••••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs block text-slate-800 bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingUser}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>{isSavingUser ? "Saving password..." : "Rotate Credentials Password"}</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

