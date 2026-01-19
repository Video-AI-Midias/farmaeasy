/**
 * API client for registration links management (Admin/Teacher).
 */
import type {
  CompleteRegistrationResponse,
  CoursePreview,
  ValidateLinkResponse,
} from "@/types/registration-link";

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
// API Functions
// ==============================================================================

const API_BASE = "/api/v1/registration-links";

/**
 * Create a new registration link.
 */
export async function createLink(data: CreateLinkRequest): Promise<CreateLinkResponse> {
  const response = await fetch(API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Erro ao criar link" }));
    throw new Error(error.detail || error.message || "Erro ao criar link");
  }

  return response.json();
}

/**
 * List registration links created by the current user.
 */
export async function listLinks(params?: ListLinksParams): Promise<ListLinksResponse> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());

  const url = `${API_BASE}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Erro ao listar links" }));
    throw new Error(error.detail || error.message || "Erro ao listar links");
  }

  return response.json();
}

/**
 * Revoke a registration link.
 */
export async function revokeLink(linkId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/${linkId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Erro ao revogar link" }));
    throw new Error(error.detail || error.message || "Erro ao revogar link");
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
