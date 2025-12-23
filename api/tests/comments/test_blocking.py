"""Tests for user comment blocking functionality.

TDD implementation of:
- block_user
- unblock_user
- is_user_blocked
- get_user_blocks
"""

import html
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, Mock
from uuid import UUID, uuid4

import pytest
from cassandra.cluster import Session

from src.comments.models import UserCommentBlock, create_user_block
from src.comments.schemas import (
    BlockUserRequest,
    UserBlockResponse,
)
from src.comments.service import CommentService


@pytest.fixture
def mock_session():
    """Mock Cassandra session."""
    return Mock(spec=Session)


@pytest.fixture
def mock_redis():
    """Mock Redis client."""
    redis_mock = AsyncMock()
    # Mock pipeline for rate limiting
    mock_pipe = Mock()
    mock_pipe.incr = Mock()
    mock_pipe.expire = Mock()
    mock_pipe.execute = AsyncMock(return_value=[1, True])
    redis_mock.pipeline = Mock(return_value=mock_pipe)
    redis_mock.get = AsyncMock(return_value=None)
    return redis_mock


@pytest.fixture
def comment_service(mock_session, mock_redis):
    """Create CommentService instance with mocked dependencies."""
    service = CommentService(
        session=mock_session, keyspace="test_keyspace", redis=mock_redis
    )
    # Mock prepare to avoid actual statement preparation
    mock_session.prepare = Mock(return_value=Mock())
    # Make aexecute awaitable by returning AsyncMock (cassandra-asyncio-driver)
    mock_session.aexecute = AsyncMock(return_value=Mock())
    return service


@pytest.fixture
def user_id() -> UUID:
    """Test user ID."""
    return uuid4()


@pytest.fixture
def moderator_id() -> UUID:
    """Test moderator ID."""
    return uuid4()


@pytest.fixture
def block_request() -> BlockUserRequest:
    """Test block request."""
    return BlockUserRequest(
        reason="Comportamento inadequado",
        moderator_notes="Usuario postou spam repetidamente",
        duration_days=7,
    )


class TestBlockUser:
    """Tests for block_user method."""

    @pytest.mark.asyncio
    async def test_block_user_creates_block_record(
        self,
        comment_service: CommentService,
        mock_session: Session,
        user_id: UUID,
        moderator_id: UUID,
        block_request: BlockUserRequest,
    ):
        """Should create a block record in database."""
        # Arrange - mock no existing block for security check
        mock_result_no_block = Mock()
        mock_result_no_block.one.return_value = None
        mock_session.aexecute.return_value = mock_result_no_block

        # Act
        result = await comment_service.block_user(
            user_id=user_id,
            moderator_id=moderator_id,
            reason=block_request.reason,
            moderator_notes=block_request.moderator_notes,
            duration_days=block_request.duration_days,
        )

        # Assert
        assert result.user_id == user_id
        assert result.blocked_by == moderator_id
        assert result.reason == html.escape(block_request.reason)
        assert result.moderator_notes == html.escape(block_request.moderator_notes)
        assert result.is_permanent is False
        assert result.expires_at is not None
        assert result.is_active is True

        # Verify database was called (check + 3 inserts)
        assert mock_session.aexecute.call_count >= 1

    @pytest.mark.asyncio
    async def test_block_user_permanent_block(
        self,
        comment_service: CommentService,
        mock_session: Session,
        user_id: UUID,
        moderator_id: UUID,
    ):
        """Should create permanent block when duration_days is None."""
        # Arrange - mock no existing block
        mock_result_no_block = Mock()
        mock_result_no_block.one.return_value = None
        mock_session.aexecute.return_value = mock_result_no_block

        # Act
        result = await comment_service.block_user(
            user_id=user_id,
            moderator_id=moderator_id,
            reason="Violacao grave dos termos",
            duration_days=None,
        )

        # Assert
        assert result.is_permanent is True
        assert result.expires_at is None

    @pytest.mark.asyncio
    async def test_block_user_creates_moderator_log(
        self,
        comment_service: CommentService,
        mock_session: Session,
        user_id: UUID,
        moderator_id: UUID,
    ):
        """Should create log entry in moderator activity table."""
        # Arrange - mock no existing block
        mock_result_no_block = Mock()
        mock_result_no_block.one.return_value = None
        mock_session.aexecute.return_value = mock_result_no_block

        # Act
        await comment_service.block_user(
            user_id=user_id,
            moderator_id=moderator_id,
            reason="Test reason",
        )

        # Assert - should have 4 calls: check + user_blocks + moderator_log + audit_log
        assert mock_session.aexecute.call_count == 4


