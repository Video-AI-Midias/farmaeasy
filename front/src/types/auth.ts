/**
 * Auth types for FarmaEasy frontend.
 *
 * Re-exports core types from authentication and authorization modules,
 * plus application-specific extensions.
 */

// Re-export core types from modules
export type {
  UserRole,
  Address,
  User,
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  AuthResponse,
  ChangePasswordRequest,
  UpdateProfileRequest,
  AuthState,
  AuthActions,
  AuthStore,
} from "@farmaeasy/authentication"

export { ROLE_HIERARCHY } from "@farmaeasy/authorization"

// =============================================================================
// Application-specific types (not in core modules)
// =============================================================================

// CPF validation request/response
export interface ValidateCPFRequest {
  cpf: string
}

export interface ValidateCPFResponse {
  valid: boolean
  formatted?: string
  available?: boolean
}

// Email validation request/response
export interface ValidateEmailRequest {
  email: string
}

export interface ValidateEmailResponse {
  available: boolean
}

// Users list response
export interface UserListResponse {
  items: import("@farmaeasy/authentication").User[]
  total: number
}

// Users list filters
export interface UserListFilters {
  search?: string
  role?: import("@farmaeasy/authentication").UserRole
  limit?: number
}

// Admin create user request
export interface AdminCreateUserRequest {
  email: string
  password: string
  role?: import("@farmaeasy/authentication").UserRole | undefined
  name?: string | undefined
  phone?: string | undefined
  cpf?: string | undefined
  rg?: string | undefined
  avatar_url?: string | undefined
  address?: import("@farmaeasy/authentication").Address | undefined
}

// Last lesson info for progress tracking
export interface LastLessonInfo {
  course_id?: string
  module_id?: string
  lesson_id?: string
  last_accessed_at?: string
}

// User progress summary across all courses
export interface UserProgressSummary {
  total_courses_enrolled: number
  total_lessons_completed: number
  total_lessons_total: number
  total_watch_time_seconds: number
  last_lesson?: LastLessonInfo
}

// User session information
export interface UserSessionInfo {
  active_sessions: number
  max_sessions: number
  first_access?: string
  last_access?: string
}

// Extended user details for admin panel
export interface UserDetailsResponse {
  user: import("@farmaeasy/authentication").User
  session_info: UserSessionInfo
  progress: UserProgressSummary
  comments_count: number
}

// =============================================================================
// Password Reset & Email Change Types
// =============================================================================

// Password Reset - Forgot Password
export interface ForgotPasswordRequest {
  email: string
}

export interface ForgotPasswordResponse {
  message: string
}

// Password Reset - Verify Code
export interface VerifyCodeRequest {
  email: string
  code: string
}

export interface VerifyCodeResponse {
  valid: boolean
  message: string
}

// Password Reset - Reset Password
export interface ResetPasswordRequest {
  email: string
  code: string
  new_password: string
}

export interface ResetPasswordResponse {
  success: boolean
  message: string
}

// Email Change - Request
export interface RequestEmailChangeRequest {
  new_email: string
  password: string
}

export interface RequestEmailChangeResponse {
  message: string
  email_masked: string
}

// Email Change - Confirm
export interface ConfirmEmailChangeRequest {
  code: string
}

export interface ConfirmEmailChangeResponse {
  success: boolean
  message: string
  new_email: string | null
}

// =============================================================================
// Teacher Create Student Types
// =============================================================================

// Request to create a student (teacher+)
export interface CreateStudentRequest {
  email: string
  password: string
  name?: string | undefined
  phone?: string | undefined
  cpf?: string | undefined
  send_welcome_email?: boolean | undefined
  course_id?: string | undefined
}

// Response from creating a student
export interface CreateStudentResponse {
  user: import("@farmaeasy/authentication").User
  course_access_granted: boolean
  acquisition_id?: string | undefined
  welcome_email_sent: boolean
}

// Search users params for teachers (filtered to students/users only)
export interface SearchUsersForTeacherParams {
  search?: string | undefined
  limit?: number | undefined
}
