/**
 * API client for registration links management (Admin/Teacher).
 *
 * Uses the authenticated API client to automatically include JWT tokens.
 * Teachers and Admins can create/manage links directly from the admin panel.
 */
import api from "@/lib/api";
import type {
  CompleteRegistrationResponse,
  CoursePreview,
  ValidateLinkResponse,
} from "@/types/registration-link";
import type { AxiosError } from "axios";

// ==============================================================================
// Types
// ==============================================================================

export interface RegistrationLink {
  id: string;
  shortcode: string;
  status: "pending" | "used" | "expired" | "revoked";
  expires_at: string;
  created_at: string;
  created_by: string;
  source: "whatsapp" | "manual" | "api";
  notes?: string;
  prefill_phone?: string;
  courses: CoursePreview[];
  // Only present when status is "used"
  user_id?: string;
  used_at?: string;
  user_email?: string;
  user_name?: string;
}

export interface CreateLinkRequest {
  course_ids: string[];
  expires_in_days?: number;
  prefill_phone?: string;
  notes?: string;
}

export interface CreateLinkResponse {
  id: string;
  shortcode: string;
  url: string;
  expires_at: string;
  courses: CoursePreview[];
}

export interface ListLinksParams {
  status?: "pending" | "used" | "expired" | "revoked";
  limit?: number;
  offset?: number;
}

export interface ListLinksResponse {
  items: RegistrationLink[];
  total: number;
  limit: number;
  offset: number;
}

// ==============================================================================
// Helper Functions
// ==============================================================================

/**
 * Extract error message from Axios error response.
 */
function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ detail?: string; message?: string }>;
  return axiosError.response?.data?.detail || axiosError.response?.data?.message || fallback;
}

// ==============================================================================
// API Functions (Authenticated - uses JWT token automatically)
// ==============================================================================

const API_BASE = "/registration-links";

/**
 * Create a new registration link.
 *
 * Requires Teacher+ role. The JWT token is automatically included
 * via the api client interceptor.
 */
export async function createLink(data: CreateLinkRequest): Promise<CreateLinkResponse> {
  try {
    const response = await api.post<CreateLinkResponse>(API_BASE, data);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Erro ao criar link"));
  }
}

/**
 * List registration links created by the current user.
 *
 * Teachers see only their own links, admins see all.
 */
export async function listLinks(params?: ListLinksParams): Promise<ListLinksResponse> {
  try {
    const response = await api.get<ListLinksResponse>(API_BASE, { params });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Erro ao listar links"));
  }
}

/**
 * Revoke a registration link.
 *
 * Teachers can only revoke their own links.
 */
export async function revokeLink(linkId: string): Promise<void> {
  try {
    await api.delete(`${API_BASE}/${linkId}`);
  } catch (error) {
    throw new Error(getErrorMessage(error, "Erro ao revogar link"));
  }
}

/**
 * Validate a registration link (public endpoint).
 * Token is sent in POST body for security (not in URL).
 */
export async function validateLink(
  shortcode: string,
  token: string,
): Promise<ValidateLinkResponse> {
  const response = await fetch(`/api/v1/register/${shortcode}/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });
  return response.json();
}

/**
 * Complete registration (public endpoint).
 */
export async function completeRegistration(
  shortcode: string,
  data: Record<string, unknown>,
): Promise<CompleteRegistrationResponse> {
  const response = await fetch(`/api/v1/register/${shortcode}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Erro ao completar cadastro" }));
    throw new Error(error.detail || error.message || "Erro ao completar cadastro");
  }

  return response.json();
}

// ==============================================================================
// Export as namespaced object
// ==============================================================================

export const registrationLinksApi = {
  createLink,
  listLinks,
  revokeLink,
  validateLink,
  completeRegistration,
};