class TestUnblockUser:
    """Tests for unblock_user method."""

    @pytest.mark.asyncio
    async def test_unblock_user_removes_active_block(
        self,
        comment_service: CommentService,
        mock_session: Session,
        user_id: UUID,
        moderator_id: UUID,
    ):
        """Should mark block as inactive by setting expires_at to now."""
        block_id = uuid4()

        # Arrange - mock existing block
        mock_block = create_user_block(
            user_id=user_id,
            blocked_by=moderator_id,
            reason="Test",
            duration_days=7,
        )
        mock_block.block_id = block_id

        # Mock query to return the block
        mock_result = Mock()
        mock_result.one.return_value = mock_block
        mock_session.aexecute.return_value = mock_result

        # Act
        result = await comment_service.unblock_user(
            user_id=user_id,
            block_id=block_id,
            moderator_id=moderator_id,
            notes="Usuario se desculpou",
        )

        # Assert
        assert result is True
        # Should have 3 calls: select (check) + update + audit_log insert
        assert mock_session.aexecute.call_count == 3

    @pytest.mark.asyncio
    async def test_unblock_user_block_not_found(
        self,
        comment_service: CommentService,
        mock_session: Session,
        user_id: UUID,
    ):
        """Should return False if block doesn't exist."""
        # Arrange - mock no block found
        mock_result = Mock()
        mock_result.one.return_value = None
        mock_session.aexecute.return_value = mock_result

        # Act
        result = await comment_service.unblock_user(
            user_id=user_id,
            block_id=uuid4(),
            moderator_id=uuid4(),
        )

        # Assert
        assert result is False


class TestIsUserBlocked:
    """Tests for is_user_blocked method."""

    @pytest.mark.asyncio
    async def test_is_user_blocked_returns_true_for_active_block(
        self,
        comment_service: CommentService,
        mock_session: Session,
        user_id: UUID,
    ):
        """Should return True if user has active block."""
        # Arrange - mock active block
        future_expires = datetime.now(UTC) + timedelta(days=1)
        mock_block = UserCommentBlock(
            user_id=user_id,
            block_id=uuid4(),
            blocked_at=datetime.now(UTC),
            blocked_by=uuid4(),
            reason="Test",
            is_permanent=False,
            expires_at=future_expires,
        )

        mock_result = Mock()
        mock_result.one.return_value = mock_block
        mock_session.aexecute.return_value = mock_result

        # Act
        is_blocked = await comment_service.is_user_blocked(user_id)

        # Assert
        assert is_blocked is True

    @pytest.mark.asyncio
    async def test_is_user_blocked_returns_false_for_expired_block(
        self,
        comment_service: CommentService,
        mock_session: Session,
        user_id: UUID,
    ):
        """Should return False if block has expired."""
        # Arrange - mock expired block
        past_expires = datetime.now(UTC) - timedelta(days=1)
        mock_block = UserCommentBlock(
            user_id=user_id,
            block_id=uuid4(),
            blocked_at=datetime.now(UTC) - timedelta(days=8),
            blocked_by=uuid4(),
            reason="Test",
            is_permanent=False,
            expires_at=past_expires,
        )

        mock_result = Mock()
        mock_result.one.return_value = mock_block
        mock_session.aexecute.return_value = mock_result

        # Act
        is_blocked = await comment_service.is_user_blocked(user_id)

        # Assert
        assert is_blocked is False

    @pytest.mark.asyncio
    async def test_is_user_blocked_returns_true_for_permanent_block(
        self,
        comment_service: CommentService,
        mock_session: Session,
        user_id: UUID,
    ):
        """Should return True for permanent block."""
        # Arrange - mock permanent block
        mock_block = UserCommentBlock(
            user_id=user_id,
            block_id=uuid4(),
            blocked_at=datetime.now(UTC),
            blocked_by=uuid4(),
            reason="Permanent ban",
            is_permanent=True,
            expires_at=None,
        )

        mock_result = Mock()
        mock_result.one.return_value = mock_block
        mock_session.aexecute.return_value = mock_result

        # Act
        is_blocked = await comment_service.is_user_blocked(user_id)

        # Assert
        assert is_blocked is True

    @pytest.mark.asyncio
    async def test_is_user_blocked_returns_false_for_no_blocks(
        self,
        comment_service: CommentService,
        mock_session: Session,
        user_id: UUID,
    ):
        """Should return False if user has no blocks."""
        # Arrange - mock no blocks found
        mock_result = Mock()
        mock_result.one.return_value = None
        mock_session.aexecute.return_value = mock_result

        # Act
        is_blocked = await comment_service.is_user_blocked(user_id)

        # Assert
        assert is_blocked is False


