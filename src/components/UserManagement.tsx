import React, { useState } from "react";
import { User, LoggedInUser, UserRole } from "../types";
import { 
  Users, 
  Plus, 
  Mail,
  UserPlus, 
  Lock, 
  Building, 
  ShieldCheck, 
  Calendar,
  X,
  PlusCircle,
  Trash2,
  Phone
} from "lucide-react";

interface UserManagementProps {
  users: User[];
  loggedInUser: LoggedInUser;
  loading: boolean;
  onCreateUser: (data: Partial<User> & { password_hash: string }) => Promise<void>;
  onDeleteUser?: (id: number) => Promise<void>;
  onToggleDisableUser?: (id: number) => Promise<void>;
}

export default function UserManagement({
  users,
  loggedInUser,
  loading,
  onCreateUser,
  onDeleteUser,
  onToggleDisableUser,
}: UserManagementProps) {
  const [isOpeningForm, setIsOpeningForm] = useState(false);
  const [userToConfirmDelete, setUserToConfirmDelete] = useState<number | null>(null);
  
  // Roster Filter state
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Reset pagination when roleFilter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [roleFilter]);
  
  // Create User state inputs
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("employee");
  const [department, setDepartment] = useState("Administration Office");
  const [employeeType, setEmployeeType] = useState("cse");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <div className="w-12 h-12 border-4 border-vignanBlue border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-sm text-slate-500 font-medium">Downloading System Cell authorization rosters...</p>
      </div>
    );
  }

  const filteredUsers = users.filter((u) => {
    // Hide old admin@viit.edu.in from everyone except web_developer
    const emailLower = String(u.email || "").toLowerCase();
    if (emailLower === "admin@viit.edu.in") {
      return loggedInUser.role === "web_developer";
    }
    if (roleFilter === "all") return true;
    return u.role === roleFilter;
  });

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage) || 1;
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getRoleLabel = (role: UserRole) => {
    if (role === "super_admin") return "Admin";
    return role.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  };

  const getRoleColorBadge = (role: UserRole) => {
    switch (role) {
      case "super_admin":
        return "bg-rose-50 text-rose-700 border border-rose-200";
      case "web_developer":
        return "bg-indigo-50 text-indigo-700 border border-indigo-200";
      case "asset_manager":
        return "bg-yellow-50 text-yellow-700 border border-yellow-200";
      case "maintenance_team":
        return "bg-emerald-50 text-emerald-700 border border-emerald-200";
      case "auditor":
        return "bg-sky-50 text-sky-700 border border-sky-300";
      default:
        return "bg-slate-100 text-slate-700 border border-slate-200";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password || !role || !department) {
      alert("All parameters are required to build a security credentials card.");
      return;
    }

    try {
      setIsSubmitting(true);
      await onCreateUser({
        name,
        email,
        password_hash: password, // Send raw as password_hash, controllers will hash it inside system before writing
        role,
        department,
        employee_type: employeeType,
        phone,
      });
      setIsOpeningForm(false);
      // Reset variables
      setName("");
      setEmail("");
      setPassword("");
      setPhone("");
      setRole("employee");
      setDepartment("Administration Office");
      setEmployeeType("cse");
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to generate security credential profile card.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-800">
      
      {/* Header and trigger */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-slate-150 shadow-xs">
        <div>
          <h2 className="text-xl font-bold font-display tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-vignanBlue" />
            Vignan System Cell Users Data
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Audit institutional authorizations, audit core roles, and generate accounts instantly across departments
          </p>
        </div>
        <button 
          onClick={() => setIsOpeningForm(true)}
          className="flex items-center gap-2 bg-vignanBlue hover:bg-vignanBlue-hover text-white px-4 py-2 rounded-lg text-sm font-semibold transition shadow-xs cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Provision New Account</span>
        </button>
      </div>

      {/* Roster lists representation */}
      <div className="bg-white rounded-xl border border-slate-150 overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-50 border-b border-slate-150 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">users data</span>
          
          <div className="flex items-center gap-3 self-stretch sm:self-auto justify-between sm:justify-end">
            {/* Filter select input */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="text-xs font-semibold bg-white border border-slate-250 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-vignanBlue text-slate-650 cursor-pointer shadow-2xs"
            >
              <option value="all">All Roles</option>
              <option value="super_admin">Admin</option>
              <option value="web_developer">Web Developer</option>
              <option value="asset_manager">Asset Manager</option>
              <option value="employee">Employee</option>
              <option value="auditor">Auditor</option>
              <option value="maintenance_team">Maintenance Team</option>
          
            </select>
            
            <span className="text-xs font-semibold text-slate-400 font-mono">Count: {filteredUsers.length} listed</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b border-slate-150 text-slate-400 font-bold text-xs uppercase tracking-wider">
                <th className="px-6 py-3.5">ID</th>
                <th className="px-6 py-3.5">Name</th>
                <th className="px-6 py-3.5">email</th>
                <th className="px-6 py-3.5">Phone Number</th>
                {loggedInUser.role === "web_developer" && (
                   <th className="px-6 py-3.5 text-indigo-600 font-bold">password</th>
                )}
                <th className="px-6 py-3.5">role</th>
                <th className="px-6 py-3.5">Employee Type</th>
                <th className="px-6 py-3.5">Assigned Department</th>
                <th className="px-6 py-3.5">Enrollment Date</th>
                <th className="px-6 py-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400 font-medium">
                    No active authorized personnel cataloged for this role filter.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((personnel) => (
                <tr key={personnel.id} className="hover:bg-slate-50/70 transition-colors">
                  {/* ID */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-mono text-xs text-slate-500 block">
                      #USR-{String(
                        personnel.id >= 7 && personnel.id <= 12
                          ? personnel.id - 6
                          : personnel.id
                      ).padStart(4, "0")}
                    </span>
                  </td>

                  {/* Name with initials */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-extrabold text-xs text-slate-700 shrink-0 uppercase select-none">
                        {personnel.name.split(" ").slice(-1)[0]?.charAt(0) || "U"}
                      </div>
                      <span className="font-semibold text-slate-800">{personnel.name}</span>
                    </div>
                  </td>

                  {/* Email */}
                  <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-slate-500 select-all">
                    {personnel.email}
                  </td>

                  {/* Phone Number */}
                  <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-slate-600">
                    {personnel.phone ? (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {personnel.phone}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-xs">—</span>
                    )}
                  </td>

                  {/* Password (Visible ONLY to Web Developers) */}
                  {loggedInUser.role === "web_developer" && (
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-indigo-700 font-bold select-all bg-indigo-50/20 px-4 rounded-lg">
                      {personnel.password_plain || "password123"}
                    </td>
                  )}

                  {/* badged role */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold tracking-tight uppercase ${getRoleColorBadge(personnel.role)}`}>
                      {getRoleLabel(personnel.role)}
                    </span>
                  </td>

                  {/* Employee Type */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    {personnel.employee_type ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold tracking-tight bg-sky-50 text-sky-700 border border-sky-100 uppercase">
                        {personnel.employee_type}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-xs">N/A</span>
                    )}
                  </td>

                  {/* Dept */}
                  <td className="px-6 py-4 whitespace-nowrap text-slate-500 font-semibold text-xs">
                    {personnel.department}
                  </td>

                  {/* Enrollment Date */}
                  <td className="px-6 py-4 whitespace-nowrap text-slate-400 font-mono text-xs">
                    {personnel.created_at ? new Date(personnel.created_at).toLocaleDateString() : "Historical"}
                  </td>

                   {/* Actions Trash */}
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {personnel.id !== loggedInUser.id && (
                      <div className="flex items-center justify-center gap-2">
                        {onDeleteUser && (
                          <>
                            {userToConfirmDelete === personnel.id ? (
                              <div className="flex items-center gap-1.5 animate-slide-up">
                                <button
                                  onClick={() => {
                                    onDeleteUser(personnel.id);
                                    setUserToConfirmDelete(null);
                                  }}
                                  className="text-[10px] font-bold bg-rose-600 hover:bg-rose-700 text-white px-2 py-0.5 rounded shadow-xs cursor-pointer"
                                  title="Confirm Revocation"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setUserToConfirmDelete(null)}
                                  className="text-[10px] font-bold bg-slate-150 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button 
                                onClick={() => {
                                  setUserToConfirmDelete(personnel.id);
                                }}
                                className="p-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded transition-colors cursor-pointer text-center flex items-center justify-center"
                                title="Delete User Credentials Card"
                              >
                                <Trash2 className="w-4 h-4 mx-auto" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="bg-slate-50 border-t border-slate-150 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-500 font-medium">
            Showing <span className="font-bold text-slate-800">{filteredUsers.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span> to{" "}
            <span className="font-bold text-slate-800">{Math.min(currentPage * itemsPerPage, filteredUsers.length)}</span> of{" "}
            <span className="font-bold text-slate-800">{filteredUsers.length}</span> personnel
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full">
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold hover:bg-white transition disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed bg-slate-100 text-slate-700"
              >
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => {
                // If there are too many pages, omit some with dots
                if (totalPages > 6 && Math.abs(pg - currentPage) > 1 && pg !== 1 && pg !== totalPages) {
                  if (pg === 2 || pg === totalPages - 1) {
                    return <span key={pg} className="px-1 text-slate-400 text-xs font-semibold">...</span>;
                  }
                  return null;
                }
                return (
                  <button
                    key={pg}
                    type="button"
                    onClick={() => setCurrentPage(pg)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      currentPage === pg
                        ? "bg-vignanBlue text-white border border-vignanBlue"
                        : "border border-slate-200 hover:bg-white text-slate-600 bg-slate-50"
                    }`}
                  >
                    {pg}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold hover:bg-white transition disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed bg-slate-100 text-slate-700"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {/* PROVISION NEW ACCOUNT MODAL */}
      {isOpeningForm && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-10 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-scale-in border border-slate-100">
            {/* Header */}
            <div className="bg-vignanBlue text-white p-5 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold font-display flex items-center gap-1.5">
                  <UserPlus className="w-5 h-5 text-cyan-200" />
                  Provision Security Credentials
                </h3>
                <p className="text-xs text-sky-200">Register administrative handles inside System Cell indices</p>
              </div>
              <button onClick={() => setIsOpeningForm(false)} className="text-white hover:text-red-300 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Full name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Full Name *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Dr. Satya Prasad, Principal"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-vignanBlue block"
                />
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">email *</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input 
                    type="email" 
                    required
                    placeholder="e.g. prasad@viit.edu.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-vignanBlue block font-mono"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">password *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input 
                    type="text" 
                    required
                    placeholder="Provide standard starting key code"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-vignanBlue block font-mono"
                  />
                </div>
              </div>

              {/* Phone Number */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Phone Number (Optional)</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input 
                    type="text" 
                    placeholder="e.g. +91 9440123445"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-vignanBlue block font-mono"
                  />
                </div>
              </div>

              {/* Role / Security Level */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Security Level *</label>
                <select 
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-vignanBlue bg-white cursor-pointer"
                >
                  <option value="employee">Employee</option>
                  <option value="asset_manager">Asset Manager</option>
                  <option value="maintenance_team">Maintenance Crew</option>
                  <option value="auditor">Auditor (Read-Only)</option>
                  <option value="super_admin">Admin</option>
                  <option value="web_developer">Web Developer</option>
                </select>
              </div>

              {/* Employee Type dropdown */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Employee Type *</label>
                <select
                  value={employeeType}
                  onChange={(e) => setEmployeeType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-vignanBlue bg-white cursor-pointer select-all uppercase font-semibold text-slate-700"
                >
                  <option value="cse">cse</option>
                  <option value="ACSE">ACSE</option>
                  <option value="AI&ds">AI&ds</option>
                  <option value="ece">ece</option>
                  <option value="eee">eee</option>
                  <option value="civil">civil</option>
                  <option value="mech">mech</option>
                  <option value="it">it</option>
                  <option value="ecm">ecm</option>
                  <option value="mba">mba</option>
                  <option value="mca">mca</option>
                  <option value="bs&h">bs&h</option>
                  <option value="other">other</option>
                </select>
              </div>

              {/* Submit triggers */}
              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => setIsOpeningForm(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-500 text-xs rounded-lg hover:bg-slate-50 font-medium"
                >
                  Discard Keycard
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-vignanBlue hover:bg-vignanBlue-hover text-white text-xs rounded-lg font-bold shadow-xs cursor-pointer"
                >
                  {isSubmitting ? "Generating Credentials..." : "Generate Security Card"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
