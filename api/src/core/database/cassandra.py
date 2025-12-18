"""Cassandra database connection and management.

Provides:
- Connection pool management
- Session creation
- Keyspace and table initialization
"""

import structlog
from cassandra.auth import PlainTextAuthProvider
from cassandra.cluster import Cluster, Session
from cassandra.policies import DCAwareRoundRobinPolicy, TokenAwarePolicy

from src.acquisitions.models import ACQUISITIONS_TABLES_CQL
from src.auth.models import AUTH_TABLES_CQL
from src.comments.models import COMMENTS_TABLES_CQL
from src.config.settings import get_settings
from src.courses.models import COURSES_TABLES_CQL
from src.notifications.models import NOTIFICATIONS_TABLES_CQL
from src.progress.models import PROGRESS_TABLES_CQL


logger = structlog.get_logger(__name__)


class CassandraConnection:
    """Cassandra connection manager.

    Manages cluster connection and session lifecycle.
    """

    _cluster: Cluster | None = None
    _session: Session | None = None

    @classmethod
    def connect(cls) -> Session:
        """Establish connection to Cassandra cluster.

        Returns:
            Active Cassandra session

        Raises:
            ConnectionError: If connection fails
        """
        if cls._session is not None:
            return cls._session

        settings = get_settings()

        # Authentication (optional)
        auth_provider = None
        if settings.cassandra_username and settings.cassandra_password:
            auth_provider = PlainTextAuthProvider(
                username=settings.cassandra_username,
                password=settings.cassandra_password,
            )

        # Load balancing policy
        load_balancing_policy = TokenAwarePolicy(DCAwareRoundRobinPolicy())

        # Create cluster
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
                "cassandra_connected",
                hosts=settings.cassandra_hosts,
                port=settings.cassandra_port,
            )
        except Exception as e:
            logger.error("cassandra_connection_failed", error=str(e))
            raise ConnectionError(f"Failed to connect to Cassandra: {e}") from e

        return cls._session

    @classmethod
    def get_session(cls) -> Session:
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
            logger.info("cassandra_session_closed")

        if cls._cluster is not None:
            cls._cluster.shutdown()
            cls._cluster = None
            logger.info("cassandra_cluster_closed")

    @classmethod
    def is_connected(cls) -> bool:
        """Check if connection is active."""
        return cls._session is not None and not cls._session.is_shutdown


def get_cassandra_session() -> Session:
    """Get Cassandra session (dependency injection helper)."""
    return CassandraConnection.get_session()


def init_keyspace(session: Session, keyspace: str) -> None:
    """Create keyspace if not exists.

    Args:
        session: Active Cassandra session
        keyspace: Keyspace name
    """
    settings = get_settings()

    # Replication strategy based on environment
    if settings.is_production:
        # Production: NetworkTopologyStrategy for multi-DC
        replication = """
            'class': 'NetworkTopologyStrategy',
            'datacenter1': 3
        """
    else:
        # Development: SimpleStrategy with RF=1
        replication = """
            'class': 'SimpleStrategy',
            'replication_factor': 1
        """

    cql = f"""
        CREATE KEYSPACE IF NOT EXISTS {keyspace}
        WITH replication = {{{replication}}}
        AND durable_writes = true
    """

    session.execute(cql)
    logger.info("keyspace_created", keyspace=keyspace)


def init_auth_tables(session: Session, keyspace: str) -> None:
    """Create authentication tables.

    Args:
        session: Active Cassandra session
        keyspace: Keyspace name
    """
    for cql_template in AUTH_TABLES_CQL:
        cql = cql_template.format(keyspace=keyspace)
        session.execute(cql)

    logger.info("auth_tables_created", keyspace=keyspace)


def init_courses_tables(session: Session, keyspace: str) -> None:
    """Create course management tables.

    Args:
        session: Active Cassandra session
        keyspace: Keyspace name
    """
    for cql_template in COURSES_TABLES_CQL:
        cql = cql_template.format(keyspace=keyspace)
        session.execute(cql)

    logger.info("courses_tables_created", keyspace=keyspace)


def init_comments_tables(session: Session, keyspace: str) -> None:
    """Create comment system tables.

    Args:
        session: Active Cassandra session
        keyspace: Keyspace name
    """
    for cql_template in COMMENTS_TABLES_CQL:
        cql = cql_template.format(keyspace=keyspace)
        session.execute(cql)

    logger.info("comments_tables_created", keyspace=keyspace)


def init_progress_tables(session: Session, keyspace: str) -> None:
    """Create student progress tracking tables.

    Args:
        session: Active Cassandra session
        keyspace: Keyspace name
    """
    for cql_template in PROGRESS_TABLES_CQL:
        cql = cql_template.format(keyspace=keyspace)
        session.execute(cql)

    logger.info("progress_tables_created", keyspace=keyspace)


def init_notifications_tables(session: Session, keyspace: str) -> None:
    """Create notification system tables.

    Args:
        session: Active Cassandra session
        keyspace: Keyspace name
    """
    for cql_template in NOTIFICATIONS_TABLES_CQL:
        cql = cql_template.format(keyspace=keyspace)
        session.execute(cql)

    logger.info("notifications_tables_created", keyspace=keyspace)


def init_acquisitions_tables(session: Session, keyspace: str) -> None:
    """Create course acquisition tables.

    Args:
        session: Active Cassandra session
        keyspace: Keyspace name
    """
    for cql_template in ACQUISITIONS_TABLES_CQL:
        cql = cql_template.format(keyspace=keyspace)
        session.execute(cql)

    logger.info("acquisitions_tables_created", keyspace=keyspace)


def init_cassandra() -> Session:
    """Initialize Cassandra connection and schema.

    Creates keyspace and tables if they don't exist.

    Returns:
        Configured Cassandra session
    """
    settings = get_settings()

    # Connect to cluster
    session = CassandraConnection.connect()

    # Create keyspace
    init_keyspace(session, settings.cassandra_keyspace)

    # Use keyspace
    session.set_keyspace(settings.cassandra_keyspace)

    # Create auth tables
    init_auth_tables(session, settings.cassandra_keyspace)

    # Create courses tables
    init_courses_tables(session, settings.cassandra_keyspace)

    # Create comments tables
    init_comments_tables(session, settings.cassandra_keyspace)

    # Create progress tables
    init_progress_tables(session, settings.cassandra_keyspace)

    # Create notifications tables
    init_notifications_tables(session, settings.cassandra_keyspace)

    # Create acquisitions tables
    init_acquisitions_tables(session, settings.cassandra_keyspace)

    logger.info(
        "cassandra_initialized",
        keyspace=settings.cassandra_keyspace,
    )

    return session


def shutdown_cassandra() -> None:
    """Shutdown Cassandra connection."""
    CassandraConnection.disconnect()
