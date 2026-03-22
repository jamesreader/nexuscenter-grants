"""
Grant Opportunity Model

Represents a grant funding opportunity from various sources (grants.gov, NMFA, manual entry).
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID

from sqlalchemy import (
    String, Text, Numeric, DateTime, Enum as SQLEnum,
    ARRAY, Index
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class GrantSource(str, Enum):
    """Source of the grant opportunity."""
    GRANTS_GOV = "grants.gov"
    GRANTEXEC = "grantexec"  # GrantExec portal (state/local grants)
    NMFA = "nmfa"  # New Mexico Finance Authority
    USDA = "usda"
    DOJ = "doj"
    EPA = "epa"
    FEMA = "fema"
    MANUAL = "manual"


class GrantStatus(str, Enum):
    """Status of the grant opportunity."""
    OPEN = "open"
    CLOSED = "closed"
    APPLIED = "applied"
    AWARDED = "awarded"
    REJECTED = "rejected"
    ARCHIVED = "archived"


class GrantOpportunity(Base, UUIDMixin, TimestampMixin):
    """
    A grant funding opportunity.

    Tracks opportunities from federal (grants.gov), state (NMFA), and local sources.
    Supports semantic search via Qdrant embeddings.
    """
    __tablename__ = "grant_opportunities"

    # Source tracking
    source: Mapped[GrantSource] = mapped_column(
        SQLEnum(GrantSource),
        nullable=False,
        default=GrantSource.MANUAL,
    )
    source_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="External ID from source system (e.g., grants.gov opportunity number)",
    )
    source_url: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="URL to original grant listing",
    )

    # Basic info
    title: Mapped[str] = mapped_column(Text, nullable=False)
    agency: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Funding details
    funding_amount_min: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 2),
        nullable=True,
    )
    funding_amount_max: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 2),
        nullable=True,
    )
    cost_sharing_required: Mapped[bool] = mapped_column(default=False)
    match_percentage: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(5, 2),
        nullable=True,
        comment="Required local match percentage (e.g., 25.00)",
    )

    # Dates
    open_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    deadline: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )
    close_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Eligibility and requirements
    eligibility: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    requirements: Mapped[Optional[dict]] = mapped_column(
        JSONB,
        nullable=True,
        comment="Structured requirements checklist",
    )

    # Categorization
    categories: Mapped[Optional[list[str]]] = mapped_column(
        ARRAY(String(100)),
        nullable=True,
        comment="Categories like infrastructure, public_safety, environment",
    )
    cfda_number: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="Catalog of Federal Domestic Assistance number",
    )

    # Status
    status: Mapped[GrantStatus] = mapped_column(
        SQLEnum(GrantStatus),
        nullable=False,
        default=GrantStatus.OPEN,
        index=True,
    )

    # Full text for search
    content_text: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Combined text for full-text and semantic search",
    )

    # Vector embedding reference
    qdrant_point_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=True,
        comment="ID of vector embedding in Qdrant",
    )

    # Relevance scoring
    relevance_score: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(3, 2),
        nullable=True,
        comment="AI-computed relevance to Nexus Center (0.00-1.00)",
    )
    relevance_notes: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="AI explanation of relevance",
    )

    # User management
    is_dismissed: Mapped[bool] = mapped_column(
        default=False,
        comment="User has marked this grant as not relevant",
    )
    is_flagged: Mapped[bool] = mapped_column(
        default=False,
        comment="User has flagged this grant for follow-up",
    )
    user_notes: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="User notes about this grant",
    )

    # Relationships
    applications = relationship("Application", back_populates="opportunity")

    # Indexes
    __table_args__ = (
        Index("ix_grant_opportunities_deadline_status", "deadline", "status"),
        Index("ix_grant_opportunities_source_source_id", "source", "source_id"),
    )

    def __repr__(self) -> str:
        return f"<GrantOpportunity {self.title[:50]}... ({self.status.value})>"
