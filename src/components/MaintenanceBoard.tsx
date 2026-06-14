import React, { useState } from "react";
import { MaintenanceLog, LoggedInUser, RepairStatus } from "../types";
import { 
  Wrench, 
  MapPin, 
  User, 
  IndianRupee, 
  AlertTriangle, 
  CheckCircle,
  HelpCircle,
  Clock,
  Hammer,
  Settings,
  Filter,
  X,
  UserCheck
} from "lucide-react";

interface MaintenanceBoardProps {
  logs: MaintenanceLog[];
  user: LoggedInUser;
  loading: boolean;
  onUpdateMaintenance: (id: number, status: RepairStatus, cost: number, comments?: string) => Promise<void>;
}

export default function MaintenanceBoard({
  logs,
  user,
  loading,
  onUpdateMaintenance,
}: MaintenanceBoardProps) {
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("all");
  const [activeManageLog, setActiveManageLog] = useState<MaintenanceLog | null>(null);
  
  // Ticket Form parameters
  const [ticketStatus, setTicketStatus] = useState<RepairStatus>("reported");
  const [ticketCost, setTicketCost] = useState("");
  const [ticketComments, setTicketComments] = useState("");
  const [isUpdatingTicket, setIsUpdatingTicket] = useState(false);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <div className="w-12 h-12 border-4 border-vignanBlue border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-sm text-slate-500 font-medium">Downloading systemic maintenance logs and dispatch metrics...</p>
      </div>
    );
  }

  // Filter logs
  const filteredLogs = logs.filter((l) => {
    if (selectedStatusFilter === "all") return true;
    return l.repair_status === selectedStatusFilter;
  });

  const getRepairStatusBadge = (status: RepairStatus) => {
    switch (status) {
      case "resolved":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            Resolved
          </span>
        );
      case "unrepairable":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            Unrepairable / Disposed
          </span>
        );
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            Under Modification
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
            Reported
          </span>
        );
    }
  };

  // Pre-fill state when opening evaluational modal
  const handleOpenManager = (log: MaintenanceLog) => {
    setActiveManageLog(log);
    setTicketStatus(log.repair_status);
    setTicketCost(log.cost > 0 ? String(log.cost) : "");
    setTicketComments(log.issue_description || "");
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeManageLog) return;

    try {
      setIsUpdatingTicket(true);
      const costParsed = ticketCost ? parseFloat(ticketCost) : 0;
      await onUpdateMaintenance(activeManageLog.id, ticketStatus, costParsed, ticketComments.trim());
      setActiveManageLog(null);
    } catch (err) {
      alert("Failed to record maintenance resolution.");
    } finally {
      setIsUpdatingTicket(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-800">
      
      {/* Header and Filter Block */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-xl border border-slate-150">
        <div>
          <h2 className="text-xl font-bold font-display tracking-tight flex items-center gap-2">
            <Wrench className="w-5 h-5 text-vignanBlue" />
            System Cell Estate & Repairs Desk
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Authorize diagnostics, review structural outlays, and process component disposal actions across complex asset grids
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-sm">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider mr-1">Status:</span>
          <select 
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="bg-transparent border-0 font-medium text-slate-700 focus:ring-0 text-xs py-0 pl-1 cursor-pointer"
          >
            <option value="all">Display All Tickets</option>
            <option value="reported">Reported Only</option>
            <option value="in_progress">In Repair Only</option>
            <option value="resolved">Resolved Only</option>
            <option value="unrepairable">Unrepairable Only</option>
          </select>
        </div>
      </div>

      {/* Main Repair ticket list table */}
      <div className="bg-white rounded-xl border border-slate-150 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                <th className="px-6 py-4">Ticket Code</th>
                <th className="px-6 py-4">Faulty Component Specs</th>
                <th className="px-6 py-4">Filer / Reporter</th>
                <th className="px-6 py-4">Assigned Technician</th>
                <th className="px-6 py-4">Structural Failure Context</th>
                <th className="px-6 py-4">Repair State</th>
                <th className="px-6 py-4 text-right">Invoiced Cost</th>
                <th className="px-6 py-4 text-center">Diagnostics Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400 font-medium">
                    No active maintenance tickets matching these filter logs.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* ID */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-mono font-bold text-amber-700 text-xs px-2.5 py-1 bg-amber-50 border border-amber-100 rounded-md">
                        M-LOG-{String(log.id).padStart(4, "0")}
                      </span>
                    </td>

                    {/* Asset info */}
                    <td className="px-6 py-4 whitespace-nowrap font-semibold text-slate-850">
                      <div>
                        <p>{log.asset_name}</p>
                        <p className="text-xs text-vignanBlue font-mono">{log.asset_tag} | {log.asset_location}</p>
                      </div>
                    </td>

                    {/* Reporter info */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1 text-slate-600 font-medium">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>{log.reporter_name}</span>
                      </div>
                    </td>

                    {/* Tech assigned */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-slate-550 font-semibold">
                        <UserCheck className="w-4 h-4 text-slate-400" />
                        <span>{log.technician_name || "Unassigned"}</span>
                      </div>
                    </td>

                    {/* Failure description context */}
                    <td className="px-6 py-4">
                      <p className="text-xs text-slate-500 line-clamp-2 max-w-xs leading-normal" title={log.issue_description}>
                        "{log.issue_description}"
                      </p>
                    </td>

                    {/* Status badge */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getRepairStatusBadge(log.repair_status)}
                    </td>

                    {/* cost */}
                    <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-slate-800">
                      ₹{log.cost.toLocaleString("en-IN")}
                    </td>

                    {/* Operations */}
                    <td className="px-6 py-4 whitespace-nowrap text-center text-xs">
                      <div className="flex justify-center items-center">
                        {((log.repair_status !== "resolved" && log.repair_status !== "unrepairable") || 
                          ["super_admin", "asset_manager", "web_developer"].includes(user.role)) && 
                        (user.role === "maintenance_team" || user.role === "super_admin" || user.role === "asset_manager" || user.role === "web_developer") ? (
                          <button 
                            onClick={() => handleOpenManager(log)}
                            className="flex items-center gap-1 bg-amber-700 hover:bg-amber-800 text-white px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer shadow-xs"
                          >
                            <Hammer className="w-3.5 h-3.5" />
                            <span>{log.repair_status === "resolved" || log.repair_status === "unrepairable" ? "Edit Details" : "Manage Ticket"}</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic font-medium">Ticket closed</span>
                        )}
                      </div>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MANAGERIAL EVALUATION MODAL */}
      {activeManageLog && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-10 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-scale-in border border-slate-100">
            {/* Header */}
            <div className="bg-amber-700 text-white p-5 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold font-display flex items-center gap-1.5 animate-pulse">
                  <Settings className="w-5 h-5 text-amber-200" />
                  Dispatch Repair Ticket
                </h3>
                <p className="text-xs text-amber-100">Submit resolution logs and update component status</p>
              </div>
              <button onClick={() => setActiveManageLog(null)} className="text-white hover:text-red-300 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form body */}
            <form onSubmit={handleUpdateSubmit} className="p-6 space-y-4">
              <div className="bg-amber-50 p-4 border border-amber-100 rounded-lg text-xs leading-relaxed">
                <p><strong>Incriminated Component:</strong> {activeManageLog.asset_name} ({activeManageLog.asset_tag})</p>
                <p><strong>Placement:</strong> {activeManageLog.asset_location}</p>
                <p className="border-t border-dashed border-amber-250 pt-2 text-slate-650 font-medium">
                  <strong>Reporter Fault Context:</strong> "{activeManageLog.issue_description}"
                </p>
              </div>

              {/* Status input dropdown */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Transition Diagnostics status *</label>
                <select 
                  value={ticketStatus}
                  onChange={(e) => setTicketStatus(e.target.value as RepairStatus)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-600 bg-white cursor-pointer"
                >
                  <option value="reported">Left Reported / Claimed</option>
                  <option value="in_progress">Transfer to In-Repair Schedule</option>
                  <option value="resolved">Mark Successfully Resolved (Turn to Available)</option>
                  <option value="unrepairable">Deem Unrepairable (Scrap & Decommission Portfolio)</option>
                </select>
              </div>

              {/* Cost input field */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Calculated Repair Outlays (₹) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-semibold text-slate-400">₹</span>
                  <input 
                    type="number" 
                    placeholder="e.g. 1500"
                    value={ticketCost}
                    onChange={(e) => setTicketCost(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-600"
                  />
                </div>
              </div>

              {/* Technician comments */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Issue Description / Resolution Note</label>
                <textarea 
                  rows={3}
                  placeholder="E.g., Screen display flickering, chemistry spectrophotometer, or enter the resolution logs..."
                  value={ticketComments}
                  onChange={(e) => setTicketComments(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-600 block leading-normal"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 flex justify-end gap-3 border-t border-slate-150">
                <button 
                  type="button"
                  onClick={() => setActiveManageLog(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-500 text-xs rounded-lg hover:bg-slate-50"
                >
                  Close Dispatcher
                </button>
                <button 
                  type="submit"
                  disabled={isUpdatingTicket}
                  className="px-5 py-2 bg-amber-700 hover:bg-amber-800 text-white text-xs rounded-lg font-bold shadow-xs cursor-pointer"
                >
                  {isUpdatingTicket ? "Updating logs..." : "Apply Diagnostic Dispatch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
