"""Attachments service layer.

Business logic for:
- Attachment CRUD operations
- File upload to Firebase Storage
- Download tracking
- Aggregated materials listings
"""

from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

import structlog

from src.attachments.models import (
    Attachment,
    EntityType,
    UserAttachmentDownload,
    get_attachment_type,
)
from src.attachments.schemas import (
    AggregatedMaterial,
    AttachmentResponse,
    AttachmentWithDownloadStatus,
    CourseMaterialsResponse,
    CreateAttachmentRequest,
    LessonMaterialsGroup,
    MaterialSource,
    ModuleMaterialsGroup,
    UpdateAttachmentRequest,
)


if TYPE_CHECKING:
    from cassandra.cluster import Session

    from src.storage.service import FirebaseStorageService


logger = structlog.get_logger(__name__)


# ==============================================================================
# Custom Exceptions
# ==============================================================================


class AttachmentError(Exception):
    """Base attachment error."""

    def __init__(self, message: str, code: str = "attachment_error"):
        self.message = message
        self.code = code
        super().__init__(message)


class AttachmentNotFoundError(AttachmentError):
    """Attachment not found."""

    def __init__(self, message: str = "Anexo nao encontrado"):
        super().__init__(message, "attachment_not_found")


class EntityNotFoundError(AttachmentError):
    """Parent entity not found."""

    def __init__(self, message: str = "Entidade pai nao encontrada"):
        super().__init__(message, "entity_not_found")


class UploadError(AttachmentError):
    """Upload failed."""

    def __init__(self, message: str = "Falha no upload do arquivo"):
        super().__init__(message, "upload_error")


class PermissionDeniedError(AttachmentError):
    """Permission denied."""

    def __init__(self, message: str = "Permissao negada"):
        super().__init__(message, "permission_denied")


# ==============================================================================
# Attachments Service
# ==============================================================================


