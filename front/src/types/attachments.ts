/**
 * Types for course attachments/materials system.
 *
 * Mirrors backend schemas from src/attachments/schemas.py
 */

// ==============================================================================
// Enums
// ==============================================================================

export enum AttachmentType {
  PDF = "pdf",
  DOCUMENT = "document",
  SPREADSHEET = "spreadsheet",
  PRESENTATION = "presentation",
  IMAGE = "image",
  ARCHIVE = "archive",
  VIDEO = "video",
  AUDIO = "audio",
  OTHER = "other",
}

export enum EntityType {
  LESSON = "lesson",
  MODULE = "module",
  COURSE = "course",
}

// ==============================================================================
// Base Attachment Types
// ==============================================================================

export interface Attachment {
  id: string;
  title: string;
  description: string | null;
  original_filename: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  attachment_type: AttachmentType;
  entity_type: EntityType;
  entity_id: string;
  position: number;
  creator_id: string | null;
  download_count: number;
  created_at: string;
  updated_at: string | null;
}

export interface AttachmentWithDownloadStatus extends Attachment {
  has_downloaded: boolean;
  last_downloaded_at: string | null;
}

// ==============================================================================
// Request Types
// ==============================================================================

export interface CreateAttachmentRequest {
  title?: string | null;
  description?: string | null;
  entity_type: EntityType;
  entity_id: string;
  position?: number | null;
}

export interface UpdateAttachmentRequest {
  title?: string | null;
  description?: string | null;
}

export interface ReorderAttachmentsRequest {
  items: string[];
}

// ==============================================================================
// Response Types
// ==============================================================================

export interface AttachmentListResponse {
  items: Attachment[];
  total: number;
  has_more: boolean;
}

export interface AttachmentListWithDownloadStatus {
  items: AttachmentWithDownloadStatus[];
  total: number;
  has_more: boolean;
}

export interface AttachmentUploadResponse {
  success: boolean;
  attachment: Attachment;
  message: string;
}

export interface MessageResponse {
  message: string;
}

// ==============================================================================
// Aggregated Materials Types (for student view)
// ==============================================================================

export interface MaterialSource {
  entity_type: EntityType;
  entity_id: string;
  entity_title: string;
}

export interface AggregatedMaterial {
  id: string;
  title: string;
  description: string | null;
  original_filename: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  attachment_type: AttachmentType;
  download_count: number;
  created_at: string;
  source: MaterialSource;
  has_downloaded: boolean;
  last_downloaded_at: string | null;
}

export interface LessonMaterialsGroup {
  lesson_id: string;
  lesson_title: string;
  lesson_position: number;
  materials: AggregatedMaterial[];
}

export interface ModuleMaterialsGroup {
  module_id: string;
  module_title: string;
  module_position: number;
  module_materials: AggregatedMaterial[];
  lessons: LessonMaterialsGroup[];
}

export interface CourseMaterialsResponse {
  course_id: string;
  course_title: string;
  course_materials: AggregatedMaterial[];
  modules: ModuleMaterialsGroup[];
  total_materials: number;
  total_downloaded: number;
}

// ==============================================================================
// Helper Types
// ==============================================================================

/** Map attachment type to display info */
export const ATTACHMENT_TYPE_INFO: Record<AttachmentType, { label: string; color: string }> = {
  [AttachmentType.PDF]: { label: "PDF", color: "text-red-600" },
  [AttachmentType.DOCUMENT]: { label: "Documento", color: "text-blue-600" },
  [AttachmentType.SPREADSHEET]: { label: "Planilha", color: "text-green-600" },
  [AttachmentType.PRESENTATION]: { label: "Apresentacao", color: "text-orange-600" },
  [AttachmentType.IMAGE]: { label: "Imagem", color: "text-purple-600" },
  [AttachmentType.ARCHIVE]: { label: "Arquivo", color: "text-yellow-600" },
  [AttachmentType.VIDEO]: { label: "Video", color: "text-pink-600" },
  [AttachmentType.AUDIO]: { label: "Audio", color: "text-teal-600" },
  [AttachmentType.OTHER]: { label: "Outro", color: "text-gray-600" },
};

/** Map MIME type to attachment type */
export function getAttachmentType(mimeType: string): AttachmentType {
  if (mimeType === "application/pdf") return AttachmentType.PDF;
  if (mimeType.includes("word") || mimeType.includes("document") || mimeType === "text/plain") {
    return AttachmentType.DOCUMENT;
  }
  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType === "text/csv") {
    return AttachmentType.SPREADSHEET;
  }
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) {
    return AttachmentType.PRESENTATION;
  }
  if (mimeType.startsWith("image/")) return AttachmentType.IMAGE;
  if (mimeType.includes("zip") || mimeType.includes("rar") || mimeType.includes("7z")) {
    return AttachmentType.ARCHIVE;
  }
  if (mimeType.startsWith("video/")) return AttachmentType.VIDEO;
  if (mimeType.startsWith("audio/")) return AttachmentType.AUDIO;
  return AttachmentType.OTHER;
}

/** Format file size to human readable */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** Get file extension from filename */
export function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  const ext = parts.length > 1 ? parts[parts.length - 1] : null;
  return ext ? ext.toUpperCase() : "";
}
