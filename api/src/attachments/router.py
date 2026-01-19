"""Attachments API endpoints.

Provides routes for:
- Attachment CRUD operations
- File upload to Firebase Storage
- Download tracking
- Aggregated materials for courses
"""

from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from src.attachments.dependencies import AttachmentsServiceDep
from src.attachments.schemas import (
    AttachmentListWithDownloadStatus,
    AttachmentResponse,
    AttachmentUploadResponse,
    CourseMaterialsResponse,
    EntityType,
    MessageResponse,
    ReorderAttachmentsRequest,
    UpdateAttachmentRequest,
)
from src.attachments.service import (
    AttachmentError,
    EntityNotFoundError,
    UploadError,
)
from src.auth.dependencies import CurrentUser, OptionalUser, TeacherUser
from src.auth.permissions import UserRole


router = APIRouter(prefix="/v1/attachments", tags=["attachments"])


# ==============================================================================
# Error Handling
# ==============================================================================


def handle_attachment_error(error: AttachmentError) -> HTTPException:
    """Convert AttachmentError to HTTPException."""
    status_map = {
        "attachment_not_found": status.HTTP_404_NOT_FOUND,
        "entity_not_found": status.HTTP_404_NOT_FOUND,
        "upload_error": status.HTTP_500_INTERNAL_SERVER_ERROR,
        "permission_denied": status.HTTP_403_FORBIDDEN,
    }
    return HTTPException(
        status_code=status_map.get(error.code, status.HTTP_400_BAD_REQUEST),
        detail=error.message,
    )


# ==============================================================================
# Upload Endpoints
# ==============================================================================


@router.post(
    "/upload",
    response_model=AttachmentUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload attachment file",
)
async def upload_attachment(
    service: AttachmentsServiceDep,
    user: TeacherUser,
    file: UploadFile = File(..., description="File to upload"),
    entity_type: EntityType = Form(..., description="Type of parent entity"),
    entity_id: UUID = Form(..., description="ID of parent entity"),
    title: str | None = Form(None, description="Display title (defaults to filename)"),
    description: str | None = Form(None, description="Optional description"),
    position: int | None = Form(None, description="Order position"),
) -> AttachmentUploadResponse:
    """Upload a new attachment file.

    Uploads file to Firebase Storage and creates attachment record.
    Requires TEACHER or ADMIN role.
    """
    # Read file content
    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arquivo vazio",
        )

    # Get content type
    content_type = file.content_type or "application/octet-stream"
    original_filename = file.filename or "unnamed"

    try:
        # Create request object
        from src.attachments.schemas import CreateAttachmentRequest

        request = CreateAttachmentRequest(
            title=title,
            description=description,
            entity_type=entity_type,
            entity_id=entity_id,
            position=position,
        )

        attachment = await service.create_attachment(
            content=content,
            content_type=content_type,
            original_filename=original_filename,
            request=request,
            creator_id=UUID(str(user.id)),
        )

        return AttachmentUploadResponse(
            success=True,
            attachment=AttachmentResponse.model_validate(attachment.to_dict()),
            message="Anexo enviado com sucesso",
        )

    except EntityNotFoundError as e:
        raise handle_attachment_error(e) from e
    except UploadError as e:
        raise handle_attachment_error(e) from e
    except AttachmentError as e:
        raise handle_attachment_error(e) from e


# ==============================================================================
# CRUD Endpoints
# ==============================================================================


@router.get(
    "/{attachment_id}",
    response_model=AttachmentResponse,
    summary="Get attachment by ID",
)
async def get_attachment(
    attachment_id: UUID,
    service: AttachmentsServiceDep,
) -> AttachmentResponse:
    """Get attachment details by ID."""
    attachment = service.get_attachment(attachment_id)
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anexo nao encontrado",
        )
    return AttachmentResponse.model_validate(attachment.to_dict())


@router.put(
    "/{attachment_id}",
    response_model=AttachmentResponse,
    summary="Update attachment metadata",
)
async def update_attachment(
    attachment_id: UUID,
    data: UpdateAttachmentRequest,
    service: AttachmentsServiceDep,
    user: TeacherUser,
) -> AttachmentResponse:
    """Update attachment metadata (title, description).

    Requires TEACHER or ADMIN role. Only creator or ADMIN can edit.
    """
    # Check permission
    attachment = service.get_attachment(attachment_id)
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anexo nao encontrado",
        )

    if not _can_edit_attachment(user, attachment.creator_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissao para editar este anexo",
        )

    try:
        updated = service.update_attachment(attachment_id, data)
        return AttachmentResponse.model_validate(updated.to_dict())
    except AttachmentError as e:
        raise handle_attachment_error(e) from e


