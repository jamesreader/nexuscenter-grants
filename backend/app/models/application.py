"""
Grant Application Model

Tracks application progress from draft through submission to award/rejection.
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID

from sqlalchemy import (
    String, Text, Numeric, DateTime, Enum as SQLEnum,
    ForeignKey, Index
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class ApplicationStatus(str, Enum):
    """Status of the grant application."""
    DRAFT = "draft"
    IN_PROGRESS = "in_progress"
    READY_FOR_REVIEW = "ready_for_review"
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    ADDITIONAL_INFO_REQUESTED = "additional_info_requested"
    AWARDED = "awarded"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class Application(Base, UUIDMixin, TimestampMixin):
    """
    A grant application for a specific opportunity.

    Tracks the full lifecycle from initial draft through submission,
    review, and final outcome.
    """
    __tablename__ = "applications"

    # Link to opportunity
    opportunity_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("grant_opportunities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Status tracking
    status: Mapped[ApplicationStatus] = mapped_column(
        SQLEnum(ApplicationStatus),
        nullable=False,
        default=ApplicationStatus.DRAFT,
        index=True,
    )

    # Key dates
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default="now()",
    )
    submission_deadline: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Internal deadline (may be earlier than grant deadline)",
    )
    submitted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    decision_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Application details
    project_title: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
    )
    project_description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    requested_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 2),
        nullable=True,
    )
    awarded_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 2),
        nullable=True,
    )

    # Match/cost sharing
    local_match_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 2),
        nullable=True,
    )
    match_source: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Where local match funds will come from",
    )

    # Supporting documents from DMS
    supporting_documents: Mapped[Optional[list[dict]]] = mapped_column(
        JSONB,
        nullable=True,
        comment="List of {document_id, title, source, relevance}",
    )

    # Application content (AI-assisted drafts)
    narrative_draft: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="AI-assisted narrative draft",
    )
    budget_draft: Mapped[Optional[dict]] = mapped_column(
        JSONB,
        nullable=True,
        comment="Budget breakdown",
    )

    # Requirements checklist
    requirements_checklist: Mapped[Optional[dict]] = mapped_column(
        JSONB,
        nullable=True,
        comment="Checklist items with completion status",
    )

    # Notes and history
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    history: Mapped[Optional[list[dict]]] = mapped_column(
        JSONB,
        nullable=True,
        comment="Status change history with timestamps",
    )

    # Assigned staff
    assigned_to: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Staff member responsible",
    )

    # Submission tracking
    confirmation_number: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )
    submission_method: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        comment="How submitted: grants.gov, email, portal, mail",
    )

    # Relationships
    opportunity = relationship("GrantOpportunity", back_populates="applications")

    # Indexes
    __table_args__ = (
        Index("ix_applications_status_deadline", "status", "submission_deadline"),
    )

    def __repr__(self) -> str:
        return f"<Application {self.project_title or 'Untitled'} ({self.status.value})>"
