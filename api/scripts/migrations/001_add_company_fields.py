"""Migration 001: Add company fields to users table.

This migration adds fields required for the registration links feature:
- cnpj: Brazilian CNPJ for companies
- store_type: Type of store (associada, independente)
- business_model: Business model (farmacia, manipulacao, ecommerce)
- units_count: Number of store units
- erp_system: ERP system name
- instagram: Instagram handle
- monthly_revenue: Monthly revenue range
- birth_date: User's birth date
- registration_link_id: ID of registration link used for signup

Usage:
    cd api && uv run python -m scripts.migrations.001_add_company_fields
"""

import asyncio
import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import structlog
from cassandra.auth import PlainTextAuthProvider
from cassandra_asyncio.cluster import Cluster

from src.config.settings import get_settings


logger = structlog.get_logger(__name__)


# Migration statements
MIGRATION_STATEMENTS = [
    "ALTER TABLE {keyspace}.users ADD cnpj TEXT",
    "ALTER TABLE {keyspace}.users ADD store_type TEXT",
    "ALTER TABLE {keyspace}.users ADD business_model TEXT",
    "ALTER TABLE {keyspace}.users ADD units_count INT",
    "ALTER TABLE {keyspace}.users ADD erp_system TEXT",
    "ALTER TABLE {keyspace}.users ADD instagram TEXT",
    "ALTER TABLE {keyspace}.users ADD monthly_revenue TEXT",
    "ALTER TABLE {keyspace}.users ADD birth_date DATE",
    "ALTER TABLE {keyspace}.users ADD registration_link_id UUID",
    "CREATE INDEX IF NOT EXISTS users_cnpj_idx ON {keyspace}.users (cnpj)",
]


async def migrate_up(session, keyspace: str) -> tuple[int, int]:
    """Apply migration - add company fields to users table.

    Args:
        session: Cassandra session with aexecute support
        keyspace: Target keyspace

    Returns:
        Tuple of (applied_count, skipped_count)
    """
    applied = 0
    skipped = 0

    for stmt_template in MIGRATION_STATEMENTS:
        stmt = stmt_template.format(keyspace=keyspace)
        try:
            await session.aexecute(stmt)
            logger.info("migration_applied", statement=stmt[:60] + "...")
            applied += 1
        except Exception as e:
            error_str = str(e).lower()
            # Cassandra raises InvalidRequest if column already exists
            if "already exist" in error_str or "duplicate" in error_str:
                logger.info("migration_skipped_exists", statement=stmt[:60] + "...")
                skipped += 1
            else:
                logger.error("migration_failed", statement=stmt[:60] + "...", error=str(e))
                raise

    return applied, skipped


async def migrate_down(session, keyspace: str) -> None:
    """Rollback migration.

    Note: Cassandra doesn't support DROP COLUMN in older versions.
    For newer versions, columns can be dropped but data will be lost.
    This function is a no-op for safety.
    """
    logger.warning(
        "migrate_down_not_implemented",
        message="Cassandra column removal is destructive - skipping",
    )


async def run_migration() -> None:
    """Run the migration."""
    settings = get_settings()
    keyspace = settings.cassandra_keyspace

    logger.info(
        "migration_starting",
        migration="001_add_company_fields",
        keyspace=keyspace,
        hosts=settings.cassandra_hosts,
    )

    # Setup auth provider if credentials configured
    auth_provider = None
    if settings.cassandra_username and settings.cassandra_password:
        auth_provider = PlainTextAuthProvider(
            username=settings.cassandra_username,
            password=settings.cassandra_password,
        )

    # Connect to cluster
    cluster = Cluster(
        contact_points=settings.cassandra_hosts,
        port=settings.cassandra_port,
        auth_provider=auth_provider,
        protocol_version=settings.cassandra_protocol_version,
    )

    session = cluster.connect()
    session.set_keyspace(keyspace)

    try:
        applied, skipped = await migrate_up(session, keyspace)
        logger.info(
            "migration_completed",
            migration="001_add_company_fields",
            applied=applied,
            skipped=skipped,
        )
    finally:
        session.shutdown()
        cluster.shutdown()


if __name__ == "__main__":
    asyncio.run(run_migration())
