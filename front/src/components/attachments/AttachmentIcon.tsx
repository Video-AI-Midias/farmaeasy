/**
 * Icon component for attachment file types.
 *
 * Renders appropriate icon based on attachment type with consistent styling.
 */

import { cn } from "@/lib/utils";
import { AttachmentType } from "@/types/attachments";
import {
  Archive,
  File,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
} from "lucide-react";

interface AttachmentIconProps {
  type: AttachmentType;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

const typeColors: Record<AttachmentType, string> = {
  [AttachmentType.PDF]: "text-red-500",
  [AttachmentType.DOCUMENT]: "text-blue-500",
  [AttachmentType.SPREADSHEET]: "text-green-500",
  [AttachmentType.PRESENTATION]: "text-orange-500",
  [AttachmentType.IMAGE]: "text-purple-500",
  [AttachmentType.ARCHIVE]: "text-yellow-600",
  [AttachmentType.VIDEO]: "text-pink-500",
  [AttachmentType.AUDIO]: "text-teal-500",
  [AttachmentType.OTHER]: "text-gray-500",
};

const typeIcons: Record<AttachmentType, typeof File> = {
  [AttachmentType.PDF]: FileText,
  [AttachmentType.DOCUMENT]: FileText,
  [AttachmentType.SPREADSHEET]: FileSpreadsheet,
  [AttachmentType.PRESENTATION]: Presentation,
  [AttachmentType.IMAGE]: FileImage,
  [AttachmentType.ARCHIVE]: Archive,
  [AttachmentType.VIDEO]: FileVideo,
  [AttachmentType.AUDIO]: FileAudio,
  [AttachmentType.OTHER]: File,
};

export function AttachmentIcon({ type, className, size = "md" }: AttachmentIconProps) {
  const Icon = typeIcons[type];
  const colorClass = typeColors[type];
  const sizeClass = sizeClasses[size];

  return <Icon className={cn(sizeClass, colorClass, className)} />;
}

export default AttachmentIcon;
