import React, { useState, useEffect } from "react";
import { Asset, LoggedInUser, AssetStatus } from "../types";
import api from "../api";
import { 
  Laptop, 
  Search, 
  Plus, 
  MapPin, 
  CheckCircle2, 
  AlertTriangle, 
  Calendar, 
  IndianRupee, 
  Trash2, 
  Eye, 
  Send,
  Wrench,
  QrCode,
  Tag,
  X,
  FileCheck
} from "lucide-react";

interface AssetListProps {
  assets: Asset[];
  user: LoggedInUser;
  loading: boolean;
  onCreateAsset: (data: Partial<Asset>) => Promise<void>;
  onUpdateAssetStatus: (id: number, status: AssetStatus) => Promise<void>;
  onDeleteAsset: (id: number) => Promise<void>;
  onSubmitRequest: (assetId: number, purpose: string) => Promise<void>;
  onSubmitMaintenance: (assetId: number, issue: string, assignedTo?: number) => Promise<void>;
  onReturnAsset?: (id: number) => Promise<void>;
  requests?: any[];
}

export default function AssetList({
  assets,
  user,
  loading,
  onCreateAsset,
  onUpdateAssetStatus,
  onDeleteAsset,
  onSubmitRequest,
  onSubmitMaintenance,
  onReturnAsset,
  requests = [],
}: AssetListProps) {
  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Reset pagination when any filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, selectedStatus]);

  // Local interaction modally triggers
  const [isNewAssetModalOpen, setIsNewAssetModalOpen] = useState(false);
  const [activeRequestAsset, setActiveRequestAsset] = useState<Asset | null>(null);
  const [activeMaintenanceAsset, setActiveMaintenanceAsset] = useState<Asset | null>(null);
  const [selectedInspectAsset, setSelectedInspectAsset] = useState<Asset | null>(null);
  const [assetToConfirmDelete, setAssetToConfirmDelete] = useState<number | null>(null);

  // Requisition allocation Form inputs
  const [requestPurpose, setRequestPurpose] = useState("");
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  // Fault Form inputs
  const [maintenanceIssue, setMaintenanceIssue] = useState("");
  const [isSubmittingMaintenance, setIsSubmittingMaintenance] = useState(false);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string>("");

  useEffect(() => {
    if (activeMaintenanceAsset) {
      api.get("/technicians")
        .then((res) => {
          setTechnicians(res.data);
        })
        .catch((err) => {
          console.error("Failed to load technicians roster", err);
        });
    } else {
      setTechnicians([]);
      setSelectedTechnicianId("");
    }
  }, [activeMaintenanceAsset]);

  // New Asset input form
  const [newAssetForm, setNewAssetForm] = useState({
    name: "",
    category: "IT Hardware",
    purchase_date: new Date().toISOString().substring(0, 10),
    warranty_expiration: "",
    cost: "",
    serial_number: "",
    location: "",
  });
  const [isSubmittingNewAsset, setIsSubmittingNewAsset] = useState(false);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <div className="w-12 h-12 border-4 border-vignanBlue border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-sm text-slate-500 font-medium">Downloading inventory ledger catalog...</p>
      </div>
    );
  }

  // Categories lists derived from actual values
  const categoriesList = ["all", ...new Set(assets.map((a) => a.category))];

  // Filtering computational logic
  const filteredAssets = assets.filter((asset) => {
    const matchesSearch = 
      asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.asset_tag.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.serial_number.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === "all" || asset.category === selectedCategory;
    const matchesStatus = selectedStatus === "all" || asset.status === selectedStatus;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const totalPages = Math.ceil(filteredAssets.length / itemsPerPage) || 1;
  const paginatedAssets = filteredAssets.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Badge Status Styling Helper
  const getStatusBadge = (status: AssetStatus) => {
    switch (status) {
      case "available":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
            Available
          </span>
        );
      case "allocated":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
            Allocated
          </span>
        );
      case "maintenance":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-full animate-pulse">
            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
            In Repair
          </span>
        );
      case "disposed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 rounded-full">
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span>
            Disposed
          </span>
        );
      case "return_pending":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full animate-pulse">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse-slow"></span>
            Return Pending
          </span>
        );
      default:
        return null;
    }
  };

  // Submit Requisition Handlers
  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRequestAsset || !requestPurpose.trim()) return;

    try {
      setIsSubmittingRequest(true);
      await onSubmitRequest(activeRequestAsset.id, requestPurpose.trim());
      setActiveRequestAsset(null);
      setRequestPurpose("");
    } catch (err) {
      alert("Allocation failed to process. Try again.");
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  // Submit Engineering Failure Handler
  const handleMaintenanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMaintenanceAsset || !maintenanceIssue.trim()) return;

    try {
      setIsSubmittingMaintenance(true);
      await onSubmitMaintenance(
        activeMaintenanceAsset.id, 
        maintenanceIssue.trim(), 
        selectedTechnicianId ? parseInt(selectedTechnicianId) : undefined
      );
      setActiveMaintenanceAsset(null);
      setMaintenanceIssue("");
      setSelectedTechnicianId("");
    } catch (err) {
      alert("Fault filing failed. Try again.");
    } finally {
      setIsSubmittingMaintenance(false);
    }
  };

  // Create Asset Form Submit Handler
  const handleCreateAssetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssetForm.name || !newAssetForm.category || !newAssetForm.cost || !newAssetForm.location) {
      alert("All fields are required to register this asset.");
      return;
    }

    try {
      setIsSubmittingNewAsset(true);
      await onCreateAsset({
        ...newAssetForm,
        cost: parseFloat(newAssetForm.cost),
      });
      setIsNewAssetModalOpen(false);
      // Reset form variables
      setNewAssetForm({
        name: "",
        category: "IT Hardware",
        purchase_date: new Date().toISOString().substring(0, 10),
        warranty_expiration: "",
        cost: "",
        serial_number: "",
        location: "",
      });
    } catch (err) {
      alert("Failed to submit registered asset details.");
    } finally {
      setIsSubmittingNewAsset(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-800">
      {/* Page Header and Register Button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-slate-150">
        <div>
          <h2 className="text-xl font-bold font-display tracking-tight text-slate-800">VIIT Enterprise Asset Registers</h2>
          <p className="text-xs text-slate-400 mt-0.5">Maintain physical, technical, and laboratory resources logs across VIIT blocks</p>
        </div>
        {(user.role === "super_admin" || user.role === "asset_manager" || user.role === "web_developer") && (
          <button 
            onClick={() => setIsNewAssetModalOpen(true)}
            className="flex items-center gap-2 bg-vignanBlue hover:bg-vignanBlue-hover text-white px-4 py-2 rounded-lg text-sm font-semibold transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Register New Asset</span>
          </button>
        )}
      </div>

      {/* Database Filtering Criteria */}
      <div className="bg-white p-4 rounded-xl border border-slate-150 grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Search Input bar */}
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
          <input 
            type="text"
            placeholder="Search by name, tag, location or serial S/N..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-vignanBlue focus:border-transparent"
          />
        </div>

        {/* Category Selector dropdown */}
        <div className="relative">
          <select 
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-vignanBlue bg-white cursor-pointer"
          >
            <option value="all">All Categories</option>
            {categoriesList.filter(c => c !== "all").map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Status selection list */}
        <div className="relative">
          <select 
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-vignanBlue bg-white cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="available">Available Only</option>
            <option value="allocated">Allocated Only</option>
            <option value="maintenance">Under Repair</option>
            <option value="disposed">Disposed/Decommissioned</option>
          </select>
        </div>
      </div>

      {/* Main Inventory Tabular Grid */}
      <div className="bg-white rounded-xl border border-slate-150 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                <th className="px-6 py-4">Asset Tag / ID</th>
                <th className="px-6 py-4">Asset Specifications</th>
                <th className="px-6 py-4">Classification</th>
                <th className="px-6 py-4">Current Status</th>
                <th className="px-6 py-4">Placement / Block</th>
                <th className="px-6 py-4">Warranty Expiry</th>
                <th className="px-6 py-4 text-right">Acquisition Cost</th>
                <th className="px-6 py-4 text-center">Identity Tag</th>
                <th className="px-6 py-4 text-center">Interactive Operations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {paginatedAssets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400 font-medium">
                    No tracked assets matching these filter requirements in Vignan registers.
                  </td>
                </tr>
              ) : (
                paginatedAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Tag id */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-mono font-bold text-vignanBlue text-xs px-2.5 py-1 bg-blue-50 border border-blue-100 rounded-md">
                        {asset.asset_tag}
                      </span>
                    </td>
                    
                    {/* Name specs */}
                    <td className="px-6 py-4 select-all">
                      <div>
                        <p className="font-semibold text-slate-800 leading-tight">{asset.name}</p>
                        <p className="text-xs text-slate-400 font-mono mt-1">
                          S/N: {asset.serial_number || "N/A"}
                          {asset.warranty_expiration && (
                            <span className="ml-2 pl-2 border-l border-slate-200 text-indigo-600 font-semibold bg-indigo-50/50 px-1.5 py-0.5 rounded">
                              Warranty Exp: {new Date(asset.warranty_expiration).toLocaleDateString()}
                            </span>
                          )}
                        </p>
                      </div>
                    </td>

                    {/* Class */}
                    <td className="px-6 py-4 whitespace-nowrap text-slate-500 text-xs font-semibold">
                      {asset.category}
                    </td>

                    {/* Badged status */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(asset.status)}
                    </td>

                    {/* Location */}
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600 text-xs">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate max-w-[150px]">{asset.location}</span>
                      </div>
                    </td>

                    {/* Warranty Expiry */}
                    <td className="px-6 py-4 whitespace-nowrap text-xs">
                      {asset.warranty_expiration ? (
                        <div className="flex items-center gap-1.5 text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded w-fit font-semibold">
                          <span>{new Date(asset.warranty_expiration).toLocaleDateString()}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">No Warranty Set</span>
                      )}
                    </td>

                    {/* cost */}
                    <td className="px-6 py-4 whitespace-nowrap text-right font-semibold text-slate-800">
                      ₹{asset.cost.toLocaleString("en-IN")}
                    </td>

                    {/* QR Code label */}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button 
                        onClick={() => setSelectedInspectAsset(asset)}
                        className="text-slate-500 hover:text-vignanBlue mx-auto p-1.5 hover:bg-slate-100 rounded-md"
                        title="Display Printable Asset Tag & QR Label"
                      >
                        <QrCode className="w-4 h-4" />
                      </button>
                    </td>

                    {/* Actions button */}
                    <td className="px-6 py-4 whitespace-nowrap text-center text-xs">
                      <div className="flex justify-center items-center gap-2">
                        {/* Request for Employees */}
                        {user.role === "employee" && asset.status === "available" && (
                          <button 
                            onClick={() => setActiveRequestAsset(asset)}
                            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-md font-semibold cursor-pointer shadow-xs"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Request</span>
                          </button>
                        )}

                        {/* Return / Confirm Return Action */}
                        {(asset.status === "allocated" || asset.status === "return_pending") && onReturnAsset && (
                          (() => {
                            if (asset.status === "return_pending") {
                              // Only admins and asset managers can confirm pending returns
                              const isAuthorizedToConfirm = ["super_admin", "asset_manager", "web_developer"].includes(user.role);
                              if (isAuthorizedToConfirm) {
                                return (
                                  <button
                                    onClick={() => {
                                      if (confirm(`Confirm physical return and register ${asset.name} (#${asset.asset_tag}) as available in inventory?`)) {
                                        onReturnAsset(asset.id);
                                      }
                                    }}
                                    className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-md font-semibold cursor-pointer shadow-xs animate-pulse"
                                    title="Accept item back into central desk"
                                  >
                                    <FileCheck className="w-3.5 h-3.5" />
                                    <span>Accept Return</span>
                                  </button>
                                );
                              }
                              return null;
                            }

                            // If status is "allocated"
                            const isAuthorizedToReturn = 
                              ["super_admin", "asset_manager", "web_developer"].includes(user.role) ||
                              (user.role === "employee" && requests.some(
                                r => r.asset_id === asset.id && r.user_id === user.id && r.status === "approved"
                              ));
                            
                            if (isAuthorizedToReturn) {
                              return (
                                <button
                                  onClick={() => {
                                    const actionText = user.role === "employee" ? "request a return of" : "register a physical return of";
                                    if (confirm(`Are you sure you want to ${actionText} asset ${asset.name} (#${asset.asset_tag})?`)) {
                                      onReturnAsset(asset.id);
                                    }
                                  }}
                                  className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-md font-semibold cursor-pointer shadow-xs"
                                  title={user.role === "employee" ? "Send return request to inventory coordinators" : "Instantly confirm hand-back of asset"}
                                >
                                  <FileCheck className="w-3.5 h-3.5" />
                                  <span>{user.role === "employee" ? "Request Return" : "Return"}</span>
                                </button>
                              );
                            }
                            return null;
                          })()
                        )}

                        {/* File maintenance issue */}
                        {asset.status !== "disposed" && asset.status !== "maintenance" && (
                          <button 
                            onClick={() => setActiveMaintenanceAsset(asset)}
                            className="flex items-center gap-1 text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-md font-semibold cursor-pointer"
                            title="Report Fault / Maintain"
                          >
                            <Wrench className="w-3.5 h-3.5" />
                            <span>Fault</span>
                          </button>
                        )}

                        {/* Delete for system admins */}
                        {(user.role === "super_admin" || user.role === "web_developer") && (
                          <div className="flex items-center gap-1">
                            {assetToConfirmDelete === asset.id ? (
                              <div className="flex items-center gap-1 animate-slide-up bg-rose-50 p-1 rounded border border-rose-200">
                                <button
                                  onClick={() => {
                                    onDeleteAsset(asset.id);
                                    setAssetToConfirmDelete(null);
                                  }}
                                  className="text-[10px] font-bold bg-rose-600 hover:bg-rose-700 text-white px-1.5 py-0.5 rounded shadow-xs cursor-pointer"
                                  title="Confirm Delete"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setAssetToConfirmDelete(null)}
                                  className="text-[10px] font-medium bg-slate-150 hover:bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button 
                                onClick={() => {
                                  setAssetToConfirmDelete(asset.id);
                                }}
                                className="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded cursor-pointer"
                                title="Permanently Delete Stock from VIIT"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="bg-slate-50 border-t border-slate-150 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-500 font-medium">
            Showing <span className="font-bold text-slate-800">{filteredAssets.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span> to{" "}
            <span className="font-bold text-slate-800">{Math.min(currentPage * itemsPerPage, filteredAssets.length)}</span> of{" "}
            <span className="font-bold text-slate-800">{filteredAssets.length}</span> assets
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

      {/* ------------------------- MODAL INTERFACES ------------------------- */}

      {/* 1. REGISTRATION FORM MODAL */}
      {isNewAssetModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-55 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-scale-in border border-slate-100">
            {/* Header */}
            <div className="bg-vignanBlue text-white p-5 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold font-display">System Cell Registry Panel</h3>
                <p className="text-xs text-sky-200">Generate a unique institutional asset identification code</p>
              </div>
              <button onClick={() => setIsNewAssetModalOpen(false)} className="text-white hover:text-red-300 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateAssetSubmit} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Asset Name / Model *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Asus ProArt Core Ultra Studio Workstation"
                  value={newAssetForm.name}
                  onChange={(e) => setNewAssetForm({ ...newAssetForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-vignanBlue"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Storage Category *</label>
                  <select 
                    value={newAssetForm.category}
                    onChange={(e) => setNewAssetForm({ ...newAssetForm, category: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-vignanBlue bg-white cursor-pointer"
                  >
                    <option value="IT Hardware">IT Hardware</option>
                    <option value="Lab Equipment">Lab Equipment</option>
                    <option value="Audio Visual">Audio Visual</option>
                    <option value="Furniture">Furniture</option>
                    <option value="Office Stationery">Office Stationery</option>
                    <option value="Electric Infrastructure">Electric Infrastructure</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Purchase Cost (₹) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-semibold text-slate-400">₹</span>
                    <input 
                      type="number" 
                      required
                      min="1"
                      placeholder="e.g. 125000"
                      value={newAssetForm.cost}
                      onChange={(e) => setNewAssetForm({ ...newAssetForm, cost: e.target.value })}
                      className="w-full pl-7 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-vignanBlue"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Serial Code (S/N)</label>
                  <input 
                    type="text" 
                    placeholder="S/N: 98175-E3"
                    value={newAssetForm.serial_number}
                    onChange={(e) => setNewAssetForm({ ...newAssetForm, serial_number: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-vignanBlue"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Acquisition Date *</label>
                  <input 
                    type="date" 
                    required
                    value={newAssetForm.purchase_date}
                    onChange={(e) => setNewAssetForm({ ...newAssetForm, purchase_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-vignanBlue"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Warranty Expiry Date</label>
                  <input 
                    type="date" 
                    value={newAssetForm.warranty_expiration}
                    onChange={(e) => setNewAssetForm({ ...newAssetForm, warranty_expiration: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-vignanBlue"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Placement Location *</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Phase-2 Block, Cyber Lab-4"
                    value={newAssetForm.location}
                    onChange={(e) => setNewAssetForm({ ...newAssetForm, location: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-vignanBlue"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => setIsNewAssetModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-500 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmittingNewAsset}
                  className="px-5 py-2 bg-vignanBlue hover:bg-vignanBlue-hover text-white rounded-lg text-sm font-semibold transition"
                >
                  {isSubmittingNewAsset ? "Writing..." : "Write DB Block"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* 2. SUBMIT REQUEST MODAL (EMPLOYEE ONLY) */}
      {activeRequestAsset && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-10 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-scale-in border border-slate-100">
            <div className="bg-emerald-700 text-white p-5 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold font-display flex items-center gap-2">
                  <FileCheck className="w-5 h-5" />
                  Request Allocation Requisition
                </h3>
                <p className="text-xs text-emerald-100">Establish dynamic claim context for item</p>
              </div>
              <button onClick={() => setActiveRequestAsset(null)} className="text-white hover:text-emerald-200 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRequestSubmit} className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 border border-slate-100 rounded-lg">
                <span className="text-[10px] uppercase font-mono font-bold text-slate-400 block">Requester Asset Selected</span>
                <span className="text-sm font-bold text-slate-700">{activeRequestAsset.name}</span>
                <span className="text-xs font-bold text-vignanBlue block mt-1">Code: {activeRequestAsset.asset_tag}</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Allocation Justification Purpose *</label>
                <textarea 
                  required
                  rows={4}
                  placeholder="Detail exactly why this asset is required. E.g., for conducting PG Pharmacy chemistry studies, NBA Accreditation audit data compilation, CS student lab trainings..."
                  value={requestPurpose}
                  onChange={(e) => setRequestPurpose(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-600 block leading-relaxed"
                />
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-150">
                <button 
                  type="button"
                  onClick={() => setActiveRequestAsset(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-500 hover:bg-slate-50"
                >
                  Close
                </button>
                <button 
                  type="submit"
                  disabled={isSubmittingRequest}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-sm font-semibold transition"
                >
                  {isSubmittingRequest ? "Submitting..." : "Submit Requisition"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* 3. SUBMIT FAULT MODAL */}
      {activeMaintenanceAsset && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-10 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-scale-in border border-slate-100">
            <div className="bg-amber-700 text-white p-5 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold font-display flex items-center gap-2">
                  <Wrench className="w-5 h-5" />
                  Decom & Report Asset Failure
                </h3>
                <p className="text-xs text-amber-100">Initiate repair ticket flow on Estate Desk</p>
              </div>
              <button onClick={() => setActiveMaintenanceAsset(null)} className="text-white hover:text-amber-200 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleMaintenanceSubmit} className="p-6 space-y-4">
              <div className="bg-amber-50/50 p-4 border border-amber-100 rounded-lg">
                <span className="text-[10px] uppercase font-mono font-bold text-amber-500 block">Reported Component</span>
                <span className="text-sm font-bold text-slate-700 block">{activeMaintenanceAsset.name}</span>
                <span className="text-xs font-mono text-slate-500 block mt-0.5">ID: {activeMaintenanceAsset.asset_tag} | S/N: {activeMaintenanceAsset.serial_number}</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Description of Technical Failure *</label>
                <textarea 
                  required
                  rows={3}
                  placeholder="E.g., Screen display flickering, chemistry spectrophotometer sensor error code 0x4, laptop keyboard water damage, projector lens requires dust purge..."
                  value={maintenanceIssue}
                  onChange={(e) => setMaintenanceIssue(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-600 block leading-relaxed"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Assign Technician (Optional)</label>
                <select 
                  value={selectedTechnicianId}
                  onChange={(e) => setSelectedTechnicianId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-600 bg-white cursor-pointer"
                >
                  <option value="">-- Leave Unassigned / Blank --</option>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.name} ({tech.department || "Estate & Operations"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-150">
                <button 
                  type="button"
                  onClick={() => setActiveMaintenanceAsset(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-500 hover:bg-slate-50"
                >
                  Close
                </button>
                <button 
                  type="submit"
                  disabled={isSubmittingMaintenance}
                  className="px-5 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-sm font-semibold transition"
                >
                  {isSubmittingMaintenance ? "Dispatching..." : "Dispatch Repair Ticket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* 4. IDENTITY CODES / QR INSPECT MODAL */}
      {selectedInspectAsset && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-55 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-scale-in border border-slate-150">
            {/* Header */}
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
              <span className="text-xs font-bold font-mono tracking-widest text-slate-400 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-vignanBlue" />
                DIGITAL ASSET TAG
              </span>
              <button onClick={() => setSelectedInspectAsset(null)} className="text-white hover:text-red-300 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Simulated Label layout */}
            <div className="p-6 flex flex-col items-center text-center space-y-4">
              {/* Institution Seal heading */}
              <div className="border-b-2 border-slate-900 pb-2 w-full">
                <span className="text-[11px] font-extrabold uppercase text-slate-800 tracking-tighter">
                  VIGNAN'S INSTITUTE OF INFORMATION TECHNOLOGY
                </span>
                <span className="text-[9px] block uppercase font-mono tracking-widest font-bold text-slate-500 mt-0.5">
                  VIIT'S SYSTEM CELL • ASSET RECORDS
                </span>
              </div>

              {/* QR representation */}
              <div className="p-3 bg-white border-2 border-slate-950 rounded-lg flex items-center justify-center shadow-xs">
                {/* SVG representing a highly detailed, clean mock QR code */}
                <svg className="w-36 h-36 border border-slate-100" viewBox="0 0 100 100" fill="none" stroke="currentColor">
                  {/* Position detection squares */}
                  <rect x="5" y="5" width="25" height="25" strokeWidth="4" stroke="#004A99" />
                  <rect x="12" y="12" width="11" height="11" fill="#000" />
                  
                  <rect x="70" y="5" width="25" height="25" strokeWidth="4" stroke="#004A99" />
                  <rect x="77" y="12" width="11" height="11" fill="#000" />
                  
                  <rect x="5" y="70" width="25" height="25" strokeWidth="4" stroke="#004A99" />
                  <rect x="12" y="77" width="11" height="11" fill="#000" />

                  {/* Randomized structural barcode pixels for realism */}
                  <rect x="40" y="5" width="10" height="5" fill="#000" />
                  <rect x="55" y="5" width="5" height="10" fill="#000" />
                  <rect x="45" y="15" width="15" height="5" fill="#000" />
                  <rect x="35" y="25" width="10" height="10" fill="#000" />
                  <rect x="70" y="35" width="5" height="25" fill="#000" />
                  <rect x="85" y="35" width="10" height="5" fill="#000" />
                  <rect x="80" y="45" width="15" height="10" fill="#000" />
                  <rect x="35" y="45" width="15" height="5" fill="#000" />
                  <rect x="55" y="45" width="15" height="15" fill="#000" />
                  <rect x="5" y="45" width="10" height="5" fill="#000" />
                  <rect x="20" y="55" width="10" height="10" fill="#000" />
                  <rect x="35" y="60" width="15" height="10" fill="#000" />
                  <rect x="70" y="75" width="10" height="5" fill="#000" />
                  <rect x="85" y="70" width="5" height="25" fill="#000" />
                  <rect x="40" y="80" width="15" height="10" fill="#000" />
                </svg>
              </div>

              {/* Tag meta */}
              <div className="space-y-1 w-full text-left bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="text-center font-mono font-bold text-slate-800 text-lg leading-tight tracking-wider uppercase border-b border-dashed border-slate-300 pb-2 mb-2 select-all">
                  {selectedInspectAsset.asset_tag}
                </div>
                <p className="text-xs font-bold text-slate-700 truncate">{selectedInspectAsset.name}</p>
                <p className="text-[11px] text-slate-400 font-mono mt-1 flex justify-between">
                  <span>S/N: <strong>{selectedInspectAsset.serial_number || "N/A"}</strong></span>
                  <span>CAT: <strong>{selectedInspectAsset.category}</strong></span>
                </p>
                <p className="text-[11px] text-slate-400 font-mono flex justify-between">
                  <span>ROOM: <strong>{selectedInspectAsset.location}</strong></span>
                  <span>STOCK ID: <strong>#{selectedInspectAsset.id}</strong></span>
                </p>
                {selectedInspectAsset.warranty_expiration && (
                  <p className="text-[10px] text-indigo-700 font-mono bg-indigo-50/70 border border-indigo-100 rounded p-1 text-center font-bold mt-1.5">
                    WARRANTY EXPIRES: {new Date(selectedInspectAsset.warranty_expiration).toLocaleDateString()}
                  </p>
                )}
              </div>

              <div className="w-full text-xs text-slate-400 font-mono flex justify-center items-center gap-1 p-2 border-t border-slate-100 italic">
                <span>Printable adhesive thermal code label generated by VIIT AMS</span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
