export type UserRole = "super_admin" | "asset_manager" | "employee" | "auditor" | "maintenance_team" | "web_developer";
export type AssetStatus = "available" | "allocated" | "maintenance" | "disposed" | "return_pending";
export type RequestStatus = "pending" | "approved" | "rejected";
export type RepairStatus = "reported" | "in_progress" | "resolved" | "unrepairable";

export interface LoggedInUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  employee_type?: string;
  read_notifications?: string[];
  is_disabled?: boolean;
  phone?: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  created_at: string;
  password_plain?: string;
  employee_type?: string;
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

export interface RequisitionRequest {
  id: number;
  asset_id: number;
  user_id: number;
  purpose: string;
  status: RequestStatus;
  request_date: string;
  action_date?: string;
  comments?: string;
  
  // Populated fields from backend relationships
  asset_name: string;
  asset_tag: string;
  asset_location: string;
  requester_name: string;
  requester_dept: string;
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
  
  // Populated fields from backend relationships
  asset_name: string;
  asset_tag: string;
  asset_location: string;
  reporter_name: string;
  technician_name: string;
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
  type: string;
  message: string;
  created_at: string;
}

export interface BudgetConfig {
  grossCapitalValuationOverride?: number | null;
  cumulativeOutlaysOverride?: number | null;
}

export interface DashboardMetrics {
  totalAssets: number;
  availableCount: number;
  allocatedCount: number;
  maintenanceCount: number;
  disposedCount: number;
  activeRequests: number;
  totalRequestsCount: number;
  activeRepairs: number;
  totalAssetValuation: number;
  totalMaintenanceCost: number;
  totalUsers?: number;
}

export interface CategoryDistribution {
  name: string;
  value: number;
}

export interface DashboardStatsResponse {
  metrics: DashboardMetrics;
  categoryDistribution: CategoryDistribution[];
  recentAudits: SystemAudit[];
  budgets?: BudgetConfig;
}
