import React, { useState } from "react";
import api from "../api";
import { DashboardStatsResponse, LoggedInUser, RequisitionRequest, Asset, MaintenanceLog } from "../types";
import { 
  Laptop, 
  Wrench, 
  CheckCircle, 
  Trash2, 
  ShoppingBag, 
  FileText, 
  Database,
  IndianRupee, 
  History,
  Activity,
  ShieldCheck,
  Search,
  Download,
  Plus,
  QrCode,
  MapPin,
  Tag,
  AlertCircle,
  Clock,
  ArrowUpRight
} from "lucide-react";

interface DashboardOverviewProps {
  stats: DashboardStatsResponse | null;
  user: LoggedInUser;
  loading: boolean;
  requests?: RequisitionRequest[];
  assets?: Asset[];
  maintenanceLogs?: MaintenanceLog[];
  onActionRequest?: (id: number, status: "approved" | "rejected", comments: string) => Promise<void>;
  setActiveTab?: (tab: string) => void;
  onOpenReport?: (type: "issue" | "suggestion") => void;
  onClearAuditLogs?: () => Promise<void>;
}

export default function DashboardOverview({ 
  stats, 
  user, 
  loading,
  requests = [],
  assets = [],
  maintenanceLogs = [],
  onActionRequest,
  setActiveTab,
  onOpenReport,
  onClearAuditLogs
}: DashboardOverviewProps) {

  // Action Comments state for inline approval modal/panel
  const [activeActionReq, setActiveActionReq] = useState<RequisitionRequest | null>(null);
  const [actionComments, setActionComments] = useState("");
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Quick QR/Tag Lookup States
  const [lookupTag, setLookupTag] = useState("");
  const [lookupResult, setLookupResult] = useState<Asset | null>(null);
  const [lookupError, setLookupError] = useState("");

  // Audit clearing states
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearingLogs, setIsClearingLogs] = useState(false);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <div className="w-12 h-12 border-4 border-vignanBlue border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-sm text-slate-500 font-medium">Assembling executive telemetry metrics...</p>
      </div>
    );
  }

  const metrics = stats?.metrics || {
    totalAssets: 0,
    availableCount: 0,
    allocatedCount: 0,
    maintenanceCount: 0,
    disposedCount: 0,
    activeRequests: 0,
    totalRequestsCount: 0,
    activeRepairs: 0,
    totalAssetValuation: 0,
    totalMaintenanceCost: 0,
  };

  const recentAudits = stats?.recentAudits || [];
  const categoryDistribution = stats?.categoryDistribution || [];

  // Standard category display configurations with aesthetic icons & fallback mappings
  const displayCategories = categoryDistribution.slice(0, 4);

  // Availability Rate calculation
  const totalActives = metrics.totalAssets || 1;
  const inServiceRate = (((metrics.availableCount + metrics.allocatedCount) / totalActives) * 100);
  const availabilityRate = ((metrics.availableCount / totalActives) * 100);

  // Excel (.csv UTF-8) Downloader for Audit Log Trail
  const downloadAuditTrailExcel = () => {
    if (!recentAudits || recentAudits.length === 0) {
      alert("No active audit logs are available in the system.");
      return;
    }

    const headers = ["Audit ID", "Timestamp", "Action Type", "Entity Table", "Entity ID", "Operator Name", "Detailed Log Description"];
    const rows = recentAudits.map(log => {
      const escape = (val: any) => {
        const text = String(val ?? "").replace(/"/g, '""');
        return `"${text}"`;
      };
      return [
        escape(log.id),
        escape(new Date(log.performed_at).toLocaleString()),
        escape(log.action_type),
        escape(log.entity_table),
        escape(log.entity_id),
        escape(log.user_name || "System"),
        escape(log.details)
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `viit_ams_audit_trail_report_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Excel (.csv UTF-8) Downloader for Asset Utilization Report
  const downloadUtilizationReportExcel = async () => {
    if (!assets || assets.length === 0) {
      alert("No assets found in the inventory registers to build utilization report.");
      return;
    }

    try {
      await api.post("/dashboard/log-utilization-report");
    } catch (e) {
      console.error("Failed to log utilization report on backend.", e);
    }

    const headers = ["Asset Tag", "Asset Name", "Category", "Status Profile", "Claim/Allocation Count", "Acquisition Cost (INR)", "Repair Log Frequency", "Maintenance Total Costs (INR)", "Present Location", "Serial Identifier"];
    const rows = assets.map(asset => {
      const escape = (val: any) => {
        const text = String(val ?? "").replace(/"/g, '""');
        return `"${text}"`;
      };

      // Calculate allocation counts
      const allocRequests = requests.filter(r => r.asset_id === asset.id);
      const allocCount = allocRequests.length;

      // Calculate repairs metrics
      const repairs = maintenanceLogs.filter(log => log.asset_id === asset.id);
      const repairFreq = repairs.length;
      const totalRepairCost = repairs.reduce((acc, r) => acc + (r.cost || 0), 0);

      return [
        escape(asset.asset_tag),
        escape(asset.name),
        escape(asset.category),
        escape(asset.status.toUpperCase()),
        escape(allocCount),
        escape(asset.cost),
        escape(repairFreq),
        escape(totalRepairCost),
        escape(asset.location),
        escape(asset.serial_number)
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `viit_ams_asset_utilization_report_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Inline approval handler for swift dashboard actioning
  const handleQuickAction = async (status: "approved" | "rejected") => {
    if (!activeActionReq || !onActionRequest) return;
    try {
      setIsSubmittingAction(true);
      await onActionRequest(activeActionReq.id, status, actionComments.trim() || `Processed swiftly through Bento Dashboard Console`);
      setActiveActionReq(null);
      setActionComments("");
    } catch (err) {
      alert("Failed to register authorization response.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Interactive tag locator simulation
  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupTag.trim()) {
      setLookupError("Please specify a catalog identifier tag.");
      setLookupResult(null);
      return;
    }
    const query = lookupTag.trim().toUpperCase();
    const match = assets.find(a => 
      a.asset_tag.toUpperCase() === query || 
      a.serial_number.toUpperCase() === query || 
      a.name.toUpperCase().includes(query)
    );

    if (match) {
      setLookupResult(match);
      setLookupError("");
    } else {
      setLookupResult(null);
      setLookupError(`Identifier code "${query}" is not index cataloged.`);
    }
  };

  // Get first unresolved priority maintenance item
  const priorityMaint = maintenanceLogs.find(log => log.repair_status === "reported" || log.repair_status === "in_progress");

  // Outstanding/pending requisition requests (displayed on Bento Requests panel)
  const pendingRequests = requests.filter(r => r.status === "pending").slice(0, 4);

  return (
    <div className="space-y-6 animate-fade-in text-slate-800">
      
      {/* Visual Alignment Header Bar */}
      <header className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-extrabold text-vignanBlue font-display tracking-tight flex items-center gap-2">
            Asset Management Dashboard
          </h2>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Welcome back, <span className="text-slate-800 font-bold">{user.name}</span>. Here is a secure, real-time snapshot of the institute's inventory logs.
          </p>
        </div>
        
        {/* Header CTA Triggers */}
        <div className="flex flex-wrap gap-2.5 w-full md:w-auto">
          {/* Audit Logs Excel Downloader (Shows to web dev, admin, auditor, asset manager only) */}
          {(user.role === "super_admin" || user.role === "web_developer" || user.role === "auditor" || user.role === "asset_manager") && (
            <button 
              onClick={downloadAuditTrailExcel}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200 transition-colors cursor-pointer"
              title="Download Microsoft Excel audit log spreadsheet (.csv)"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Audit Trail (Excel)</span>
            </button>
          )}

          {/* Utilization reports Downloader (Shows to admin, web dev, asset manager only) */}
          {(user.role === "super_admin" || user.role === "web_developer" || user.role === "asset_manager") && (
            <button 
              onClick={downloadUtilizationReportExcel}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-bold rounded-xl border border-indigo-200 transition-colors cursor-pointer"
              title="Download Microsoft Excel utilization spreadsheet (.csv)"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600" />
              <span>Utilization Report (Excel)</span>
            </button>
          )}
          
          {(user.role === "super_admin" || user.role === "asset_manager" || user.role === "web_developer") && setActiveTab && (
            <button 
              onClick={() => setActiveTab("assets")}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-vignanBlue hover:bg-vignanBlue-hover text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span> Add New Asset</span>
            </button>
          )}
        </div>
      </header>

      {/* =======================================================
          BENTO GRID METRIC MATRIX (Main Grid Layout)
          ======================================================= */}
      <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 lg:grid-rows-6 gap-5 auto-rows-min min-h-[700px]">
        
        {/* BENTO CARD 1: Total Assets (row-span-2) */}
        <div className="lg:col-span-1 lg:row-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between h-full hover:border-vignanBlue transition-colors duration-300">
          <div>
            <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">Total Assets Managed</p>
            <p className="text-4xl font-black text-[#004A99] mt-2 tracking-tight font-display">
              {metrics.totalAssets}
            </p>
          </div>
          
          <div className="my-4">
            <div className="flex justify-between text-[10px] text-slate-500 font-bold mb-1">
              <span>ACTIVE STOCK</span>
              <span>{Math.round(inServiceRate)}% IN-SERVICE</span>
            </div>
            <div className="w-full bg-[#E6F0FF] h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-vignanBlue h-full rounded-full transition-all duration-500" 
                style={{ width: `${inServiceRate}%` }}
              ></div>
            </div>
          </div>
          
          <p className="text-[11px] text-slate-400 font-medium">
            Authorized registry compliance indices are up to date.
          </p>
        </div>

        {/* BENTO CARD 2: Total Registered Members (row-span-2) */}
        <div className="lg:col-span-1 lg:row-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between h-full hover:border-vignanBlue transition-colors duration-300">
          <div>
            <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">Total Registered Members</p>
            <p className="text-4xl font-black text-slate-800 mt-2 tracking-tight font-display">
              {metrics.totalUsers || 0}
            </p>
          </div>
          
          <div className="my-4">
            <p className="text-[11px] text-slate-400 leading-snug font-medium">
              Verified institutional personnel profiles, support crews and desk managers logged on systems.
            </p>
          </div>
          
          <p className="text-[11px] text-[#004A99] font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            Live Cell Members Active
          </p>
        </div>

        {/* BENTO CARD 3: Recent Requisitions / Allocations Dashboard (row-span-4, col-span-2) */}
        <div className="lg:col-span-2 lg:row-span-4 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between h-full hover:border-vignanBlue transition-colors duration-300">
          
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <h3 className="font-bold text-[#004A99] uppercase text-xs tracking-widest flex items-center gap-2">
                <FileText className="w-4 h-4 text-vignanBlue" />
                Recent Claim details
              </h3>
              <span className="text-[10px] bg-[#E6F0FF] text-[#004A99] px-2.5 py-1 rounded-md font-bold font-mono tracking-tight shrink-0">
                {pendingRequests.length} OUTSTANDING
              </span>
            </div>

            {/* Live Interactive pending array */}
            <div className="space-y-3">
              {pendingRequests.length === 0 ? (
                <div className="py-8 text-center bg-slate-50 rounded-xl border border-slate-100 p-4">
                  <Clock className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700">All requisitions processed</p>
                  <p className="text-[10px] text-slate-450 mt-1 max-w-xs mx-auto">There are currently no claimant allocation cards awaiting administrative authorization actions.</p>
                  {setActiveTab && (
                    <button 
                      onClick={() => setActiveTab("requests")} 
                      className="mt-3 text-[10px] text-vignanBlue font-bold hover:underline cursor-pointer"
                    >
                      View Allocations Ledger Logs_
                    </button>
                  )}
                </div>
              ) : (
                pendingRequests.map((req) => (
                  <div 
                    key={req.id} 
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-150/70 hover:bg-slate-100/50 transition-colors text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex flex-col items-center justify-center font-bold text-[#004A99] text-[10px] shadow-xs select-none shrink-0 font-mono">
                        REQ
                        <span className="text-[9px] text-slate-400 font-normal">#{req.id}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate">{req.asset_name}</p>
                        <p className="text-[10px] text-slate-450 truncate">
                          Dept: {req.requester_dept.substring(0, 15)} • Emp: {req.requester_name}
                        </p>
                      </div>
                    </div>

                    {/* Quick evaluation selector button */}
                    {(user.role === "super_admin" || user.role === "asset_manager" || user.role === "web_developer") && onActionRequest ? (
                      <button 
                        onClick={() => setActiveActionReq(req)}
                        className="px-3 py-1 bg-vignanBlue hover:bg-vignanBlue-hover text-white text-[10px] font-bold rounded-lg shadow-xs transition-colors cursor-pointer shrink-0 ml-2"
                      >
                        Action_
                      </button>
                    ) : (
                      <span className="text-[9px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold uppercase shrink-0">
                        Pending
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 mt-4 flex justify-between items-center text-[11px] text-slate-500">
            <span>Filing updates integrated directly</span>
            {setActiveTab && (
              <button 
                onClick={() => setActiveTab("requests")} 
                className="text-vignanBlue hover:underline font-bold cursor-pointer"
              >
                Open Allocation Desk →
              </button>
            )}
          </div>

        </div>

        {/* BENTO CARD 4: Under Repair Board (row-span-2) */}
        <div className="lg:col-span-1 lg:row-span-2 bg-[#004A99] rounded-2xl p-5 shadow-lg relative overflow-hidden text-white flex flex-col justify-between h-full">
          <div>
            <p className="text-white/60 text-[11px] font-bold uppercase tracking-wider">Under Maintenance Queue</p>
            <p className="text-4xl font-black text-white mt-2 tracking-tight font-display">
              {metrics.maintenanceCount}
            </p>
          </div>
          
          <div className="mt-4 py-2.5 px-3 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20 select-none z-10 text-xs">
            <p className="text-[10px] text-sky-200 uppercase font-black tracking-widest leading-none">Priority Ticket Log</p>
            <p className="text-white font-bold truncate mt-1">
              {priorityMaint 
                ? `[${priorityMaint.asset_tag}] - ${priorityMaint.asset_name}` 
                : "All Systems Stable"
              }
            </p>
            <p className="text-[10px] text-white/85 truncate italic mt-0.5">
              {priorityMaint ? `"${priorityMaint.issue_description}"` : "Zero hazardous hardware defects registered."}
            </p>
            <div className="mt-2 h-1 w-full bg-white/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-sky-300 rounded-full transition-all duration-300" 
                style={{ width: priorityMaint ? '45%' : '100%' }}
              ></div>
            </div>
          </div>

          {/* Decorative design circular vector backdrop */}
          <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white/5 rounded-full pointer-events-none"></div>
        </div>

        {/* BENTO CARD 5: Category Inventory Mix (row-span-2) */}
        <div className="lg:col-span-1 lg:row-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between h-full hover:border-vignanBlue transition-colors duration-300">
          <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest leading-none">Inventory Categorizations</h3>
          
          {displayCategories.length === 0 ? (
            <div className="py-4 text-center text-xs text-slate-400">Zero entries logged in database.</div>
          ) : (
            <div className="flex-1 flex flex-col justify-center gap-3.5 my-2">
              {displayCategories.map((item, idx) => {
                const pct = Math.round((item.value / totalActives) * 100) || 0;
                return (
                  <div key={idx} className="space-y-0.5">
                    <div className="flex justify-between text-[10px] font-bold text-slate-700 leading-none pb-0.5">
                      <span className="truncate max-w-28 text-slate-500 uppercase">{item.name}</span>
                      <span>{pct}% ({item.value})</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          idx === 0 ? 'bg-vignanBlue' : 
                          idx === 1 ? 'bg-indigo-500' :
                          idx === 2 ? 'bg-sky-400' : 'bg-slate-400'
                        }`}
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[10px] text-slate-450 leading-tight">Quantities are gathered live from ledger indices.</p>
        </div>

        {/* BENTO CARD 6: Financial Accounting & Portfolio Ledgers (row-span-2, col-span-2) */}
        <div className="lg:col-span-2 lg:row-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between h-full hover:border-vignanBlue transition-colors duration-300">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-[#004A99] uppercase text-xs tracking-widest leading-none">Institutional Valuation Logs</h3>
            <span className="text-[8px] tracking-widest uppercase font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded leading-none">Verified SLA</span>
          </div>

          <div className="flex-1 grid grid-cols-2 gap-4 my-2">
            
            {/* Box 1: Gross Capital */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 flex flex-col justify-between hover:bg-slate-100/50 transition-colors">
              <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Gross Capital valuation</p>
              <div className="mt-1">
                <span className="text-lg font-black text-slate-800 tracking-tight font-display flex items-center leading-none">
                  <IndianRupee className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {Math.round(metrics.totalAssetValuation).toLocaleString("en-IN")}
                </span>
                <span className="text-[9px] text-slate-400 font-medium block mt-0.5">Asset acquisitions (SDR tied)</span>
              </div>
            </div>

            {/* Box 2: Total Maintenance Outlays */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 flex flex-col justify-between hover:bg-slate-100/50 transition-colors">
              <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Resolution outlays logs</span>
              <div className="mt-1">
                <span className="text-lg font-black text-red-700 tracking-tight font-display flex items-center leading-none">
                  <IndianRupee className="w-3.5 h-3.5 text-red-300 shrink-0" />
                  {Math.round(metrics.totalMaintenanceCost).toLocaleString("en-IN")}
                </span>
                <span className="text-[9px] text-slate-450 font-medium block mt-0.5">Expensed structural repair costs</span>
              </div>
            </div>

          </div>

          <div className="text-[10px] text-slate-400 leading-none">Portfolios updated in accordance with Central Audit guidelines.</div>
        </div>

        {/* BENTO CARD 7: Dynamic Interactive Action Lookup Console (row-span-2, col-span-2) */}
        <div className="lg:col-span-2 lg:row-span-2 bg-[#E6F0FF] rounded-2xl border-2 border-dashed border-[#004A99]/20 p-5 flex flex-col sm:flex-row items-center gap-5 justify-between h-full shadow-xs">
          
          {/* Quick circular icon frame */}
          <div className="w-20 h-20 bg-vignanBlue rounded-2xl flex flex-col items-center justify-center text-[#E6F0FF] p-2.5 text-center text-[9px] font-black uppercase tracking-wider shadow-md select-none shrink-0 border border-white/20">
            <QrCode className="w-8 h-8 text-white mb-1 shrink-0 animate-pulse" />
            <span className="leading-none text-white/90">Asset lookup</span>
          </div>

          {/* Interactive Lookup Box controls */}
          <div className="flex-1 w-full text-xs">
            <p className="text-sm font-bold text-vignanBlue font-display">System Cell Quick Action Console</p>
            <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed">
              Verify any hardware barcode instant profile from the database rosters.
            </p>
            
            <form onSubmit={handleLookup} className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input 
                  type="text" 
                  placeholder="e.g. VIIT-LAP-0012, Epson..."
                  value={lookupTag}
                  onChange={(e) => setLookupTag(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl py-1.5 pl-8 pr-3 text-xs focus:ring-1 focus:ring-vignanBlue focus:outline-hidden font-mono tracking-wide"
                />
              </div>
              <button 
                type="submit"
                className="px-4 py-1.5 bg-[#004A99] hover:bg-vignanBlue-hover text-white text-[11px] font-bold rounded-xl uppercase transition-colors shrink-0 cursor-pointer"
              >
                Lookup_
              </button>
            </form>

            {/* Dynamic Interactive Popup feedback */}
            {lookupResult && (
              <div className="mt-2.5 bg-white border border-emerald-150 p-2.5 rounded-xl text-[10px] space-y-1 animate-slide-up shadow-sm">
                <div className="flex justify-between items-center bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded-md">
                  <span className="font-mono">{lookupResult.asset_tag}</span>
                  <span className="uppercase text-[8px]">{lookupResult.status}</span>
                </div>
                <div className="p-1 leading-normal">
                  <p className="font-bold text-slate-700">{lookupResult.name}</p>
                  <p className="text-slate-450">Location: {lookupResult.location} • S/N: {lookupResult.serial_number}</p>
                </div>
              </div>
            )}

            {lookupError && (
              <div className="mt-2.5 bg-rose-50 border border-rose-150 text-rose-700 p-2.5 rounded-xl text-[10px] flex items-center gap-1.5 animate-slide-up">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                <span className="font-semibold">{lookupError}</span>
              </div>
            )}
          </div>

        </div>

      </main>

      {/* =======================================================
          OUTER BOTTOM METRIC LOGS CARD REPRESENTATIONS
          ======================================================= */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
        
        {/* Dynamic Category Progress Visualizer */}
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-vignanBlue uppercase tracking-widest flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4" />
              Category Stock Distribution
            </h3>
            <p className="text-xs text-slate-400 mb-4">Quantity registers counted by device classifications</p>
          </div>

          {categoryDistribution.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-xs text-slate-450 italic">No inventory classifications detected.</div>
          ) : (
            <div className="space-y-3">
              {categoryDistribution.map((item, idx) => {
                const percentage = ((item.value / totalActives) * 100) || 0;
                return (
                  <div key={idx} className="space-y-1 text-xs">
                    <div className="flex justify-between font-bold">
                      <span className="text-slate-600 block truncate max-w-xs">{item.name}</span>
                      <span className="text-slate-450">{item.value} Assets ({percentage.toFixed(0)}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-vignanBlue h-full rounded-full transition-all duration-500" 
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chronological Audit Logs Timeline */}
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-1">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
              <History className="w-4 h-4 text-sky-600" />
              Security & Audit Ledger Logs
            </h3>
            
            {/* Clear Logs buttons based on access control (Web Dev, Admin, Auditor) */}
            {(user.role === "super_admin" || user.role === "web_developer" || user.role === "auditor") && (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold border border-rose-200 px-2 py-0.5 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                Clear Logs
              </button>
            )}

            {user.role === "auditor" && (
              <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded font-mono font-medium shrink-0">
                AUDITOR READ-ONLY
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mb-4">Chronological operational trails logged securely below</p>

          <div className="overflow-y-auto max-h-[220px] space-y-3 pr-1 text-xs">
            {recentAudits.length === 0 ? (
              <div className="py-12 text-center text-slate-400 font-mono italic">Zero administrative logs registered.</div>
            ) : (
              recentAudits.slice(0, 8).map((audit) => (
                <div key={audit.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex gap-3 leading-relaxed items-start">
                  <span className={`mt-0.5 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase shrink-0 font-mono tracking-tight ${
                    audit.action_type.includes("CREATE") ? "bg-emerald-100 text-emerald-800 border border-emerald-200" :
                    audit.action_type.includes("UPDATE") ? "bg-blue-100 text-blue-800 border border-blue-200" :
                    audit.action_type.includes("DELETE") ? "bg-rose-100 text-rose-800 border border-rose-200" : "bg-slate-200 text-slate-700 border border-slate-300"
                  }`}>
                    {audit.action_type.substring(0, 10)}
                  </span>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-slate-700 font-medium break-words leading-snug">{audit.details}</p>
                    <div className="flex justify-between items-center text-[9px] text-slate-400">
                      <span>Operator: <strong className="text-slate-600">{audit.user_name || "System"}</strong></span>
                      <span>{new Date(audit.performed_at).toLocaleTimeString()} ({new Date(audit.performed_at).toLocaleDateString()})</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </section>

      {/* =======================================================
          QUICK INLINE EVALUATION DECISION PANEL/MODAL
          ======================================================= */}
      {activeActionReq && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-scale-in border border-slate-100">
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold font-display flex items-center gap-1.5 text-white">
                  Evaluate Allocation request
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Validate physical resource claim #{activeActionReq.id}</p>
              </div>
              <button 
                onClick={() => {
                  setActiveActionReq(null);
                  setActionComments("");
                }} 
                className="text-slate-400 hover:text-white p-1 text-xs font-bold font-mono transition"
              >
                Close_
              </button>
            </div>

            {/* Content info */}
            <div className="p-6 space-y-4 text-xs leading-relaxed">
              <div className="space-y-1.5 bg-slate-50 p-4 border border-slate-150 rounded-xl text-slate-600">
                <p><strong>Device Proposed:</strong> {activeActionReq.asset_name} ({activeActionReq.asset_tag})</p>
                <p><strong>Proposed Claimant:</strong> {activeActionReq.requester_name} ({activeActionReq.requester_dept})</p>
                <p className="border-t border-dashed border-slate-200 pt-2 mt-2 text-slate-700 font-medium">
                  <strong>Requisition justification:</strong> "{activeActionReq.purpose}"
                </p>
              </div>

              {/* Remarks */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Administrative remarks / comments</label>
                <textarea 
                  rows={3}
                  placeholder="Insert feedback comments. E.g., Approved schedule clearance / Rejected due to maintenance requirements..."
                  value={actionComments}
                  onChange={(e) => setActionComments(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-1 focus:ring-vignanBlue focus:border-vignanBlue focus:outline-hidden leading-normal block"
                />
              </div>

              {/* Action operations buttons */}
              <div className="pt-4 flex flex-col sm:flex-row gap-2 border-t border-slate-100 justify-end">
                <button 
                  type="button"
                  onClick={() => {
                    setActiveActionReq(null);
                    setActionComments("");
                  }}
                  className="px-4 py-2 text-xs border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl font-semibold order-last sm:order-first transition cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  disabled={isSubmittingAction}
                  onClick={() => handleQuickAction("rejected")}
                  className="px-4 py-2 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold tracking-tight transition cursor-pointer"
                >
                  Reject claim
                </button>
                <button 
                  type="button"
                  disabled={isSubmittingAction}
                  onClick={() => handleQuickAction("approved")}
                  className="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold tracking-tight transition cursor-pointer"
                >
                  Approve claim
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clear Logs Double Confirmation Dialog Popup */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-scale-in border border-slate-100 p-6 space-y-4">
            <div className="text-center">
              <span className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6" />
              </span>
              <h3 className="text-base font-extrabold text-slate-850">Clear Audit Logs?</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Are you absolutely sure you want to permanently delete all action logs? This action is irreversible.
              </p>
            </div>
            
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 text-xs border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl font-semibold transition cursor-pointer"
              >
                No, Keep Logs
              </button>
              <button
                type="button"
                disabled={isClearingLogs}
                onClick={async () => {
                  if (onClearAuditLogs) {
                    try {
                      setIsClearingLogs(true);
                      await onClearAuditLogs();
                      setShowClearConfirm(false);
                    } catch (err) {
                      alert("Failed to clear logs.");
                    } finally {
                      setIsClearingLogs(false);
                    }
                  } else {
                    alert("Audit clearing interface not hooked successfully.");
                    setShowClearConfirm(false);
                  }
                }}
                className="flex-1 py-2 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition cursor-pointer"
              >
                {isClearingLogs ? "Purging..." : "Yes, Clear All"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