class AttachmentsService:
    """Service for attachment management."""

    def __init__(
        self,
        session: "Session",
        keyspace: str,
        storage_service: "FirebaseStorageService",
    ):
        """Initialize with Cassandra session and storage service."""
        self.session = session
        self.keyspace = keyspace
        self.storage = storage_service
        self._prepare_statements()

    def _prepare_statements(self) -> None:
        """Prepare CQL statements for efficient queries."""
        # Attachment CRUD
        self._get_attachment_by_id = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.attachments WHERE id = ?"
        )
        self._insert_attachment = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.attachments
            (id, title, description, original_filename, storage_path, file_url,
             file_size, mime_type, attachment_type, entity_type, entity_id,
             position, creator_id, download_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)
        self._update_attachment = self.session.prepare(f"""
            UPDATE {self.keyspace}.attachments
            SET title = ?, description = ?, updated_at = ?
            WHERE id = ?
        """)
        self._delete_attachment = self.session.prepare(
            f"DELETE FROM {self.keyspace}.attachments WHERE id = ?"
        )
        self._update_download_count = self.session.prepare(
            f"UPDATE {self.keyspace}.attachments SET download_count = ? WHERE id = ?"
        )

        # Lookup tables - by lesson
        self._get_attachments_by_lesson = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.attachments_by_lesson WHERE lesson_id = ?"
        )
        self._insert_attachment_by_lesson = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.attachments_by_lesson
            (lesson_id, position, attachment_id, title, original_filename, file_url,
             file_size, mime_type, attachment_type, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)
        self._delete_attachment_by_lesson = self.session.prepare(
            f"DELETE FROM {self.keyspace}.attachments_by_lesson WHERE lesson_id = ? AND position = ? AND attachment_id = ?"
        )

        # Lookup tables - by module
        self._get_attachments_by_module = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.attachments_by_module WHERE module_id = ?"
        )
        self._insert_attachment_by_module = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.attachments_by_module
            (module_id, position, attachment_id, title, original_filename, file_url,
             file_size, mime_type, attachment_type, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)
        self._delete_attachment_by_module = self.session.prepare(
            f"DELETE FROM {self.keyspace}.attachments_by_module WHERE module_id = ? AND position = ? AND attachment_id = ?"
        )

        # Lookup tables - by course
        self._get_attachments_by_course = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.attachments_by_course WHERE course_id = ?"
        )
        self._insert_attachment_by_course = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.attachments_by_course
            (course_id, position, attachment_id, title, original_filename, file_url,
             file_size, mime_type, attachment_type, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)
        self._delete_attachment_by_course = self.session.prepare(
            f"DELETE FROM {self.keyspace}.attachments_by_course WHERE course_id = ? AND position = ? AND attachment_id = ?"
        )

        # Download tracking
        self._insert_download = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.attachment_downloads
            (attachment_id, user_id, downloaded_at)
            VALUES (?, ?, ?)
        """)
        self._get_user_download = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.user_attachment_downloads WHERE user_id = ? AND attachment_id = ?"
        )
        self._upsert_user_download = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.user_attachment_downloads
            (user_id, attachment_id, first_downloaded_at, last_downloaded_at, download_count)
            VALUES (?, ?, ?, ?, ?)
        """)
        self._get_user_downloads_for_entity = self.session.prepare(
            f"SELECT attachment_id FROM {self.keyspace}.user_attachment_downloads WHERE user_id = ?"
        )

        # Entity queries (to verify entity exists and get title)
        self._get_lesson = self.session.prepare(
            f"SELECT id, title FROM {self.keyspace}.lessons WHERE id = ?"
        )
        self._get_module = self.session.prepare(
            f"SELECT id, title FROM {self.keyspace}.modules WHERE id = ?"
        )
        self._get_course = self.session.prepare(
            f"SELECT id, title FROM {self.keyspace}.courses WHERE id = ?"
        )

        # Course structure queries for aggregated materials
        self._get_course_modules = self.session.prepare(
            f"SELECT module_id, position FROM {self.keyspace}.course_modules WHERE course_id = ?"
        )
        self._get_module_lessons = self.session.prepare(
            f"SELECT lesson_id, position FROM {self.keyspace}.module_lessons WHERE module_id = ?"
        )

    # ==============================================================================
    # CRUD Operations
    # ==============================================================================

    async def create_attachment(
        self,
        content: bytes,
        content_type: str,
        original_filename: str,
        request: CreateAttachmentRequest,
        creator_id: UUID,
    ) -> Attachment:
        """Create a new attachment with file upload.

        Args:
            content: File content as bytes.
            content_type: MIME type of the file.
            original_filename: Original filename for download.
            request: Attachment metadata.
            creator_id: ID of the user creating the attachment.

        Returns:
            Created Attachment object.

        Raises:
            EntityNotFoundError: If parent entity doesn't exist.
            UploadError: If file upload fails.
        """
        # Verify entity exists
        entity_title = self._verify_entity_exists(
            request.entity_type.value, request.entity_id
        )
        if not entity_title:
            raise EntityNotFoundError(
                f"{request.entity_type.value.capitalize()} nao encontrado"
            )

        # Generate UUID for attachment
        attachment_id = uuid4()

        # Upload file to Firebase Storage
        try:
            upload_result = await self.storage.upload_attachment(
                content=content,
                content_type=content_type,
                attachment_id=str(attachment_id),
                entity_type=request.entity_type.value,
                original_filename=original_filename,
            )
        except Exception as e:
            logger.exception("attachment_upload_failed", error=str(e))
            raise UploadError(f"Falha no upload: {e}") from e

        # Determine position (next available)
        position = request.position
        if position is None:
            position = self._get_next_position(
                request.entity_type.value, request.entity_id
            )

        # Determine attachment type from MIME
        attachment_type = get_attachment_type(content_type)

        # Create attachment entity
        now = datetime.now(UTC)
        attachment = Attachment(
            id=attachment_id,
            title=request.title or original_filename,
            description=request.description,
            original_filename=original_filename,
            storage_path=upload_result["storage_path"],
            file_url=upload_result["file_url"],
            file_size=upload_result["file_size"],
            mime_type=content_type,
            attachment_type=attachment_type.value,
            entity_type=request.entity_type.value,
            entity_id=request.entity_id,
            position=position,
            creator_id=creator_id,
            download_count=0,
            created_at=now,
            updated_at=None,
        )

        # Insert into main table
        self.session.execute(
            self._insert_attachment,
            (
                attachment.id,
                attachment.title,
                attachment.description,
                attachment.original_filename,
                attachment.storage_path,
                attachment.file_url,
                attachment.file_size,
                attachment.mime_type,
                attachment.attachment_type,
                attachment.entity_type,
                attachment.entity_id,
                attachment.position,
                attachment.creator_id,
                attachment.download_count,
                attachment.created_at,
                attachment.updated_at,
            ),
        )

        # Insert into lookup table
        self._insert_into_lookup_table(attachment)

        logger.info(
            "attachment_created",
            attachment_id=str(attachment_id),
            entity_type=request.entity_type.value,
            entity_id=str(request.entity_id),
            filename=original_filename,
        )

        return attachment

    def get_attachment(self, attachment_id: UUID) -> Attachment | None:
        """Get attachment by ID.

        Args:
            attachment_id: The attachment UUID.

        Returns:
            Attachment if found, None otherwise.
        """
        row = self.session.execute(self._get_attachment_by_id, (attachment_id,)).one()
        if not row:
            return None
        return Attachment.from_row(row)

    def get_attachments_by_entity(
        self,
        entity_type: str,
        entity_id: UUID,
        user_id: UUID | None = None,
    ) -> list[AttachmentWithDownloadStatus]:
        """Get all attachments for an entity with optional download status.

        Args:
            entity_type: Type of entity (lesson, module, course).
            entity_id: ID of the entity.
            user_id: Optional user ID for download status.

        Returns:
            List of attachments with download status if user_id provided.
        """
        # Get from lookup table
        if entity_type == EntityType.LESSON.value:
            rows = self.session.execute(
                self._get_attachments_by_lesson, (entity_id,)
            ).all()
        elif entity_type == EntityType.MODULE.value:
            rows = self.session.execute(
                self._get_attachments_by_module, (entity_id,)
            ).all()
        else:
            rows = self.session.execute(
                self._get_attachments_by_course, (entity_id,)
            ).all()

        attachments = [
            Attachment.from_lookup_row(row, entity_type, entity_id) for row in rows
        ]

        # Get download status if user provided
        downloaded_ids: set[UUID] = set()
        download_times: dict[UUID, datetime] = {}
        if user_id:
            user_downloads = self._get_user_downloads(
                user_id, [a.id for a in attachments]
            )
            downloaded_ids = {
                d.attachment_id for d in user_downloads if d.has_downloaded
            }
            download_times = {
                d.attachment_id: d.last_downloaded_at
                for d in user_downloads
                if d.last_downloaded_at
            }

        return [
            AttachmentWithDownloadStatus(
                **AttachmentResponse.model_validate(a.to_dict()).model_dump(),
                has_downloaded=a.id in downloaded_ids,
                last_downloaded_at=download_times.get(a.id),
            )
            for a in attachments
        ]

    def update_attachment(
        self,
        attachment_id: UUID,
        request: UpdateAttachmentRequest,
    ) -> Attachment:
        """Update attachment metadata.

        Args:
            attachment_id: The attachment UUID.
            request: Update data.

        Returns:
            Updated Attachment.

        Raises:
            AttachmentNotFoundError: If attachment doesn't exist.
        """
        attachment = self.get_attachment(attachment_id)
        if not attachment:
            raise AttachmentNotFoundError

        # Update fields
        now = datetime.now(UTC)
        new_title = request.title if request.title is not None else attachment.title
        new_description = (
            request.description
            if request.description is not None
            else attachment.description
        )

        # Update main table
        self.session.execute(
            self._update_attachment,
            (new_title, new_description, now, attachment_id),
        )

        # Update lookup table if title changed
        if new_title != attachment.title:
            self._delete_from_lookup_table(attachment)
            attachment.title = new_title
            attachment.updated_at = now
            self._insert_into_lookup_table(attachment)

        attachment.title = new_title
        attachment.description = new_description
        attachment.updated_at = now

        logger.info("attachment_updated", attachment_id=str(attachment_id))
        return attachment

    async def delete_attachment(self, attachment_id: UUID) -> bool:
        """Delete an attachment and its file.

        Args:
            attachment_id: The attachment UUID.

        Returns:
            True if deleted successfully.

        Raises:
            AttachmentNotFoundError: If attachment doesn't exist.
        """
        attachment = self.get_attachment(attachment_id)
        if not attachment:
            raise AttachmentNotFoundError

        # Delete from Firebase Storage
        try:
            await self.storage.delete_file(attachment.storage_path)
        except Exception as e:
            logger.warning(
                "attachment_storage_delete_failed",
                attachment_id=str(attachment_id),
                error=str(e),
            )

        # Delete from lookup table
        self._delete_from_lookup_table(attachment)

        # Delete from main table
        self.session.execute(self._delete_attachment, (attachment_id,))

        logger.info("attachment_deleted", attachment_id=str(attachment_id))
        return True

    # ==============================================================================
    # Reordering
    # ==============================================================================

    def reorder_attachments(
        self,
        entity_type: str,
        entity_id: UUID,
        attachment_ids: list[UUID],
    ) -> bool:
        """Reorder attachments within an entity.

        Args:
            entity_type: Type of entity.
            entity_id: ID of the entity.
            attachment_ids: Attachment IDs in desired order.

        Returns:
            True if reordered successfully.
        """
        # Get current attachments
        attachments = {
            a.id: a for a in self.get_attachments_by_entity(entity_type, entity_id)
        }

        # Delete all from lookup table
        for attachment_id in attachment_ids:
            attachment = attachments.get(attachment_id)
            if attachment:
                self._delete_from_lookup_table_by_ids(
                    entity_type, entity_id, attachment.position, attachment_id
                )

        # Re-insert with new positions
        for position, attachment_id in enumerate(attachment_ids):
            attachment = attachments.get(attachment_id)
            if attachment:
                attachment.position = position
                self._insert_into_lookup_table(attachment)
                # Update main table position
                self.session.execute(
                    self.session.prepare(
                        f"UPDATE {self.keyspace}.attachments SET position = ? WHERE id = ?"
                    ),
                    (position, attachment_id),
                )

        logger.info(
            "attachments_reordered",
            entity_type=entity_type,
            entity_id=str(entity_id),
            count=len(attachment_ids),
        )
        return True

    # ==============================================================================
    # Download Tracking
    # ==============================================================================

    def record_download(self, attachment_id: UUID, user_id: UUID) -> bool:
        """Record a download event.

        Args:
            attachment_id: The attachment that was downloaded.
            user_id: The user who downloaded.

        Returns:
            True if this is the first download by this user.
        """
        now = datetime.now(UTC)

        # Insert into downloads log
        self.session.execute(
            self._insert_download,
            (attachment_id, user_id, now),
        )

        # Update attachment download count (read-increment-write since not COUNTER)
        attachment = self.get_attachment(attachment_id)
        if attachment:
            new_count = (attachment.download_count or 0) + 1
            self.session.execute(
                self._update_download_count, (new_count, attachment_id)
            )

        # Check if first download
        user_download = self.session.execute(
            self._get_user_download, (user_id, attachment_id)
        ).one()

        is_first = user_download is None

        # Update or insert user download record
        if is_first:
            self.session.execute(
                self._upsert_user_download,
                (user_id, attachment_id, now, now, 1),
            )
        else:
            # Update last downloaded and count
            current_count = user_download.download_count or 0
            self.session.execute(
                self._upsert_user_download,
                (
                    user_id,
                    attachment_id,
                    user_download.first_downloaded_at,
                    now,
                    current_count + 1,
                ),
            )

        logger.info(
            "download_recorded",
            attachment_id=str(attachment_id),
            user_id=str(user_id),
            is_first=is_first,
        )

        return is_first

    def get_download_status(
        self,
        user_id: UUID,
        attachment_ids: list[UUID],
    ) -> dict[UUID, bool]:
        """Check download status for multiple attachments.

        Args:
            user_id: The user ID.
            attachment_ids: List of attachment IDs to check.

        Returns:
            Dict mapping attachment_id to has_downloaded boolean.
        """
        user_downloads = self._get_user_downloads(user_id, attachment_ids)
        downloaded_ids = {d.attachment_id for d in user_downloads if d.has_downloaded}
        return {aid: aid in downloaded_ids for aid in attachment_ids}

    # ==============================================================================
    # Aggregated Materials (for student view)
    # ==============================================================================

    def get_course_materials(
        self,
        course_id: UUID,
        user_id: UUID | None = None,
    ) -> CourseMaterialsResponse | None:
        """Get all materials for a course, organized by module/lesson.

        Args:
            course_id: The course ID.
            user_id: Optional user ID for download status.

        Returns:
            Aggregated materials response or None if course not found.
        """
        # Get course info
        course_row = self.session.execute(self._get_course, (course_id,)).one()
        if not course_row:
            return None

        # Get course-level attachments
        course_attachments = self.get_attachments_by_entity(
            EntityType.COURSE.value, course_id, user_id
        )
        course_materials = [
            self._to_aggregated_material(
                a,
                MaterialSource(
                    entity_type=EntityType.COURSE,
                    entity_id=course_id,
                    entity_title=course_row.title,
                ),
            )
            for a in course_attachments
        ]

        # Get modules and their materials
        module_rows = self.session.execute(self._get_course_modules, (course_id,)).all()

        modules_data: list[ModuleMaterialsGroup] = []
        for module_row in sorted(module_rows, key=lambda r: r.position):
            module_id = module_row.module_id
            module_info = self.session.execute(self._get_module, (module_id,)).one()
            if not module_info:
                continue

            # Module-level attachments
            module_attachments = self.get_attachments_by_entity(
                EntityType.MODULE.value, module_id, user_id
            )
            module_materials = [
                self._to_aggregated_material(
                    a,
                    MaterialSource(
                        entity_type=EntityType.MODULE,
                        entity_id=module_id,
                        entity_title=module_info.title,
                    ),
                )
                for a in module_attachments
            ]

            # Get lessons and their materials
            lesson_rows = self.session.execute(
                self._get_module_lessons, (module_id,)
            ).all()

            lessons_data: list[LessonMaterialsGroup] = []
            for lesson_row in sorted(lesson_rows, key=lambda r: r.position):
                lesson_id = lesson_row.lesson_id
                lesson_info = self.session.execute(self._get_lesson, (lesson_id,)).one()
                if not lesson_info:
                    continue

                lesson_attachments = self.get_attachments_by_entity(
                    EntityType.LESSON.value, lesson_id, user_id
                )
                lesson_materials = [
                    self._to_aggregated_material(
                        a,
                        MaterialSource(
                            entity_type=EntityType.LESSON,
                            entity_id=lesson_id,
                            entity_title=lesson_info.title,
                        ),
                    )
                    for a in lesson_attachments
                ]

                if lesson_materials:
                    lessons_data.append(
                        LessonMaterialsGroup(
                            lesson_id=lesson_id,
                            lesson_title=lesson_info.title,
                            lesson_position=lesson_row.position,
                            materials=lesson_materials,
                        )
                    )

            modules_data.append(
                ModuleMaterialsGroup(
                    module_id=module_id,
                    module_title=module_info.title,
                    module_position=module_row.position,
                    module_materials=module_materials,
                    lessons=lessons_data,
                )
            )

        # Calculate totals
        all_materials = course_materials.copy()
        for module in modules_data:
            all_materials.extend(module.module_materials)
            for lesson in module.lessons:
                all_materials.extend(lesson.materials)

        total_downloaded = sum(1 for m in all_materials if m.has_downloaded)

        return CourseMaterialsResponse(
            course_id=course_id,
            course_title=course_row.title,
            course_materials=course_materials,
            modules=modules_data,
            total_materials=len(all_materials),
            total_downloaded=total_downloaded,
        )

    # ==============================================================================
    # Helper Methods
    # ==============================================================================

    def _verify_entity_exists(self, entity_type: str, entity_id: UUID) -> str | None:
        """Verify entity exists and return its title."""
        if entity_type == EntityType.LESSON.value:
            row = self.session.execute(self._get_lesson, (entity_id,)).one()
        elif entity_type == EntityType.MODULE.value:
            row = self.session.execute(self._get_module, (entity_id,)).one()
        else:
            row = self.session.execute(self._get_course, (entity_id,)).one()

        return row.title if row else None

    def _get_next_position(self, entity_type: str, entity_id: UUID) -> int:
        """Get next available position for an entity."""
        if entity_type == EntityType.LESSON.value:
            rows = self.session.execute(
                self._get_attachments_by_lesson, (entity_id,)
            ).all()
        elif entity_type == EntityType.MODULE.value:
            rows = self.session.execute(
                self._get_attachments_by_module, (entity_id,)
            ).all()
        else:
            rows = self.session.execute(
                self._get_attachments_by_course, (entity_id,)
            ).all()

        if not rows:
            return 0
        return max(row.position for row in rows) + 1

    def _insert_into_lookup_table(self, attachment: Attachment) -> None:
        """Insert attachment into appropriate lookup table."""
        if attachment.entity_type == EntityType.LESSON.value:
            self.session.execute(
                self._insert_attachment_by_lesson,
                (
                    attachment.entity_id,
                    attachment.position,
                    attachment.id,
                    attachment.title,
                    attachment.original_filename,
                    attachment.file_url,
                    attachment.file_size,
                    attachment.mime_type,
                    attachment.attachment_type,
                    attachment.created_at,
                ),
            )
        elif attachment.entity_type == EntityType.MODULE.value:
            self.session.execute(
                self._insert_attachment_by_module,
                (
                    attachment.entity_id,
                    attachment.position,
                    attachment.id,
                    attachment.title,
                    attachment.original_filename,
                    attachment.file_url,
                    attachment.file_size,
                    attachment.mime_type,
                    attachment.attachment_type,
                    attachment.created_at,
                ),
            )
        else:
            self.session.execute(
                self._insert_attachment_by_course,
                (
                    attachment.entity_id,
                    attachment.position,
                    attachment.id,
                    attachment.title,
                    attachment.original_filename,
                    attachment.file_url,
                    attachment.file_size,
                    attachment.mime_type,
                    attachment.attachment_type,
                    attachment.created_at,
                ),
            )

    def _delete_from_lookup_table(self, attachment: Attachment) -> None:
        """Delete attachment from lookup table."""
        self._delete_from_lookup_table_by_ids(
            attachment.entity_type,
            attachment.entity_id,
            attachment.position,
            attachment.id,
        )

    def _delete_from_lookup_table_by_ids(
        self,
        entity_type: str,
        entity_id: UUID,
        position: int,
        attachment_id: UUID,
    ) -> None:
        """Delete from lookup table by IDs."""
        if entity_type == EntityType.LESSON.value:
            self.session.execute(
                self._delete_attachment_by_lesson,
                (entity_id, position, attachment_id),
            )
        elif entity_type == EntityType.MODULE.value:
            self.session.execute(
                self._delete_attachment_by_module,
                (entity_id, position, attachment_id),
            )
        else:
            self.session.execute(
                self._delete_attachment_by_course,
                (entity_id, position, attachment_id),
            )

    def _get_user_downloads(
        self,
        user_id: UUID,
        attachment_ids: list[UUID],
    ) -> list[UserAttachmentDownload]:
        """Get user download records for multiple attachments."""
        results = []
        for attachment_id in attachment_ids:
            row = self.session.execute(
                self._get_user_download, (user_id, attachment_id)
            ).one()
            if row:
                results.append(UserAttachmentDownload.from_row(row))
        return results

    def _to_aggregated_material(
        self,
        attachment: AttachmentWithDownloadStatus,
        source: MaterialSource,
    ) -> AggregatedMaterial:
        """Convert attachment to aggregated material."""
        return AggregatedMaterial(
            id=attachment.id,
            title=attachment.title,
            description=attachment.description,
            original_filename=attachment.original_filename,
            file_url=attachment.file_url,
            file_size=attachment.file_size,
            mime_type=attachment.mime_type,
            attachment_type=attachment.attachment_type,
            download_count=attachment.download_count,
            created_at=attachment.created_at,
            source=source,
            has_downloaded=attachment.has_downloaded,
            last_downloaded_at=attachment.last_downloaded_at,
        )