class TestGetUserBlocks:
    """Tests for get_user_blocks method."""

    @pytest.mark.asyncio
    async def test_get_user_blocks_returns_all_blocks(
        self,
        comment_service: CommentService,
        mock_session: Session,
        user_id: UUID,
    ):
        """Should return all blocks for a user."""
        # Arrange - mock multiple blocks
        blocks = [
            UserCommentBlock(
                user_id=user_id,
                block_id=uuid4(),
                blocked_at=datetime.now(UTC),
                blocked_by=uuid4(),
                reason=f"Reason {i}",
                is_permanent=i == 0,
                expires_at=None if i == 0 else datetime.now(UTC) + timedelta(days=7),
            )
            for i in range(3)
        ]

        mock_result = Mock()
        mock_result.all.return_value = blocks
        mock_session.aexecute.return_value = mock_result

        # Act
        result = await comment_service.get_user_blocks(user_id, limit=10)

        # Assert
        assert len(result.items) == 3
        assert result.total == 3
        assert all(isinstance(item, UserBlockResponse) for item in result.items)

    @pytest.mark.asyncio
    async def test_get_user_blocks_pagination(
        self,
        comment_service: CommentService,
        mock_session: Session,
        user_id: UUID,
    ):
        """Should respect pagination limit."""
        # Arrange
        blocks = [
            UserCommentBlock(
                user_id=user_id,
                block_id=uuid4(),
                blocked_at=datetime.now(UTC),
                blocked_by=uuid4(),
                reason=f"Reason {i}",
                is_permanent=False,
                expires_at=datetime.now(UTC) + timedelta(days=7),
            )
            for i in range(10)
        ]

        mock_result = Mock()
        mock_result.all.return_value = blocks[:6]  # Return 6 to trigger has_more
        mock_session.aexecute.return_value = mock_result

        # Act
        result = await comment_service.get_user_blocks(user_id, limit=5)

        # Assert
        assert len(result.items) == 5
        assert result.has_more is True


class TestBlockingSecurityValidations:
    """Tests for security validations in blocking system."""

    @pytest.mark.asyncio
    async def test_block_user_prevents_self_blocking(
        self,
        comment_service: CommentService,
        user_id: UUID,
    ):
        """Should prevent moderator from blocking themselves."""
        from fastapi import HTTPException

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await comment_service.block_user(
                user_id=user_id,
                moderator_id=user_id,  # Same as user_id
                reason="Test reason",
            )

        assert exc_info.value.status_code == 400
        assert "auto-bloquear" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_block_user_prevents_double_blocking(
        self,
        comment_service: CommentService,
        mock_session: Session,
        user_id: UUID,
        moderator_id: UUID,
    ):
        """Should prevent blocking user who already has active block."""
        from fastapi import HTTPException

        # Arrange - mock existing active block
        future_expires = datetime.now(UTC) + timedelta(days=1)
        mock_block = UserCommentBlock(
            user_id=user_id,
            block_id=uuid4(),
            blocked_at=datetime.now(UTC),
            blocked_by=moderator_id,
            reason="Previous block",
            is_permanent=False,
            expires_at=future_expires,
        )

        mock_result = Mock()
        mock_result.one.return_value = mock_block
        mock_session.aexecute.return_value = mock_result

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await comment_service.block_user(
                user_id=user_id,
                moderator_id=moderator_id,
                reason="New block attempt",
            )

        assert exc_info.value.status_code == 409
        assert "bloqueio ativo" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_block_user_sanitizes_text_inputs(
        self,
        comment_service: CommentService,
        mock_session: Session,
        user_id: UUID,
        moderator_id: UUID,
    ):
        """Should sanitize reason and notes to prevent XSS."""
        # Arrange - mock no existing block
        mock_result_no_block = Mock()
        mock_result_no_block.one.return_value = None
        mock_session.aexecute.return_value = mock_result_no_block

        # Act
        result = await comment_service.block_user(
            user_id=user_id,
            moderator_id=moderator_id,
            reason='<script>alert("xss")</script>Spam',
            moderator_notes='<img src=x onerror="alert(1)">Notes',
        )

        # Assert - HTML should be escaped
        assert "<script>" not in result.reason
        assert "&lt;script&gt;" in result.reason
        assert "<img" not in result.moderator_notes
        assert "&lt;img" in result.moderator_notes


