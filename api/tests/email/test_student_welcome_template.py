"""Tests for student welcome email template.

TDD RED Phase tests for the welcome email sent when
a teacher creates a new student account.
"""

from datetime import datetime


class TestStudentWelcomeTemplate:
    """Tests for render_student_welcome template function."""

    def test_template_renders_html_and_text(self) -> None:
        """Template should return both HTML and plain text versions."""
        from src.email.templates import render_student_welcome

        html, text = render_student_welcome(
            user_name="Maria Silva",
            email="maria@test.com",
            password="TempPass123!",
            course_name="Farmácia Clínica",
            teacher_name="Prof. João",
        )

        assert isinstance(html, str)
        assert isinstance(text, str)
        assert len(html) > 0
        assert len(text) > 0

    def test_html_contains_user_name(self) -> None:
        """HTML should contain the user's name."""
        from src.email.templates import render_student_welcome

        html, _ = render_student_welcome(
            user_name="Maria Silva",
            email="maria@test.com",
            password="TempPass123!",
            course_name=None,
            teacher_name=None,
        )

        assert "Maria Silva" in html

    def test_html_contains_credentials(self) -> None:
        """HTML should contain email and password credentials."""
        from src.email.templates import render_student_welcome

        html, _ = render_student_welcome(
            user_name="Maria Silva",
            email="maria@test.com",
            password="TempPass123!",
            course_name=None,
            teacher_name=None,
        )

        assert "maria@test.com" in html
        assert "TempPass123!" in html

    def test_html_contains_course_info_when_provided(self) -> None:
        """HTML should include course info when course_name is provided."""
        from src.email.templates import render_student_welcome

        html, _ = render_student_welcome(
            user_name="Maria Silva",
            email="maria@test.com",
            password="TempPass123!",
            course_name="Farmácia Clínica",
            teacher_name="Prof. João",
        )

        assert "Farmácia Clínica" in html
        assert "Prof. João" in html

    def test_html_omits_course_section_when_not_provided(self) -> None:
        """HTML should not include course section when course_name is None."""
        from src.email.templates import render_student_welcome

        html, _ = render_student_welcome(
            user_name="Maria Silva",
            email="maria@test.com",
            password="TempPass123!",
            course_name=None,
            teacher_name=None,
        )

        # Should not mention "acesso ao curso" or course section
        assert "Você já tem acesso ao curso" not in html

    def test_plain_text_contains_credentials(self) -> None:
        """Plain text should contain email and password."""
        from src.email.templates import render_student_welcome

        _, text = render_student_welcome(
            user_name="Maria Silva",
            email="maria@test.com",
            password="TempPass123!",
            course_name=None,
            teacher_name=None,
        )

        assert "maria@test.com" in text
        assert "TempPass123!" in text

    def test_plain_text_contains_password_change_warning(self) -> None:
        """Plain text should warn about changing password."""
        from src.email.templates import render_student_welcome

        _, text = render_student_welcome(
            user_name="Maria Silva",
            email="maria@test.com",
            password="TempPass123!",
            course_name=None,
            teacher_name=None,
        )

        # Should mention changing password
        assert "senha" in text.lower()
        assert any(
            word in text.lower() for word in ["alterar", "trocar", "primeiro acesso"]
        )

    def test_html_uses_base_template(self) -> None:
        """HTML should use the FarmaEasy base template."""
        from src.email.templates import render_student_welcome

        html, _ = render_student_welcome(
            user_name="Maria Silva",
            email="maria@test.com",
            password="TempPass123!",
            course_name=None,
            teacher_name=None,
        )

        # Base template includes FarmaEasy branding
        assert "FarmaEasy" in html
        assert "farmaeasy.com.br" in html

    def test_html_contains_current_year(self) -> None:
        """HTML footer should contain current year."""
        from src.email.templates import render_student_welcome

        html, _ = render_student_welcome(
            user_name="Maria Silva",
            email="maria@test.com",
            password="TempPass123!",
            course_name=None,
            teacher_name=None,
        )

        current_year = str(datetime.now().year)
        assert current_year in html

    def test_plain_text_contains_course_info_when_provided(self) -> None:
        """Plain text should include course info when provided."""
        from src.email.templates import render_student_welcome

        _, text = render_student_welcome(
            user_name="Maria Silva",
            email="maria@test.com",
            password="TempPass123!",
            course_name="Farmácia Clínica",
            teacher_name="Prof. João",
        )

        assert "Farmácia Clínica" in text
        assert "Prof. João" in text
