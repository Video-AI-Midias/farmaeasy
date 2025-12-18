/**
 * Types for course acquisition management.
 *
 * Mirrors backend schemas from src/acquisitions/schemas.py
 */

// ==============================================================================
// Enums
// ==============================================================================

export enum AcquisitionType {
  FREE = "free",
  PURCHASE = "purchase",
  ADMIN_GRANT = "admin_grant",
  PROMO = "promo",
  GIFT = "gift",
}

export enum AcquisitionStatus {
  PENDING = "pending",
  ACTIVE = "active",
  EXPIRED = "expired",
  REVOKED = "revoked",
}

export enum AccessReason {
  ACQUISITION = "acquisition",
  ADMIN_ROLE = "admin_role",
  COURSE_OWNER = "course_owner",
}

// ==============================================================================
// Response Types
// ==============================================================================

export interface Acquisition {
  acquisition_id: string;
  user_id: string;
  course_id: string;
  acquisition_type: AcquisitionType;
  status: AcquisitionStatus;
  granted_by: string | null;
  granted_at: string;
  expires_at: string | null;
  payment_id: string | null;
  payment_amount: string | null;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
}

export interface AcquisitionListResponse {
  items: Acquisition[];
  total: number;
  has_more: boolean;
}

export interface CheckAccessResponse {
  has_access: boolean;
  access_reason: AccessReason | null;
  acquisition_type: AcquisitionType | null;
  expires_at: string | null;
  acquisition_id: string | null;
  can_enroll: boolean;
  is_preview_mode: boolean;
}

// ==============================================================================
// Request Types
// ==============================================================================

export interface GrantAccessRequest {
  user_id: string;
  course_id: string;
  expires_in_days?: number | null;
  notes?: string | null;
}

export interface BatchGrantAccessRequest {
  user_ids: string[];
  course_id: string;
  expires_in_days?: number | null;
  notes?: string | null;
}

export interface RevokeAccessRequest {
  reason?: string | null;
}

// ==============================================================================
// Response Types (Admin)
// ==============================================================================

export interface BatchGrantAccessResponse {
  granted: number;
  skipped: number;
  errors: string[];
}

export interface StudentCountResponse {
  course_id: string;
  student_count: number;
}

// ==============================================================================
// Store State Types
// ==============================================================================

export interface AcquisitionsState {
  acquisitions: Acquisition[];
  isLoading: boolean;
  error: string | null;
}

export interface CourseStudentsState {
  students: Acquisition[];
  total: number;
  isLoading: boolean;
  error: string | null;
}
