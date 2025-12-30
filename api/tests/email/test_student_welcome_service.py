"""Tests for student welcome email service method.

TDD RED Phase tests for EmailService.send_student_welcome_credentials.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestStudentWelcomeService:
    """Tests for send_student_welcome_credentials service method."""

    @pytest.fixture
    def mock_email_service(self):
        """Create a mock EmailService with send_simple_email mocked."""
        from src.email.service import EmailService

        with patch.object(EmailService, "_get_service"):
            service = EmailService(
                credentials_path="/fake/path.json",
                sender_address="test@farmaeasy.com.br",
            )

            # Mock send_simple_email to return success
            service.send_simple_email = AsyncMock(
                return_value=MagicMock(success=True, message_id="msg123")
            )

            return service

    @pytest.mark.asyncio
    async def test_send_student_welcome_credentials_success(
        self,
        mock_email_service,
    ) -> None:
        """Should successfully send welcome email with credentials."""
        result = await mock_email_service.send_student_welcome_credentials(
            to="student@test.com",
            user_name="Maria Silva",
            password="TempPass123!",
        )

        assert result.success is True
        mock_email_service.send_simple_email.assert_called_once()

    @pytest.mark.asyncio
    async def test_send_student_welcome_credentials_includes_email(
        self,
        mock_email_service,
    ) -> None:
        """Email should be sent to correct address."""
        await mock_email_service.send_student_welcome_credentials(
            to="student@test.com",
            user_name="Maria Silva",
            password="TempPass123!",
        )

        call_kwargs = mock_email_service.send_simple_email.call_args.kwargs
        assert call_kwargs["to"] == "student@test.com"

    @pytest.mark.asyncio
    async def test_send_student_welcome_credentials_subject(
        self,
        mock_email_service,
    ) -> None:
        """Email should have appropriate subject."""
        await mock_email_service.send_student_welcome_credentials(
            to="student@test.com",
            user_name="Maria Silva",
            password="TempPass123!",
        )

        call_kwargs = mock_email_service.send_simple_email.call_args.kwargs
        assert (
            "Bem-vindo" in call_kwargs["subject"]
            or "boas-vindas" in call_kwargs["subject"].lower()
        )
        assert "FarmaEasy" in call_kwargs["subject"]

    @pytest.mark.asyncio
    async def test_send_student_welcome_credentials_with_course(
        self,
        mock_email_service,
    ) -> None:
        """Should include course info when provided."""
        await mock_email_service.send_student_welcome_credentials(
            to="student@test.com",
            user_name="Maria Silva",
            password="TempPass123!",
            course_name="Farmácia Clínica",
            teacher_name="Prof. João",
        )

        call_kwargs = mock_email_service.send_simple_email.call_args.kwargs
        # HTML should contain course info
        assert "Farmácia Clínica" in call_kwargs["body_html"]
        assert "Prof. João" in call_kwargs["body_html"]

    @pytest.mark.asyncio
    async def test_send_student_welcome_credentials_without_course(
        self,
        mock_email_service,
    ) -> None:
        """Should work without course info."""
        result = await mock_email_service.send_student_welcome_credentials(
            to="student@test.com",
            user_name="Maria Silva",
            password="TempPass123!",
        )

        assert result.success is True

    @pytest.mark.asyncio
    async def test_send_student_welcome_credentials_html_contains_password(
        self,
        mock_email_service,
    ) -> None:
        """HTML body should contain the password."""
        await mock_email_service.send_student_welcome_credentials(
            to="student@test.com",
            user_name="Maria Silva",
            password="TempPass123!",
        )

        call_kwargs = mock_email_service.send_simple_email.call_args.kwargs
        assert "TempPass123!" in call_kwargs["body_html"]

    @pytest.mark.asyncio
    async def test_send_student_welcome_credentials_text_fallback(
        self,
        mock_email_service,
    ) -> None:
        """Should include plain text fallback."""
        await mock_email_service.send_student_welcome_credentials(
            to="student@test.com",
            user_name="Maria Silva",
            password="TempPass123!",
        )

        call_kwargs = mock_email_service.send_simple_email.call_args.kwargs
        assert call_kwargs["body_text"] is not None
        assert "TempPass123!" in call_kwargs["body_text"]
