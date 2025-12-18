/**
 * Auth types for FarmaEasy frontend.
 * Mirrors backend schemas from src/auth/schemas.py
 */

// User roles matching backend UserRole enum
export type UserRole = "user" | "student" | "teacher" | "admin";

// Address type
export interface Address {
  street?: string | undefined;
  number?: string | undefined;
  complement?: string | undefined;
  neighborhood?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  zip_code?: string | undefined;
}

// User entity returned by API
export interface User {
  id: string;
  email: string;
  name?: string;
  cpf?: string;
  rg?: string;
  phone?: string;
  avatar_url?: string;
  role: UserRole;
  is_active: boolean;
  address?: Address;
  max_concurrent_sessions?: number;
  created_at: string;
  updated_at?: string;
}

// Login request
export interface LoginRequest {
  email: string;
  password: string;
}

// Registration request
export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  cpf: string;
  phone: string;
}

// Token response from API
export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
}

// Auth response with user data
export interface AuthResponse {
  user: User;
  tokens: TokenResponse;
}

// CPF validation request/response
export interface ValidateCPFRequest {
  cpf: string;
}

export interface ValidateCPFResponse {
  valid: boolean;
  formatted?: string;
  available?: boolean;
}

// Email validation request/response
export interface ValidateEmailRequest {
  email: string;
}

export interface ValidateEmailResponse {
  available: boolean;
}

// Password change request
export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

// Profile update request
export interface UpdateProfileRequest {
  name?: string;
  phone?: string;
  avatar_url?: string;
}

// Auth state for Zustand store
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
}

// Auth actions for Zustand store
export interface AuthActions {
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  updateProfile: (data: UpdateProfileRequest) => Promise<void>;
  changePassword: (data: ChangePasswordRequest) => Promise<void>;
  reset: () => void;
}

// Complete auth store type
export type AuthStore = AuthState & AuthActions;

// Users list response
export interface UserListResponse {
  items: User[];
  total: number;
}

// Users list filters
export interface UserListFilters {
  search?: string;
  role?: UserRole;
  limit?: number;
}

// Admin create user request
export interface AdminCreateUserRequest {
  email: string;
  password: string;
  role?: UserRole | undefined;
  name?: string | undefined;
  phone?: string | undefined;
  cpf?: string | undefined;
  rg?: string | undefined;
  avatar_url?: string | undefined;
  address?: Address | undefined;
}

// Last lesson info for progress tracking
export interface LastLessonInfo {
  course_id?: string;
  module_id?: string;
  lesson_id?: string;
  last_accessed_at?: string;
}

// User progress summary across all courses
export interface UserProgressSummary {
  total_courses_enrolled: number;
  total_lessons_completed: number;
  total_lessons_total: number;
  total_watch_time_seconds: number;
  last_lesson?: LastLessonInfo;
}

// User session information
export interface UserSessionInfo {
  active_sessions: number;
  max_sessions: number;
  first_access?: string;
  last_access?: string;
}

// Extended user details for admin panel
export interface UserDetailsResponse {
  user: User;
  session_info: UserSessionInfo;
  progress: UserProgressSummary;
  comments_count: number;
}

// =============================================================================
// Password Reset & Email Change Types
// =============================================================================

// Password Reset - Forgot Password
export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
}

// Password Reset - Verify Code
export interface VerifyCodeRequest {
  email: string;
  code: string;
}

export interface VerifyCodeResponse {
  valid: boolean;
  message: string;
}

// Password Reset - Reset Password
export interface ResetPasswordRequest {
  email: string;
  code: string;
  new_password: string;
}

export interface ResetPasswordResponse {
  success: boolean;
  message: string;
}

// Email Change - Request
export interface RequestEmailChangeRequest {
  new_email: string;
  password: string;
}

export interface RequestEmailChangeResponse {
  message: string;
  email_masked: string;
}

// Email Change - Confirm
export interface ConfirmEmailChangeRequest {
  code: string;
}

export interface ConfirmEmailChangeResponse {
  success: boolean;
  message: string;
  new_email: string | null;
}
