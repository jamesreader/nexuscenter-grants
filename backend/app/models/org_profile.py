"""
Organization Profile Model

Stores the Nexus Center organizational profile document used for grant relevance scoring.
Supports versioning for change tracking.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, DateTime, Integer, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class OrgProfile(Base, UUIDMixin, TimestampMixin):
    """
    The organization profile document.

    This is the "source of truth" for what Nexus Center is, what it needs,
    and what types of grants are relevant. Used by AI to generate
    relevance scoring rules.

    Only one active profile exists at a time. Previous versions are
    stored for history/audit purposes.
    """
    __tablename__ = "org_profiles"

    # Version tracking
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        comment="Profile version number",
    )
    is_active: Mapped[bool] = mapped_column(
        default=True,
        comment="Whether this is the current active profile",
    )

    # Profile content (markdown document)
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="The profile document content (markdown)",
    )

    # Metadata
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="Nexus Center for IDD Care Organization Profile",
    )
    summary: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Brief summary/abstract of the profile",
    )

    # Change tracking
    changed_by: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Who made this version (user or system)",
    )
    change_notes: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Notes about what changed in this version",
    )

    # AI-generated relevance rules (populated after profile update)
    relevance_rules: Mapped[Optional[dict]] = mapped_column(
        JSONB,
        nullable=True,
        comment="AI-generated relevance scoring rules from this profile",
    )
    rules_generated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="When relevance rules were last generated",
    )

    # Indexes
    __table_args__ = (
        Index("ix_org_profiles_version", "version"),
        Index("ix_org_profiles_is_active", "is_active"),
    )

    def __repr__(self) -> str:
        status = "active" if self.is_active else "archived"
        return f"<OrgProfile v{self.version} ({status})>"


class OrgProfileSection(Base, UUIDMixin, TimestampMixin):
    """
    Structured sections extracted from the org profile.

    Allows querying specific aspects of the organization
    (e.g., infrastructure needs, public safety priorities).
    """
    __tablename__ = "org_profile_sections"

    # Link to profile version
    profile_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Profile version this section belongs to",
    )

    # Section details
    section_key: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Section identifier (e.g., 'infrastructure', 'public_safety')",
    )
    section_title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    # AI-extracted keywords for this section
    keywords: Mapped[Optional[list[str]]] = mapped_column(
        JSONB,
        nullable=True,
        comment="Keywords extracted from this section",
    )

    # Priority/weight for relevance scoring
    priority: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=5,
        comment="Priority 1-10, higher = more important for relevance",
    )

    # Indexes
    __table_args__ = (
        Index("ix_org_profile_sections_key", "section_key"),
        Index("ix_org_profile_sections_version", "profile_version"),
    )

    def __repr__(self) -> str:
        return f"<OrgProfileSection {self.section_key} (v{self.profile_version})>"
