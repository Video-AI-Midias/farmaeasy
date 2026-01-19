/**
 * API client for attachments/materials operations.
 *
 * Features:
 * - File upload to Firebase Storage
 * - CRUD operations for attachments
 * - Download tracking
 * - Aggregated course materials
 */

import type {
  Attachment,
  AttachmentListWithDownloadStatus,
  AttachmentUploadResponse,
  CourseMaterialsResponse,
  EntityType,
  MessageResponse,
  ReorderAttachmentsRequest,
  UpdateAttachmentRequest,
} from "@/types/attachments";
import { api } from "./api";

// ==============================================================================
// Attachments API
// ==============================================================================

export const attachmentsApi = {
  /**
   * Upload a new attachment file.
   */
  upload: async (
    file: File,
    entityType: EntityType,
    entityId: string,
    options?: {
      title?: string;
      description?: string;
      position?: number;
    },
  ): Promise<AttachmentUploadResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("entity_type", entityType);
    formData.append("entity_id", entityId);

    if (options?.title) {
      formData.append("title", options.title);
    }
    if (options?.description) {
      formData.append("description", options.description);
    }
    if (options?.position !== undefined) {
      formData.append("position", options.position.toString());
    }

    const response = await api.post<AttachmentUploadResponse>("/attachments/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },

  /**
   * Get attachment by ID.
   */
  get: async (attachmentId: string): Promise<Attachment> => {
    const response = await api.get<Attachment>(`/attachments/${attachmentId}`);
    return response.data;
  },

  /**
   * Update attachment metadata.
   */
  update: async (attachmentId: string, data: UpdateAttachmentRequest): Promise<Attachment> => {
    const response = await api.put<Attachment>(`/attachments/${attachmentId}`, data);
    return response.data;
  },

  /**
   * Delete attachment.
   */
  delete: async (attachmentId: string): Promise<MessageResponse> => {
    const response = await api.delete<MessageResponse>(`/attachments/${attachmentId}`);
    return response.data;
  },

  /**
   * List attachments for an entity (lesson, module, or course).
   */
  listByEntity: async (
    entityType: EntityType,
    entityId: string,
  ): Promise<AttachmentListWithDownloadStatus> => {
    const response = await api.get<AttachmentListWithDownloadStatus>(
      `/attachments/by-entity/${entityType}/${entityId}`,
    );
    return response.data;
  },

  /**
   * Reorder attachments within an entity.
   */
  reorder: async (
    entityType: EntityType,
    entityId: string,
    data: ReorderAttachmentsRequest,
  ): Promise<MessageResponse> => {
    const response = await api.put<MessageResponse>(
      `/attachments/by-entity/${entityType}/${entityId}/reorder`,
      data,
    );
    return response.data;
  },

  /**
   * Record that user downloaded an attachment.
   * Call this when user clicks download button.
   */
  recordDownload: async (attachmentId: string): Promise<MessageResponse> => {
    const response = await api.post<MessageResponse>(`/attachments/${attachmentId}/download`);
    return response.data;
  },

  /**
   * Get all materials for a course (aggregated from course/modules/lessons).
   */
  getCourseMaterials: async (courseId: string): Promise<CourseMaterialsResponse> => {
    const response = await api.get<CourseMaterialsResponse>(
      `/attachments/course/${courseId}/materials`,
    );
    return response.data;
  },
};

export default attachmentsApi;
