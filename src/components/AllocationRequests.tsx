import toast from "react-hot-toast";
import React, { useState } from "react";
import { RequisitionRequest, LoggedInUser } from "../types";
import { 
  FileCheck, 
  MapPin, 
  Calendar, 
  User, 
  Clock, 
  CheckCircle, 
  XCircle, 
  ChevronRight,
  Filter,
  X,
  FileText,
  Trash2
} from "lucide-react";

interface AllocationRequestsProps {
  requests: RequisitionRequest[];
  user: LoggedInUser;
  loading: boolean;
  onActionRequest: (id: number, status: "approved" | "rejected", comments: string) => Promise<void>;
  onDeleteRequest?: (id: number) => Promise<void>;
  onClearAllRequests?: () => Promise<void>;
}

export default function AllocationRequests({
  requests,
  user,
  loading,
  onActionRequest,
  onDeleteRequest,
  onClearAllRequests,
}: AllocationRequestsProps) {
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("all");
  const [activeActionReq, setActiveActionReq] = useState<RequisitionRequest | null>(null);
  const [actionComments, setActionComments] = useState("");
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <div className="w-12 h-12 border-4 border-vignanBlue border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-sm text-slate-500 font-medium">Synchronizing requisition dossiers stats...</p>
      </div>
    );
  }

  // Filter computations
  const filteredRequests = requests.filter((r) => {
    if (selectedStatusFilter === "all") return true;
    return r.status === selectedStatusFilter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            Approved
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-500" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            Pending Review
          </span>
        );
    }
  };

  const handleActionSubmit = async (status: "approved" | "rejected") => {
    if (!activeActionReq) return;

    try {
      setIsSubmittingAction(true);
      await onActionRequest(activeActionReq.id, status, actionComments.trim());
      setActiveActionReq(null);
      setActionComments("");
    } catch (err) {
      toast.error("Failed to record allocation decision.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-800">
      
      {/* Header and Filter Block */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-xl border border-slate-150">
        <div>
          <h2 className="text-xl font-bold font-display tracking-tight">Academic Asset Allocations</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {user.role === "employee" 
              ? "Track, manage, and verify your submitted physical inventory resource requisitions" 
              : "Authorize, analyze, and manage dynamic academic asset allocations dossiers"}
          </p>
        </div>

        {/* Filter & Clear Action controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-sm">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider mr-1">Status:</span>
            <select 
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="bg-transparent border-0 font-medium text-slate-700 focus:ring-0 text-xs py-0 pl-1 cursor-pointer"
            >
              <option value="all">Show All Requests</option>
              <option value="pending font-semibold">Pending Only</option>
              <option value="approved font-semibold">Approved All</option>
              <option value="rejected font-semibold">Rejected All</option>
            </select>
          </div>

          {onClearAllRequests && ["super_admin", "asset_manager", "web_developer"].includes(user.role) && requests.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Are you sure you want to permanently delete and clear all allocation requests from the active registers? This action is irreversible.")) {
                  onClearAllRequests();
                }
              }}
              className="flex items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              title="Purge all allocation request logs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Request Dossier table */}
      <div className="bg-white rounded-xl border border-slate-150 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                <th className="px-6 py-4">Requisition ID</th>
                <th className="px-6 py-4">Asset Code / Model</th>
                <th className="px-6 py-4">Submitted By</th>
                <th className="px-6 py-4">Requisition Rationale</th>
                <th className="px-6 py-4">Filing Date</th>
                <th className="px-6 py-4">Verification State</th>
                <th className="px-6 py-4 text-center">Decision Panel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400 font-medium">
                    No active requisition entries matching the filter selection in the ledger.
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* ID */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-mono font-bold text-slate-600 block bg-slate-100 px-2 py-0.5 rounded text-xs text-center w-14">
                        #{req.id}
                      </span>
                    </td>

                    {/* Asset details */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="font-semibold text-slate-800 leading-normal">{req.asset_name}</p>
                        <p className="text-xs font-semibold text-vignanBlue font-mono tracking-wide">{req.asset_tag}</p>
                      </div>
                    </td>

                    {/* Requester detail */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-50 text-vignanBlue flex items-center justify-center font-bold text-xs shrink-0 select-none">
                          {req.requester_name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-700 leading-tight">{req.requester_name}</p>
                          <p className="text-[10px] text-slate-400 block tracking-tight font-medium mt-0.5">{req.requester_dept}</p>
                        </div>
                      </div>
                    </td>

                    {/* Purpose */}
                    <td className="px-6 py-4">
                      <p className="text-xs text-slate-600 line-clamp-2 max-w-xs break-words font-medium py-1" title={req.purpose}>
                        "{req.purpose}"
                      </p>
                    </td>

                    {/* Request date */}
                    <td className="px-6 py-4 whitespace-nowrap text-slate-400 text-xs font-mono font-medium">
                      {new Date(req.request_date).toLocaleDateString()}
                    </td>

                    {/* Requisition Status badged */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(req.status)}
                    </td>

                    {/* Manager inline Actions panel */}
                    <td className="px-6 py-4 whitespace-nowrap text-center text-xs">
                      <div className="flex justify-center items-center gap-3">
                        {req.status === "pending" && (user.role === "super_admin" || user.role === "asset_manager" || user.role === "web_developer") ? (
                          <button 
                            onClick={() => setActiveActionReq(req)}
                            className="flex items-center gap-1 bg-vignanBlue hover:bg-vignanBlue-hover text-white px-3 py-1.5 rounded-lg font-semibold cursor-pointer shadow-sm"
                          >
                            <span>Approve / Deny</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        ) : req.status !== "pending" ? (
                          <div className="text-left bg-slate-50 p-2.5 rounded-lg border border-slate-100 max-w-xs space-y-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider leading-none">Decision Note</span>
                            <p className="text-[11px] text-slate-500 font-medium italic select-all leading-tight">
                              {req.comments ? `"${req.comments}"` : "(No description commented)"}
                            </p>
                            <span className="text-[9px] text-slate-400 block mt-1 font-mono">
                              Processed on {req.action_date ? new Date(req.action_date).toLocaleDateString() : ""}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Auth locked</span>
                        )}

                        {onDeleteRequest && ["super_admin", "asset_manager", "web_developer"].includes(user.role) && (
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to permanently delete allocation request #${req.id}?`)) {
                                onDeleteRequest(req.id);
                              }
                            }}
                            className="p-1 px-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded border border-rose-200 transition-colors cursor-pointer"
                            title="Delete allocation request record"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          </button>
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

      {/* DECISION MODAL FOR THE MANAGERS */}
      {activeActionReq && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-10 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-scale-in border border-slate-100">
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold font-display flex items-center gap-1.5">
                  <FileCheck className="w-5 h-5 text-vignanBlue" />
                  Evaluate Allocation dossier
                </h3>
                <p className="text-xs text-slate-400">Validate physical resource claim #{activeActionReq.id}</p>
              </div>
              <button onClick={() => setActiveActionReq(null)} className="text-white hover:text-red-300 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dossier info */}
            <div className="p-6 space-y-4">
              <div className="space-y-2 bg-slate-50 p-4 border border-slate-100 rounded-lg text-xs leading-relaxed">
                <p><strong>Proposed Asset:</strong> {activeActionReq.asset_name} ({activeActionReq.asset_tag})</p>
                <p><strong>Requested By:</strong> {activeActionReq.requester_name} ({activeActionReq.requester_dept})</p>
                <p className="border-t border-dashed border-slate-250 pt-2 text-slate-600 block font-medium">
                  <strong>Requisition Justification:</strong> "{activeActionReq.purpose}"
                </p>
              </div>

              {/* Comments block */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Decision Remarks / Notes (Feedback)</label>
                <textarea 
                  rows={3}
                  placeholder="Insert feedback remarks. E.g., Approved. Hand over during office hours / Denied due to high active CS lab schedules..."
                  value={actionComments}
                  onChange={(e) => setActionComments(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-vignanBlue leading-normal block"
                />
              </div>

              {/* Action operations buttons */}
              <div className="pt-4 flex flex-col sm:flex-row gap-3 border-t border-slate-150 justify-end">
                <button 
                  type="button"
                  onClick={() => setActiveActionReq(null)}
                  className="px-4 py-2 text-xs border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-lg font-medium order-last sm:order-first"
                >
                  Cancel Evaluation
                </button>
                <button 
                  type="button"
                  disabled={isSubmittingAction}
                  onClick={() => handleActionSubmit("rejected")}
                  className="px-4 py-2 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold transition cursor-pointer"
                >
                  Reject & Return Requisition
                </button>
                <button 
                  type="button"
                  disabled={isSubmittingAction}
                  onClick={() => handleActionSubmit("approved")}
                  className="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition cursor-pointer"
                >
                  Approve Requisition
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
