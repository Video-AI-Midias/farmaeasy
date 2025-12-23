"""Async Cassandra database connection using cassandra-asyncio-driver.

Provides:
- Async connection pool management
- Session with aexecute() for non-blocking queries
- Keyspace and table initialization (async)

The cassandra-asyncio-driver extends the standard cassandra-driver
with `session.aexecute()` method for async/await support.
"""

import structlog
from cassandra.auth import PlainTextAuthProvider
from cassandra.policies import DCAwareRoundRobinPolicy, TokenAwarePolicy
from cassandra_asyncio.cluster import Cluster

from src.acquisitions.models import ACQUISITIONS_TABLES_CQL
from src.auth.models import AUTH_TABLES_CQL
from src.comments.models import COMMENTS_TABLES_CQL
from src.config.settings import get_settings
from src.courses.models import COURSES_TABLES_CQL
from src.notifications.models import NOTIFICATIONS_TABLES_CQL
from src.progress.models import PROGRESS_TABLES_CQL


logger = structlog.get_logger(__name__)


class AsyncCassandraConnection:
    """Async Cassandra connection manager.

    Manages cluster connection and session lifecycle with async support.
    Uses cassandra-asyncio-driver for non-blocking execute via aexecute().
    """

    _cluster: Cluster | None = None
    _session = None  # Session type from cassandra_asyncio

    @classmethod
    def connect(cls):
        """Establish connection to Cassandra cluster.

        Note: Connection is synchronous, but execute calls can be async.

        Returns:
            Active Cassandra session with aexecute() support

        Raises:
            ConnectionError: If connection fails
        """
        if cls._session is not None:
            return cls._session

        settings = get_settings()

        # Setup auth provider if credentials configured
        auth_provider = None
        if settings.cassandra_username and settings.cassandra_password:
            auth_provider = PlainTextAuthProvider(
                username=settings.cassandra_username,
                password=settings.cassandra_password,
            )

        # Load balancing policy
        load_balancing_policy = TokenAwarePolicy(DCAwareRoundRobinPolicy())

        # Create async-capable cluster
        cls._cluster = Cluster(
            contact_points=settings.cassandra_hosts,
            port=settings.cassandra_port,
            auth_provider=auth_provider,
            protocol_version=settings.cassandra_protocol_version,
            load_balancing_policy=load_balancing_policy,
            connect_timeout=settings.cassandra_connect_timeout,
        )

        try:
            cls._session = cls._cluster.connect()
            logger.info(
                "async_cassandra_connected",
                hosts=settings.cassandra_hosts,
                port=settings.cassandra_port,
                protocol_version=settings.cassandra_protocol_version,
            )
        except Exception as e:
            logger.error("async_cassandra_connection_failed", error=str(e))
            raise ConnectionError(f"Failed to connect to Cassandra: {e}") from e

        return cls._session

    @classmethod
    def get_session(cls):
        """Get active session, connecting if necessary."""
        if cls._session is None:
            return cls.connect()
        return cls._session

    @classmethod
    def disconnect(cls) -> None:
        """Close connection to Cassandra."""
        if cls._session is not None:
            cls._session.shutdown()
            cls._session = None
            logger.info("async_cassandra_session_closed")

        if cls._cluster is not None:
            cls._cluster.shutdown()
            cls._cluster = None
            logger.info("async_cassandra_cluster_closed")

    @classmethod
    def is_connected(cls) -> bool:
        """Check if connection is active."""
        return cls._session is not None and not cls._session.is_shutdown


def get_async_cassandra_session():
    """Get async-capable Cassandra session (dependency injection helper)."""
    return AsyncCassandraConnection.get_session()


async def init_async_keyspace(session, keyspace: str) -> None:
    """Create keyspace if not exists (async).

    Args:
        session: Active Cassandra session with aexecute()
        keyspace: Keyspace name
    """
    settings = get_settings()

    # Replication strategy based on environment
    if settings.is_production:
        replication = """
            'class': 'NetworkTopologyStrategy',
            'datacenter1': 3
        """
    else:
        replication = """
            'class': 'SimpleStrategy',
            'replication_factor': 1
        """

    cql = f"""
        CREATE KEYSPACE IF NOT EXISTS {keyspace}
        WITH replication = {{{replication}}}
        AND durable_writes = true
    """

    await session.aexecute(cql)
    logger.info("async_keyspace_created", keyspace=keyspace)


async def init_async_auth_tables(session, keyspace: str) -> None:
    """Create authentication tables (async)."""
    for cql_template in AUTH_TABLES_CQL:
        cql = cql_template.format(keyspace=keyspace)
        await session.aexecute(cql)
    logger.info("async_auth_tables_created", keyspace=keyspace)


async def init_async_courses_tables(session, keyspace: str) -> None:
    """Create course management tables (async)."""
    for cql_template in COURSES_TABLES_CQL:
        cql = cql_template.format(keyspace=keyspace)
        await session.aexecute(cql)
    logger.info("async_courses_tables_created", keyspace=keyspace)


async def init_async_comments_tables(session, keyspace: str) -> None:
    """Create comment system tables (async)."""
    for cql_template in COMMENTS_TABLES_CQL:
        cql = cql_template.format(keyspace=keyspace)
        await session.aexecute(cql)
    logger.info("async_comments_tables_created", keyspace=keyspace)


async def init_async_progress_tables(session, keyspace: str) -> None:
    """Create student progress tracking tables (async)."""
    for cql_template in PROGRESS_TABLES_CQL:
        cql = cql_template.format(keyspace=keyspace)
        await session.aexecute(cql)
    logger.info("async_progress_tables_created", keyspace=keyspace)


async def init_async_notifications_tables(session, keyspace: str) -> None:
    """Create notification system tables (async)."""
    for cql_template in NOTIFICATIONS_TABLES_CQL:
        cql = cql_template.format(keyspace=keyspace)
        await session.aexecute(cql)
    logger.info("async_notifications_tables_created", keyspace=keyspace)


async def init_async_acquisitions_tables(session, keyspace: str) -> None:
    """Create course acquisition tables (async)."""
    for cql_template in ACQUISITIONS_TABLES_CQL:
        cql = cql_template.format(keyspace=keyspace)
        await session.aexecute(cql)
    logger.info("async_acquisitions_tables_created", keyspace=keyspace)


async def init_async_cassandra():
    """Initialize async Cassandra connection and schema.

    Creates keyspace and tables if they don't exist using async operations.

    Returns:
        Configured Cassandra session with aexecute() support
    """
    settings = get_settings()

    # Connect to cluster (sync connection, but session supports aexecute)
    session = AsyncCassandraConnection.connect()

    # Create keyspace (async)
    await init_async_keyspace(session, settings.cassandra_keyspace)

    # Use keyspace (sync operation)
    session.set_keyspace(settings.cassandra_keyspace)

    # Create all tables (async)
    await init_async_auth_tables(session, settings.cassandra_keyspace)
    await init_async_courses_tables(session, settings.cassandra_keyspace)
    await init_async_comments_tables(session, settings.cassandra_keyspace)
    await init_async_progress_tables(session, settings.cassandra_keyspace)
    await init_async_notifications_tables(session, settings.cassandra_keyspace)
    await init_async_acquisitions_tables(session, settings.cassandra_keyspace)

    logger.info(
        "async_cassandra_initialized",
        keyspace=settings.cassandra_keyspace,
    )

    return session


async def shutdown_async_cassandra() -> None:
    """Shutdown async Cassandra connection."""
    AsyncCassandraConnection.disconnect()
