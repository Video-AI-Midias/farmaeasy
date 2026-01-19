"""Registration links module for automated user registration.

Provides functionality for:
- Generating secure registration links for WhatsApp customers
- Validating links and completing registrations
- Auto-granting course access upon registration
"""

from .models import REGISTRATION_LINKS_TABLES_CQL, RegistrationLink
from .schemas import (
    CompleteRegistrationRequest,
    CreateRegistrationLinkRequest,
    RegistrationLinkResponse,
    ValidateLinkResponse,
)
from .service import RegistrationLinkService


__all__ = [
    "REGISTRATION_LINKS_TABLES_CQL",
    "CompleteRegistrationRequest",
    "CreateRegistrationLinkRequest",
    "RegistrationLink",
    "RegistrationLinkResponse",
    "RegistrationLinkService",
    "ValidateLinkResponse",
]
