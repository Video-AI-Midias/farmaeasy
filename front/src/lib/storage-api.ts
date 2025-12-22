/**
 * Storage API client for thumbnail uploads.
 *
 * Features:
 * - File upload to Firebase Storage via backend
 * - Configuration fetching
 * - Progress tracking support
 */

import axios from "axios";
import { api } from "./api";

// ==============================================================================
// Types
// ==============================================================================

export interface StorageConfig {
  configured: boolean;
  bucket: string | null;
  max_file_size_mb: number;
  allowed_types: string[];
}

export interface StorageUploadResponse {
  success: boolean;
  file_url: string;
  storage_path: string;
  content_type: string;
  file_size: number;
  filename: string;
  uploaded_at: string;
}

export interface StorageErrorResponse {
  success: false;
  error: string;
  code: string;
}

export type EntityType = "course" | "module" | "lesson" | "user";

// ==============================================================================
// API Functions
// ==============================================================================

/**
 * Get storage configuration and status.
 */
export async function getStorageConfig(): Promise<StorageConfig> {
  const response = await api.get<StorageConfig>("/storage/config");
  return response.data;
}

/**
 * Upload a thumbnail image.
 *
 * @param file - File to upload
 * @param entityType - Type of entity (course, module, lesson)
 * @param entityId - ID of the entity
 * @param onProgress - Optional progress callback (0-100)
 */
export async function uploadThumbnail(
  file: File,
  entityType: EntityType,
  entityId: string,
  onProgress?: (percent: number) => void,
): Promise<StorageUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("entity_type", entityType);
  formData.append("entity_id", entityId);

  try {
    const response = await api.post<StorageUploadResponse>("/storage/thumbnails", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;

      // HTTP 413: Payload Too Large (file exceeds nginx/server limit)
      if (status === 413) {
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
        throw new Error(
          `Arquivo muito grande (${fileSizeMB} MB). O tamanho máximo permitido é 20 MB. Por favor, reduza o tamanho da imagem e tente novamente.`,
        );
      }

      // HTTP 400: Bad Request (validation error from backend)
      if (status === 400) {
        const detail = error.response?.data?.detail || error.response?.data?.error;
        throw new Error(detail || "Erro de validação do arquivo. Verifique o formato e tamanho.");
      }

      // HTTP 500: Internal Server Error
      if (status === 500) {
        throw new Error(
          "Erro interno do servidor ao processar o upload. Tente novamente em alguns instantes.",
        );
      }

      // HTTP 503: Service Unavailable (storage not configured)
      if (status === 503) {
        throw new Error("Serviço de armazenamento temporariamente indisponível.");
      }

      // Network/timeout errors
      if (error.code === "ECONNABORTED") {
        throw new Error(
          "Tempo limite excedido. O arquivo pode ser muito grande ou sua conexão está lenta. Tente novamente.",
        );
      }

      if (error.code === "ERR_NETWORK") {
        throw new Error("Erro de conexão. Verifique sua internet e tente novamente.");
      }

      // Generic error with detail from API
      const detail = error.response?.data?.detail || error.response?.data?.error;
      throw new Error(detail || `Erro ao fazer upload: ${error.message}`);
    }

    // Re-throw non-axios errors
    throw error;
  }
}

/**
 * Delete a thumbnail from storage.
 *
 * @param storagePath - Path of the file in storage
 */
export async function deleteThumbnail(storagePath: string): Promise<void> {
  await api.delete(`/storage/thumbnails/${encodeURIComponent(storagePath)}`);
}

export const storageApi = {
  getConfig: getStorageConfig,
  uploadThumbnail,
  deleteThumbnail,
};

export default storageApi;