@router.delete(
    "/{attachment_id}",
    response_model=MessageResponse,
    summary="Delete attachment",
)
async def delete_attachment(
    attachment_id: UUID,
    service: AttachmentsServiceDep,
    user: TeacherUser,
) -> MessageResponse:
    """Delete attachment and its file.

    Requires TEACHER or ADMIN role. Only creator or ADMIN can delete.
    """
    # Check permission
    attachment = service.get_attachment(attachment_id)
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anexo nao encontrado",
        )

    if not _can_edit_attachment(user, attachment.creator_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissao para excluir este anexo",
        )

    try:
        await service.delete_attachment(attachment_id)
        return MessageResponse(message="Anexo excluido com sucesso")
    except AttachmentError as e:
        raise handle_attachment_error(e) from e


# ==============================================================================
# List Endpoints
# ==============================================================================


@router.get(
    "/by-entity/{entity_type}/{entity_id}",
    response_model=AttachmentListWithDownloadStatus,
    summary="List attachments for entity",
)
async def list_attachments_by_entity(
    entity_type: EntityType,
    entity_id: UUID,
    service: AttachmentsServiceDep,
    user: OptionalUser,
) -> AttachmentListWithDownloadStatus:
    """List all attachments for a lesson, module, or course.

    Includes download status if user is authenticated.
    """
    user_id = UUID(str(user.id)) if user else None
    attachments = service.get_attachments_by_entity(
        entity_type=entity_type.value,
        entity_id=entity_id,
        user_id=user_id,
    )
    return AttachmentListWithDownloadStatus(
        items=attachments,
        total=len(attachments),
    )


# ==============================================================================
# Reorder Endpoints
# ==============================================================================


@router.put(
    "/by-entity/{entity_type}/{entity_id}/reorder",
    response_model=MessageResponse,
    summary="Reorder attachments",
)
async def reorder_attachments(
    entity_type: EntityType,
    entity_id: UUID,
    data: ReorderAttachmentsRequest,
    service: AttachmentsServiceDep,
    user: TeacherUser,
) -> MessageResponse:
    """Reorder attachments within an entity.

    Requires TEACHER or ADMIN role.
    """
    service.reorder_attachments(
        entity_type=entity_type.value,
        entity_id=entity_id,
        attachment_ids=data.items,
    )
    return MessageResponse(message="Anexos reordenados com sucesso")


# ==============================================================================
# Download Tracking Endpoints
# ==============================================================================


@router.post(
    "/{attachment_id}/download",
    response_model=MessageResponse,
    summary="Record download",
)
async def record_download(
    attachment_id: UUID,
    service: AttachmentsServiceDep,
    user: CurrentUser,
) -> MessageResponse:
    """Record that user downloaded an attachment.

    Called when user clicks download button.
    Returns whether this was the first download.
    """
    # Verify attachment exists
    attachment = service.get_attachment(attachment_id)
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anexo nao encontrado",
        )

    is_first = service.record_download(
        attachment_id=attachment_id,
        user_id=UUID(str(user.id)),
    )

    if is_first:
        return MessageResponse(message="Download registrado (primeiro acesso)")
    return MessageResponse(message="Download registrado")


# ==============================================================================
# Aggregated Materials Endpoints
# ==============================================================================


@router.get(
    "/course/{course_id}/materials",
    response_model=CourseMaterialsResponse,
    summary="Get all course materials",
)
async def get_course_materials(
    course_id: UUID,
    service: AttachmentsServiceDep,
    user: OptionalUser,
) -> CourseMaterialsResponse:
    """Get all materials for a course, organized by module/lesson.

    Aggregates attachments from:
    - Course level
    - Module level
    - Lesson level

    Includes download status if user is authenticated.
    """
    user_id = UUID(str(user.id)) if user else None
    result = service.get_course_materials(course_id, user_id)

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Curso nao encontrado",
        )

    return result


# ==============================================================================
# Helper Functions
# ==============================================================================


def _can_edit_attachment(user: CurrentUser, creator_id: UUID | None) -> bool:
    """Check if user can edit/delete an attachment."""
    # Admin can edit anything
    if user.role == UserRole.ADMIN.value:
        return True

    # Creator can edit their own
    return bool(creator_id and str(user.id) == str(creator_id))
