"""Tests for auth validators."""

import pytest

from src.auth.validators import (
    CPF_DIGIT_LENGTH,
    DDD_MAX,
    DDD_MIN,
    PASSWORD_MIN_LENGTH,
    PHONE_DIGIT_LENGTH,
    format_cpf,
    format_phone,
    normalize_cpf,
    normalize_phone,
    validate_cpf,
    validate_password,
    validate_phone,
)


class TestValidateCPF:
    """Tests for CPF validation."""

    @pytest.mark.parametrize(
        "cpf",
        [
            "529.982.247-25",  # With formatting
            "52998224725",  # Without formatting
            "529 982 247 25",  # With spaces
        ],
    )
    def test_valid_cpf(self, cpf: str) -> None:
        """Valid CPFs should pass validation."""
        result = validate_cpf(cpf)
        assert result.valid is True
        assert result.message is None
        assert result.formatted == "529.982.247-25"

    @pytest.mark.parametrize(
        "cpf,expected_message",
        [
            ("", "CPF deve ter 11 digitos"),
            ("123", "CPF deve ter 11 digitos"),
            ("1234567890", "CPF deve ter 11 digitos"),  # 10 digits
            ("123456789012", "CPF deve ter 11 digitos"),  # 12 digits
            ("111.111.111-11", "CPF invalido"),  # All same digit
            ("000.000.000-00", "CPF invalido"),
            ("999.999.999-99", "CPF invalido"),
            ("529.982.247-26", "CPF invalido"),  # Wrong check digit
            ("529.982.247-24", "CPF invalido"),  # Wrong check digit
        ],
    )
    def test_invalid_cpf(self, cpf: str, expected_message: str) -> None:
        """Invalid CPFs should fail with appropriate message."""
        result = validate_cpf(cpf)
        assert result.valid is False
        assert result.message == expected_message
        assert result.formatted is None


class TestNormalizeCPF:
    """Tests for CPF normalization."""

    def test_removes_formatting(self) -> None:
        """Should remove dots, dashes, and spaces."""
        assert normalize_cpf("529.982.247-25") == "52998224725"
        assert normalize_cpf("529 982 247 25") == "52998224725"

    def test_already_normalized(self) -> None:
        """Should return same if already normalized."""
        assert normalize_cpf("52998224725") == "52998224725"


class TestFormatCPF:
    """Tests for CPF formatting."""

    def test_format_valid_cpf(self) -> None:
        """Should format valid CPF correctly."""
        assert format_cpf("52998224725") == "529.982.247-25"

    def test_format_already_formatted(self) -> None:
        """Should return same if already formatted."""
        assert format_cpf("529.982.247-25") == "529.982.247-25"

    def test_format_invalid_length(self) -> None:
        """Should return original if invalid length."""
        assert format_cpf("123") == "123"
        assert format_cpf("1234567890123") == "1234567890123"


class TestValidatePhone:
    """Tests for phone validation."""

    @pytest.mark.parametrize(
        "phone",
        [
            "(11) 98765-4321",  # With formatting
            "11987654321",  # Without formatting
            "11 98765 4321",  # With spaces
        ],
    )
    def test_valid_phone(self, phone: str) -> None:
        """Valid phones should pass validation."""
        result = validate_phone(phone)
        assert result.valid is True
        assert result.message is None
        assert result.formatted == "(11) 98765-4321"

    def test_valid_ddd_range(self) -> None:
        """All valid DDDs should be accepted."""
        # Test min DDD
        result = validate_phone(f"{DDD_MIN}987654321")
        assert result.valid is True

        # Test max DDD
        result = validate_phone(f"{DDD_MAX}987654321")
        assert result.valid is True

    @pytest.mark.parametrize(
        "phone,expected_message",
        [
            ("", "Telefone deve ter 11 digitos"),
            ("123", "Telefone deve ter 11 digitos"),
            ("1234567890", "Telefone deve ter 11 digitos"),  # 10 digits
            ("123456789012", "Telefone deve ter 11 digitos"),  # 12 digits
            ("10987654321", "DDD invalido"),  # DDD < 11
            ("00987654321", "DDD invalido"),  # DDD = 00
            (
                "11887654321",
                "Numero de celular deve comecar com 9",
            ),  # Not starting with 9
            (
                "11087654321",
                "Numero de celular deve comecar com 9",
            ),  # Not starting with 9
        ],
    )
    def test_invalid_phone(self, phone: str, expected_message: str) -> None:
        """Invalid phones should fail with appropriate message."""
        result = validate_phone(phone)
        assert result.valid is False
        assert result.message == expected_message
        assert result.formatted is None


class TestNormalizePhone:
    """Tests for phone normalization."""

    def test_removes_formatting(self) -> None:
        """Should remove parentheses, dashes, and spaces."""
        assert normalize_phone("(11) 98765-4321") == "11987654321"
        assert normalize_phone("11 98765 4321") == "11987654321"

    def test_already_normalized(self) -> None:
        """Should return same if already normalized."""
        assert normalize_phone("11987654321") == "11987654321"


class TestFormatPhone:
    """Tests for phone formatting."""

    def test_format_valid_phone(self) -> None:
        """Should format valid phone correctly."""
        assert format_phone("11987654321") == "(11) 98765-4321"

    def test_format_already_formatted(self) -> None:
        """Should return same if already formatted."""
        assert format_phone("(11) 98765-4321") == "(11) 98765-4321"

    def test_format_invalid_length(self) -> None:
        """Should return original if invalid length."""
        assert format_phone("123") == "123"
        assert format_phone("1234567890123") == "1234567890123"


class TestValidatePassword:
    """Tests for password validation."""

    @pytest.mark.parametrize(
        "password",
        [
            "Abc123!@",
            "StrongP@ss1",
            "MyP@ssw0rd!",
            "Test#12345",
        ],
    )
    def test_valid_password(self, password: str) -> None:
        """Valid passwords should pass all checks."""
        result = validate_password(password)
        assert result.valid is True
        assert result.message is None

    @pytest.mark.parametrize(
        "password,expected_message",
        [
            ("short", "Senha deve ter no minimo 8 caracteres"),
            ("Abc12!", "Senha deve ter no minimo 8 caracteres"),  # 6 chars
            ("a" * (PASSWORD_MIN_LENGTH - 1), "Senha deve ter no minimo 8 caracteres"),
            ("lowercase1!", "Senha deve ter pelo menos uma letra maiuscula"),
            ("UPPERCASE1!", "Senha deve ter pelo menos uma letra minuscula"),
            ("NoNumbers!!", "Senha deve ter pelo menos um numero"),
            ("NoSpecial123", "Senha deve ter pelo menos um caractere especial"),
        ],
    )
    def test_invalid_password(self, password: str, expected_message: str) -> None:
        """Invalid passwords should fail with appropriate message."""
        result = validate_password(password)
        assert result.valid is False
        assert result.message == expected_message


class TestConstants:
    """Tests for validator constants."""

    def test_cpf_digit_length(self) -> None:
        """CPF should have 11 digits."""
        assert CPF_DIGIT_LENGTH == 11

    def test_phone_digit_length(self) -> None:
        """Phone should have 11 digits."""
        assert PHONE_DIGIT_LENGTH == 11

    def test_ddd_range(self) -> None:
        """DDD range should be valid."""
        assert DDD_MIN == 11
        assert DDD_MAX == 99

    def test_password_min_length(self) -> None:
        """Password minimum length should be 8."""
        assert PASSWORD_MIN_LENGTH == 8