class TestBlockingIntegration:
    """Tests for blocking integration with comment creation."""

    @pytest.mark.asyncio
    async def test_blocked_user_cannot_create_comment(
        self,
        comment_service: CommentService,
        mock_session: Session,
        user_id: UUID,
    ):
        """Should raise HTTPException 403 if user is blocked."""
        from fastapi import HTTPException

        # Arrange - mock active block
        future_expires = datetime.now(UTC) + timedelta(days=1)
        mock_block = UserCommentBlock(
            user_id=user_id,
            block_id=uuid4(),
            blocked_at=datetime.now(UTC),
            blocked_by=uuid4(),
            reason="Spam",
            is_permanent=False,
            expires_at=future_expires,
        )

        mock_result = Mock()
        mock_result.one.return_value = mock_block
        mock_session.aexecute.return_value = mock_result

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await comment_service.create_comment(
                lesson_id=uuid4(),
                author_id=user_id,
                author_name="Test User",
                content="Test comment",
                parent_id=None,
            )

        assert exc_info.value.status_code == 403
        assert "bloqueado" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_user_with_expired_block_can_create_comment(
        self,
        comment_service: CommentService,
        mock_session: Session,
        user_id: UUID,
    ):
        """Should allow comment creation if block has expired."""
        # Arrange - mock expired block
        past_expires = datetime.now(UTC) - timedelta(days=1)
        mock_block = UserCommentBlock(
            user_id=user_id,
            block_id=uuid4(),
            blocked_at=datetime.now(UTC) - timedelta(days=8),
            blocked_by=uuid4(),
            reason="Test",
            is_permanent=False,
            expires_at=past_expires,
        )

        # Mock for is_user_blocked check (returns expired block)
        mock_result_block = Mock()
        mock_result_block.one.return_value = mock_block

        # Mock for comment creation (returns new comment)
        mock_comment = Mock()
        mock_comment.comment_id = uuid4()
        mock_result_comment = Mock()
        mock_result_comment.one.return_value = mock_comment

        # Setup multiple execute_async calls
        mock_session.aexecute.side_effect = [
            mock_result_block,  # First call: check block
            mock_result_comment,  # Second call: create comment
        ]

        # Act - should not raise exception
        result = await comment_service.create_comment(
            lesson_id=uuid4(),
            author_id=user_id,
            author_name="Test User",
            content="Test comment",
            parent_id=None,
        )

        # Assert - comment was created
        assert result is not None

    @pytest.mark.asyncio
    async def test_user_without_blocks_can_create_comment(
        self,
        comment_service: CommentService,
        mock_session: Session,
        user_id: UUID,
    ):
        """Should allow comment creation if user has no blocks."""
        # Arrange - mock no blocks
        mock_result_no_block = Mock()
        mock_result_no_block.one.return_value = None

        # Mock for comment creation
        mock_comment = Mock()
        mock_comment.comment_id = uuid4()
        mock_result_comment = Mock()
        mock_result_comment.one.return_value = mock_comment

        # Setup multiple execute_async calls
        mock_session.aexecute.side_effect = [
            mock_result_no_block,  # First call: check block
            mock_result_comment,  # Second call: create comment
        ]

        # Act - should not raise exception
        result = await comment_service.create_comment(
            lesson_id=uuid4(),
            author_id=user_id,
            author_name="Test User",
            content="Test comment",
            parent_id=None,
        )

        # Assert - comment was created
        assert result is not None

    @pytest.mark.asyncio
    async def test_permanently_blocked_user_cannot_create_comment(
        self,
        comment_service: CommentService,
        mock_session: Session,
        user_id: UUID,
    ):
        """Should raise HTTPException 403 if user has permanent block."""
        from fastapi import HTTPException

        # Arrange - mock permanent block
        mock_block = UserCommentBlock(
            user_id=user_id,
            block_id=uuid4(),
            blocked_at=datetime.now(UTC),
            blocked_by=uuid4(),
            reason="Permanent ban",
            is_permanent=True,
            expires_at=None,
        )

        mock_result = Mock()
        mock_result.one.return_value = mock_block
        mock_session.aexecute.return_value = mock_result

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await comment_service.create_comment(
                lesson_id=uuid4(),
                author_id=user_id,
                author_name="Test User",
                content="Test comment",
                parent_id=None,
            )

        assert exc_info.value.status_code == 403
        assert "bloqueado" in exc_info.value.detail.lower()
