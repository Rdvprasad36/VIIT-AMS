import React, { useState, useEffect } from "react";
import { Suggestion, LoggedInUser } from "../types";
import api from "../api";
import { 
  Building, 
  Trash2, 
  MessageSquare, 
  HelpCircle,
  Clock, 
  CheckCircle2, 
  User, 
  ShieldCheck, 
  AlertCircle
} from "lucide-react";

interface DeveloperDeskProps {
  user: LoggedInUser;
}

export default function DeveloperDesk({ user }: DeveloperDeskProps) {
  const [tickets, setTickets] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [ticketToConfirmSolve, setTicketToConfirmSolve] = useState<number | null>(null);

  const [firebaseConnected, setFirebaseConnected] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const checkFirebaseStatus = async () => {
    try {
      const res = await api.get<{ connected: boolean }>("/dev/firebase-status");
      setFirebaseConnected(res.data.connected);
    } catch (err) {
      console.warn("Failed to check dynamic Firebase status:", err);
      setFirebaseConnected(false);
    }
  };

  const handleForceSync = async () => {
    try {
      setSyncing(true);
      setSyncError(null);
      setSyncResult(null);
      const res = await api.post("/dev/firebase-force-push");
      setSyncResult(res.data);
      alert("Success! Local asset databases, active personnel profiles, logs, and claims synced live into Firebase cloud Firestore successfully!");
    } catch (err: any) {
      console.error(err);
      setSyncError(err.response?.data?.error || "Connection or write failure to Cloud Firestore instance.");
    } finally {
      setSyncing(false);
    }
  };

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await api.get<Suggestion[]>("/suggestions");
      setTickets(res.data);
    } catch (err) {
      console.error("Failed to query suggestions", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
    checkFirebaseStatus();
  }, []);

  const handleDeleteTicket = async (id: number) => {
    try {
      await api.delete(`/suggestions/${id}`);
      setTickets(prev => prev.filter(t => t.id !== id));
      setTicketToConfirmSolve(null);
    } catch (err) {
      alert("Failed to archive support ticket.");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-150 h-96">
        <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-xs font-semibold text-slate-500">Querying Website Development Tickets...</p>
      </div>
    );
  }

  const bugs = tickets.filter(t => t.type === "issue");
  const ideas = tickets.filter(t => t.type === "suggestion");

  return (
    <div className="space-y-6 animate-fade-in text-slate-800">
      
      {/* Header card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-150 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold font-display tracking-tight flex items-center gap-2 text-purple-900">
            <Building className="w-6 h-6 text-purple-600" />
            VIIT Systems: Website Developers Desk
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Exclusive support console of VIIT System Cell. Securely audit system feedbacks, clear bug queues and configure patches.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <span className="text-xs bg-rose-50 text-rose-700 font-bold border border-rose-150 px-2.5 py-1 rounded-lg">
            {bugs.length} Issues reported
          </span>
          <span className="text-xs bg-indigo-50 text-indigo-700 font-bold border border-indigo-150 px-2.5 py-1 rounded-lg">
            {ideas.length} Suggestions
          </span>
        </div>
      </div>

      {/* Main Ticket Deck */}
      <div className="bg-white rounded-2xl border border-slate-150 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-150 flex justify-between items-center">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block font-mono">
            Support Ticket Backlogging Registers
          </span>
          <span className="text-xs bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded border border-purple-150 font-mono">
            Active session: {user.name}
          </span>
        </div>

        {tickets.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center border border-emerald-150 mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-slate-800 text-sm">System Secure & Clean</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Zero pending bug report tickets inside the security catalog. All systems configured correctly.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tickets.map((t) => {
              const isBug = t.type === "issue";
              return (
                <div key={t.id} className="p-6 hover:bg-slate-50/50 transition flex flex-col md:flex-row gap-4 justify-between items-start">
                  
                  {/* Info details */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-extrabold tracking-tight uppercase font-mono ${
                        isBug 
                        ? "bg-rose-50 text-rose-700 border border-rose-200" 
                        : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                      }`}>
                        {isBug ? "Bug Report" : "Suggestion"}
                      </span>
                      <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(t.created_at).toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-400">#TKT-{String(t.id).padStart(4, "0")}</span>
                    </div>

                    <p className="text-sm font-semibold text-slate-800 pr-4 leading-relaxed whitespace-pre-wrap">
                      {t.message}
                    </p>

                    {/* Requester Profile */}
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>Reporter:</span>
                      <strong className="text-slate-700">{t.user_name}</strong>
                      <span className="text-slate-300">|</span>
                      <span className="font-mono text-slate-400 text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">
                        {t.user_email}
                      </span>
                      <span className="text-slate-300">|</span>
                      <span className="capitalize font-semibold text-vignanBlue text-[11px]">
                        {t.user_role.replace("_", " ")}
                      </span>
                    </div>
                  </div>

                  {/* Actions Solving Button */}
                  {ticketToConfirmSolve === t.id ? (
                    <div className="flex items-center gap-1.5 animate-slide-up bg-emerald-50 p-1.5 border border-emerald-200 rounded-xl shrink-0">
                      <button
                        onClick={() => handleDeleteTicket(t.id)}
                        className="text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setTicketToConfirmSolve(null)}
                        className="text-[11px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-800 px-2.5 py-1 rounded-lg cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setTicketToConfirmSolve(t.id)}
                      className="flex items-center gap-1 text-slate-500 hover:text-emerald-700 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer shrink-0 transition"
                      title="Solve & Close Ticket"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Mark as Resolved</span>
                    </button>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </div>


      {/* Firebase cloud sync utilities panel */}
      <div className="bg-white p-6 rounded-2xl border border-slate-150 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest block font-mono flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse inline-block"></span>
            Firebase Live Cloud Integration Desk
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Re-synchronize standalone memory backup or seed systems with Cloud Firestore. Force propagation of users, assets, audits, logs, and billing parameters.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Status Block */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Firebase Agent Link</span>
              <div className="flex items-center gap-1.5 mt-1">
                {firebaseConnected === null ? (
                  <span className="text-slate-400 text-xs font-semibold">Testing Link State...</span>
                ) : firebaseConnected ? (
                  <span className="text-emerald-700 font-bold text-xs flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                    Connected to Live Cloud (Enterprise Firestore)
                  </span>
                ) : (
                  <span className="text-amber-700 font-bold text-xs flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                    Running in Hybrid Offline Backup Mode
                  </span>
                )}
              </div>
            </div>
            
            <button
              onClick={checkFirebaseStatus}
              className="text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 cursor-pointer"
            >
              Check Link
            </button>
          </div>

          {/* Sync Trigger block */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">State Overwrite propagation</span>
              <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Re-push full local state tables directly to Firebase</p>
            </div>

            <button
              onClick={handleForceSync}
              disabled={syncing}
              className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-4 py-2 rounded-xl shadow-xs cursor-pointer flex items-center gap-1"
            >
              {syncing ? "Syncing..." : "Sync & Push Now"}
            </button>
          </div>
        </div>

        {syncError && (
          <div className="p-3 bg-rose-50 border border-rose-150 rounded-xl flex items-center gap-2 text-xs text-rose-700 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{syncError}</span>
          </div>
        )}

        {syncResult && (
          <div className="p-4 bg-emerald-50 border border-emerald-150 rounded-xl space-y-2 text-xs animate-fade-in animate-slide-up">
            <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Database synced completely to Cloud Firestore!</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 pt-2 text-[11px] text-emerald-700 font-mono">
              <div className="bg-white/60 p-1.5 rounded text-center border border-emerald-100">
                <strong>{syncResult.usersCount}</strong> Users
              </div>
              <div className="bg-white/60 p-1.5 rounded text-center border border-emerald-100">
                <strong>{syncResult.assetsCount}</strong> Assets
              </div>
              <div className="bg-white/60 p-1.5 rounded text-center border border-emerald-100">
                <strong>{syncResult.requestsCount}</strong> Claims
              </div>
              <div className="bg-white/60 p-1.5 rounded text-center border border-emerald-100">
                <strong>{syncResult.logsCount}</strong> Logs
              </div>
              <div className="bg-white/60 p-1.5 rounded text-center border border-emerald-100">
                <strong>{syncResult.auditsCount}</strong> Audits
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Developers System Rules Alert desk */}
      <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-purple-700 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <h4 className="font-bold text-purple-900 text-xs">Security System Verification (RBAC Overdrive Enabled)</h4>
          <p className="text-[11px] text-purple-800 leading-relaxed font-medium">
            As a certified Web Developer for VIIT System Cell, you have access to administrative overrides on asset cost computations, budget indicators, and user rosters. Please verify and handle all cascading constraints with utmost reliability.
          </p>
        </div>
      </div>

    </div>
  );
}
