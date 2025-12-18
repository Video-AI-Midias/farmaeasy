"""Validation utilities for user input.

Provides validation for:
- Brazilian CPF (Cadastro de Pessoas Fisicas)
- Brazilian phone numbers (mobile)
- Email format
- Password strength
"""

import re
from typing import NamedTuple


# ==============================================================================
# Constants for validation rules
# ==============================================================================

# CPF: Brazilian individual taxpayer registry (11 digits)
CPF_DIGIT_LENGTH = 11

# Phone: Brazilian mobile format (2 DDD + 9 digits = 11 total)
PHONE_DIGIT_LENGTH = 11
DDD_MIN = 11  # Lowest valid Brazilian area code
DDD_MAX = 99  # Highest valid Brazilian area code

# Password requirements
PASSWORD_MIN_LENGTH = 8


class ValidationResult(NamedTuple):
    """Result of a validation check."""

    valid: bool
    message: str | None = None
    formatted: str | None = None


def validate_cpf(cpf: str) -> ValidationResult:
    """Validate a Brazilian CPF number.

    CPF has 11 digits with 2 check digits calculated using modulo 11.

    Args:
        cpf: CPF string (with or without formatting)

    Returns:
        ValidationResult with valid flag and formatted CPF if valid

    Examples:
        >>> validate_cpf("529.982.247-25")
        ValidationResult(valid=True, message=None, formatted='529.982.247-25')
        >>> validate_cpf("111.111.111-11")
        ValidationResult(valid=False, message='CPF invalido', formatted=None)
    """
    # Remove non-digits
    cpf_digits = re.sub(r"\D", "", cpf)

    # Must have exactly 11 digits
    if len(cpf_digits) != CPF_DIGIT_LENGTH:
        return ValidationResult(False, "CPF deve ter 11 digitos")

    # Reject known invalid patterns (all same digit)
    if cpf_digits == cpf_digits[0] * CPF_DIGIT_LENGTH:
        return ValidationResult(False, "CPF invalido")

    # Validate check digits
    for i in range(9, 11):
        total = sum(int(cpf_digits[num]) * ((i + 1) - num) for num in range(i))
        digit = ((total * 10) % 11) % 10
        if digit != int(cpf_digits[i]):
            return ValidationResult(False, "CPF invalido")

    # Format as XXX.XXX.XXX-XX
    formatted = f"{cpf_digits[:3]}.{cpf_digits[3:6]}.{cpf_digits[6:9]}-{cpf_digits[9:]}"
    return ValidationResult(True, formatted=formatted)


def normalize_cpf(cpf: str) -> str:
    """Remove formatting from CPF, keeping only digits.

    Args:
        cpf: CPF string (with or without formatting)

    Returns:
        CPF with only digits

    Example:
        >>> normalize_cpf("529.982.247-25")
        '52998224725'
    """
    return re.sub(r"\D", "", cpf)


def format_cpf(cpf: str) -> str:
    """Format CPF as XXX.XXX.XXX-XX.

    Args:
        cpf: CPF string (digits only or formatted)

    Returns:
        Formatted CPF string

    Example:
        >>> format_cpf("52998224725")
        '529.982.247-25'
    """
    digits = normalize_cpf(cpf)
    if len(digits) != CPF_DIGIT_LENGTH:
        return cpf
    return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"


def validate_phone(phone: str) -> ValidationResult:
    """Validate a Brazilian mobile phone number.

    Expected format: (XX) 9XXXX-XXXX
    - 2 digits for DDD (area code, 11-99)
    - 9 digits for number (must start with 9 for mobile)

    Args:
        phone: Phone string (with or without formatting)

    Returns:
        ValidationResult with valid flag and formatted phone if valid

    Examples:
        >>> validate_phone("11987654321")
        ValidationResult(valid=True, message=None, formatted='(11) 98765-4321')
        >>> validate_phone("1112345678")
        ValidationResult(valid=False, message='Telefone deve ter 11 digitos', formatted=None)
    """
    # Remove non-digits
    phone_digits = re.sub(r"\D", "", phone)

    # Must have exactly 11 digits
    if len(phone_digits) != PHONE_DIGIT_LENGTH:
        return ValidationResult(False, "Telefone deve ter 11 digitos")

    # Validate DDD (area code)
    ddd = int(phone_digits[:2])
    if ddd < DDD_MIN or ddd > DDD_MAX:
        return ValidationResult(False, "DDD invalido")

    # Mobile numbers must start with 9
    if phone_digits[2] != "9":
        return ValidationResult(False, "Numero de celular deve comecar com 9")

    # Format as (XX) 9XXXX-XXXX
    formatted = f"({phone_digits[:2]}) {phone_digits[2:7]}-{phone_digits[7:]}"
    return ValidationResult(True, formatted=formatted)


def normalize_phone(phone: str) -> str:
    """Remove formatting from phone, keeping only digits.

    Args:
        phone: Phone string (with or without formatting)

    Returns:
        Phone with only digits

    Example:
        >>> normalize_phone("(11) 98765-4321")
        '11987654321'
    """
    return re.sub(r"\D", "", phone)


def format_phone(phone: str) -> str:
    """Format phone as (XX) 9XXXX-XXXX.

    Args:
        phone: Phone string (digits only or formatted)

    Returns:
        Formatted phone string

    Example:
        >>> format_phone("11987654321")
        '(11) 98765-4321'
    """
    digits = normalize_phone(phone)
    if len(digits) != PHONE_DIGIT_LENGTH:
        return phone
    return f"({digits[:2]}) {digits[2:7]}-{digits[7:]}"


def validate_password(password: str) -> ValidationResult:
    """Validate password strength.

    Requirements:
    - Minimum 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character

    Args:
        password: Plain text password

    Returns:
        ValidationResult with valid flag and error message if invalid

    Examples:
        >>> validate_password("Abc123!@")
        ValidationResult(valid=True, message=None, formatted=None)
        >>> validate_password("weak")
        ValidationResult(valid=False, message='Senha deve ter no minimo 8 caracteres', formatted=None)
    """
    if len(password) < PASSWORD_MIN_LENGTH:
        return ValidationResult(False, "Senha deve ter no minimo 8 caracteres")

    if not re.search(r"[A-Z]", password):
        return ValidationResult(False, "Senha deve ter pelo menos uma letra maiuscula")

    if not re.search(r"[a-z]", password):
        return ValidationResult(False, "Senha deve ter pelo menos uma letra minuscula")

    if not re.search(r"\d", password):
        return ValidationResult(False, "Senha deve ter pelo menos um numero")

    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return ValidationResult(
            False, "Senha deve ter pelo menos um caractere especial"
        )

    return ValidationResult(True)


def validate_email(email: str) -> ValidationResult:
    """Basic email format validation.

    Note: For full email validation, use Pydantic's EmailStr.
    This is a simple check for obvious format issues.

    Args:
        email: Email address

    Returns:
        ValidationResult with valid flag

    Examples:
        >>> validate_email("user@example.com")
        ValidationResult(valid=True, message=None, formatted=None)
        >>> validate_email("invalid-email")
        ValidationResult(valid=False, message='Email invalido', formatted=None)
    """
    email_pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    if re.match(email_pattern, email):
        return ValidationResult(True)
    return ValidationResult(False, "Email invalido")
