/**
 * Storage API client for thumbnail uploads.
 *
 * Features:
 * - File upload to Firebase Storage via backend
 * - Configuration fetching
 * - Progress tracking support
 */

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
