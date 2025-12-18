/**
 * API client with automatic token refresh and request queuing.
 *
 * Features:
 * - Automatic Bearer token injection
 * - 401 response handling with token refresh
 * - Request queue during token refresh (prevents multiple refresh calls)
 * - Typed API endpoints for auth operations
 */

import type {
  AdminCreateUserRequest,
  AuthResponse,
  ChangePasswordRequest,
  ConfirmEmailChangeRequest,
  ConfirmEmailChangeResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  RegisterRequest,
  RequestEmailChangeRequest,
  RequestEmailChangeResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
  TokenResponse,
  UpdateProfileRequest,
  User,
  UserDetailsResponse,
  UserListFilters,
  UserListResponse,
  ValidateCPFResponse,
  ValidateEmailResponse,
  VerifyCodeRequest,
  VerifyCodeResponse,
} from "@/types/auth";
import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

// Base URL configured via Vite proxy (/api -> backend)
const API_BASE_URL = "/api/v1";

// Token storage (in-memory for security)
let accessToken: string | null = null;

// Callbacks for auth events
let onTokenRefreshed: ((token: string) => void) | null = null;
let onAuthError: (() => void) | null = null;

// Request queue for handling 401 during token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

/**
 * Process queued requests after token refresh
 */
function processQueue(error: Error | null, token: string | null = null): void {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
}

/**
 * Axios instance with interceptors
 */
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Enable cookies for refresh token
  timeout: 30000, // 30 second timeout to prevent hanging requests
});

/**
 * Request interceptor - adds Bearer token to requests
 */
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

/**
 * Response interceptor - handles 401 and token refresh
 */
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only handle 401 errors
    if (error.response?.status !== 401) {
      return Promise.reject(error);
    }

    // Don't retry refresh endpoint to avoid infinite loop
    if (originalRequest.url?.includes("/auth/refresh")) {
      onAuthError?.();
      return Promise.reject(error);
    }

    // Already retried this request
    if (originalRequest._retry) {
      return Promise.reject(error);
    }

    // If already refreshing, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          if (originalRequest.headers && token) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return api(originalRequest);
        })
        .catch((queueError) => Promise.reject(queueError));
    }

    // Start token refresh
    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const response = await axios.post<TokenResponse>(
        `${API_BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true },
      );

      const newToken = response.data.access_token;
      accessToken = newToken;
      onTokenRefreshed?.(newToken);

      processQueue(null, newToken);

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
      }

      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError as Error, null);
      accessToken = null;
      onAuthError?.();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

/**
 * Set access token (called after login/refresh)
 */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * Get current access token
 */
export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Set callback for when token is refreshed
 */
export function setOnTokenRefreshed(callback: (token: string) => void): void {
  onTokenRefreshed = callback;
}

/**
 * Set callback for when auth error occurs (e.g., refresh fails)
 */
export function setOnAuthError(callback: () => void): void {
  onAuthError = callback;
}

/**
 * Auth API endpoints
 */
export const authApi = {
  /**
   * Login with email and password.
   * Returns tokens, then fetches user data.
   */
  login: async (credentials: LoginRequest): Promise<AuthResponse> => {
    // Step 1: Get tokens
    const tokenResponse = await api.post<TokenResponse>("/auth/login", credentials);

    // Step 2: Set token for next request
    setAccessToken(tokenResponse.data.access_token);

    // Step 3: Fetch user data
    const userResponse = await api.get<User>("/auth/me");

    return {
      user: userResponse.data,
      tokens: tokenResponse.data,
    };
  },

  /**
   * Register new user.
   * Creates user, then logs in to get tokens.
   */
  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    // Step 1: Register user (returns UserResponse without tokens)
    await api.post<User>("/auth/register", data);

    // Step 2: Login with credentials to get tokens
    const tokenResponse = await api.post<TokenResponse>("/auth/login", {
      email: data.email,
      password: data.password,
    });

    // Step 3: Set token for next request
    setAccessToken(tokenResponse.data.access_token);

    // Step 4: Fetch full user data
    const userResponse = await api.get<User>("/auth/me");

    return {
      user: userResponse.data,
      tokens: tokenResponse.data,
    };
  },

  /**
   * Logout (revokes refresh token)
   */
  logout: async (): Promise<void> => {
    await api.post("/auth/logout");
  },

  /**
   * Refresh access token using refresh token cookie.
   * Uses raw axios to avoid interceptor loops.
   */
  refresh: async (): Promise<TokenResponse> => {
    const response = await axios.post<TokenResponse>(
      `${API_BASE_URL}/auth/refresh`,
      {},
      { withCredentials: true },
    );
    return response.data;
  },

  /**
   * Get current user profile
   */
  me: async (): Promise<User> => {
    const response = await api.get<User>("/auth/me");
    return response.data;
  },

  /**
   * Update user profile
   */
  updateProfile: async (data: UpdateProfileRequest): Promise<User> => {
    const response = await api.patch<User>("/auth/me", data);
    return response.data;
  },

  /**
   * Change password
   */
  changePassword: async (data: ChangePasswordRequest): Promise<void> => {
    await api.post("/auth/me/change-password", data);
  },

  /**
   * Validate CPF format and availability
   */
  validateCPF: async (cpf: string): Promise<ValidateCPFResponse> => {
    const response = await api.post<ValidateCPFResponse>("/auth/validate/cpf", { cpf });
    return response.data;
  },

  /**
   * Check email availability
   */
  validateEmail: async (email: string): Promise<ValidateEmailResponse> => {
    const response = await api.post<ValidateEmailResponse>("/auth/validate/email", { email });
    return response.data;
  },

  /**
   * List/search users (admin only)
   */
  listUsers: async (filters?: UserListFilters): Promise<UserListResponse> => {
    const params = new URLSearchParams();
    if (filters?.search) params.append("search", filters.search);
    if (filters?.role) params.append("role", filters.role);
    if (filters?.limit) params.append("limit", filters.limit.toString());

    const response = await api.get<UserListResponse>(`/auth/users?${params.toString()}`);
    return response.data;
  },

  /**
   * Update user role (admin only)
   */
  updateUserRole: async (userId: string, role: User["role"]): Promise<User> => {
    const response = await api.patch<User>(`/auth/users/${userId}/role`, { role });
    return response.data;
  },

  /**
   * Deactivate user account (admin only, soft delete)
   */
  deactivateUser: async (userId: string): Promise<void> => {
    await api.delete(`/auth/users/${userId}`);
  },

  /**
   * Create user (admin only)
   */
  createUser: async (data: AdminCreateUserRequest): Promise<User> => {
    const response = await api.post<User>("/auth/users", data);
    return response.data;
  },

  /**
   * Get extended user details (admin only)
   */
  getUserDetails: async (userId: string): Promise<UserDetailsResponse> => {
    const response = await api.get<UserDetailsResponse>(`/auth/users/${userId}/details`);
    return response.data;
  },

  /**
   * Update user max concurrent sessions (admin only)
   */
  updateUserMaxSessions: async (userId: string, maxSessions: number | null): Promise<User> => {
    const response = await api.patch<User>(`/auth/users/${userId}/max-sessions`, {
      max_concurrent_sessions: maxSessions,
    });
    return response.data;
  },
};

export default api;
