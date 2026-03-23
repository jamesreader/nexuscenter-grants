"""
Grant Relevance Scoring

Uses Cortex AI to:
1. Generate relevance rules from the organization profile
2. Score grants against those rules

Scoring is intentionally broad - "if it matches even a little, we want to know."
"""

import logging
import re
from dataclasses import dataclass, field, asdict
from datetime import datetime
from decimal import Decimal
from typing import Optional

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GrantOpportunity, OrgProfile

logger = logging.getLogger(__name__)

# AI inference URL — defaults to Daedalus (Gemma 2 27B via llama-server)
# Override with AI_URL env var to point elsewhere (Cortex, OpenAI, etc.)
import os
AI_URL = os.getenv("AI_URL", "http://daedalus:8000")
AI_MODEL = os.getenv("AI_MODEL", "gemma-2-27b-it-Q4_K_M.gguf")
AI_API_KEY = os.getenv("AI_API_KEY", "")


@dataclass
class ScoringRules:
    """
    AI-generated rules for scoring grant relevance.

    These are extracted from the org profile and used to score grants.
    """
    # Keywords that indicate high relevance (exact match)
    high_priority_keywords: list[str] = field(default_factory=list)

    # Keywords that indicate medium relevance
    medium_priority_keywords: list[str] = field(default_factory=list)

    # Keywords that indicate low but still relevant
    low_priority_keywords: list[str] = field(default_factory=list)

    # Agency names that are particularly relevant
    relevant_agencies: list[str] = field(default_factory=list)

    # Categories that match org needs
    relevant_categories: list[str] = field(default_factory=list)

    # Funding range preferences (for prioritization, not exclusion)
    min_preferred_funding: Optional[float] = None
    max_preferred_funding: Optional[float] = None

    # Population/eligibility hints
    population_keywords: list[str] = field(default_factory=list)

    # Geographic keywords (state, region)
    geographic_keywords: list[str] = field(default_factory=list)

    # Negative keywords (still show but lower score)
    negative_keywords: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "ScoringRules":
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


RULES_GENERATION_PROMPT = """You are analyzing an organization profile to generate grant relevance scoring rules.

The organization is a 501(c)(3) nonprofit providing sensory-friendly phlebotomy and healthcare services for people with intellectual and developmental disabilities (IDD). They seek federal, state, and local grants. They want BROAD matching - if a grant matches even slightly, they want to know about it. The scoring will be used to RANK grants, not exclude them.

Based on the profile below, extract scoring rules in JSON format:

{{
  "high_priority_keywords": ["list of keywords that strongly indicate relevance - infrastructure types, specific needs mentioned, etc."],
  "medium_priority_keywords": ["broader keywords that suggest relevance"],
  "low_priority_keywords": ["general keywords that might be relevant"],
  "relevant_agencies": ["federal/state agencies likely to fund this org's needs"],
  "relevant_categories": ["grant categories: infrastructure, public_safety, environment, community_development, transportation, etc."],
  "min_preferred_funding": null or number (minimum useful grant size, but don't exclude smaller),
  "max_preferred_funding": null or number (realistic upper bound for this org),
  "population_keywords": ["keywords about population size, rural, small town, etc."],
  "geographic_keywords": ["state name, region, tribal, etc."],
  "negative_keywords": ["keywords that suggest less relevance but don't exclude - e.g., 'university', 'hospital' if org is not those"]
}}

Be generous with keywords - include variations, related terms, and partial matches. The goal is to catch anything potentially relevant.

ORGANIZATION PROFILE:
---
{profile_content}
---

Return ONLY the JSON object, no other text."""


class RelevanceScorer:
    """
    Scores grant opportunities for relevance to the organization.

    Uses AI-generated rules from the org profile.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.client = httpx.AsyncClient(timeout=600.0)
        self.rules: Optional[ScoringRules] = None

    async def close(self):
        await self.client.aclose()

    async def load_rules(self) -> ScoringRules | None:
        """Load scoring rules from the active org profile."""
        result = await self.db.execute(
            select(OrgProfile)
            .where(OrgProfile.is_active == True)
            .order_by(OrgProfile.version.desc())
            .limit(1)
        )
        profile = result.scalar_one_or_none()

        if not profile:
            logger.warning("No active org profile found")
            return None

        if profile.relevance_rules:
            self.rules = ScoringRules.from_dict(profile.relevance_rules)
            return self.rules

        logger.warning("Active profile has no relevance rules - generate them first")
        return None

    async def generate_rules_from_profile(self) -> ScoringRules | None:
        """
        Use Cortex AI to generate relevance rules from the org profile.

        Stores rules in the profile and returns them.
        """
        # Get active profile
        result = await self.db.execute(
            select(OrgProfile)
            .where(OrgProfile.is_active == True)
            .order_by(OrgProfile.version.desc())
            .limit(1)
        )
        profile = result.scalar_one_or_none()

        if not profile:
            logger.error("No active org profile to generate rules from")
            return None

        # Call Cortex to generate rules
        prompt = RULES_GENERATION_PROMPT.format(profile_content=profile.content)

        try:
            response = await self.client.post(
                f"{AI_URL}/v1/chat/completions",
                json={
                    "messages": [{"role": "user", "content": prompt}],
                    "model": AI_MODEL,
                    "max_tokens": 2000,
                    "temperature": 0.1,
                },
                headers={
                    "Content-Type": "application/json",
                    **({"Authorization": f"Bearer {AI_API_KEY}"} if AI_API_KEY else {}),
                },
            )
            response.raise_for_status()

            data = response.json()
            # OpenAI-compatible response format
            content = data["choices"][0]["message"]["content"]

            # Extract JSON from response
            json_match = re.search(r'\{[\s\S]*\}', content)
            if not json_match:
                logger.error(f"Could not extract JSON from AI response: {content[:200]}")
                return None

            import json
            rules_dict = json.loads(json_match.group())
            rules = ScoringRules.from_dict(rules_dict)

            # Store rules in profile
            profile.relevance_rules = rules.to_dict()
            profile.rules_generated_at = datetime.utcnow()
            await self.db.commit()

            self.rules = rules
            logger.info(f"Generated relevance rules: {len(rules.high_priority_keywords)} high, "
                       f"{len(rules.medium_priority_keywords)} medium, "
                       f"{len(rules.low_priority_keywords)} low priority keywords")

            return rules

        except Exception as e:
            logger.exception(f"Failed to generate relevance rules: {e}")
            return None

    def score_grant(self, grant: GrantOpportunity) -> tuple[Decimal, str]:
        """
        Score a single grant for relevance.

        Returns:
            Tuple of (score 0.00-1.00, explanation)
        """
        if not self.rules:
            return Decimal("0.50"), "No scoring rules available"

        score = Decimal("0.30")  # Base score - everything gets at least some consideration
        reasons = []

        # Combine searchable text
        text = " ".join(filter(None, [
            grant.title or "",
            grant.description or "",
            grant.eligibility or "",
            grant.agency or "",
            grant.content_text or "",
        ])).lower()

        # High priority keywords (+0.15 each, max +0.45)
        high_matches = []
        for kw in self.rules.high_priority_keywords:
            if kw.lower() in text:
                high_matches.append(kw)
        if high_matches:
            boost = min(Decimal("0.45"), Decimal("0.15") * len(high_matches))
            score += boost
            reasons.append(f"High priority: {', '.join(high_matches[:3])}")

        # Medium priority keywords (+0.08 each, max +0.24)
        medium_matches = []
        for kw in self.rules.medium_priority_keywords:
            if kw.lower() in text:
                medium_matches.append(kw)
        if medium_matches:
            boost = min(Decimal("0.24"), Decimal("0.08") * len(medium_matches))
            score += boost
            reasons.append(f"Medium priority: {', '.join(medium_matches[:3])}")

        # Low priority keywords (+0.03 each, max +0.12)
        low_matches = []
        for kw in self.rules.low_priority_keywords:
            if kw.lower() in text:
                low_matches.append(kw)
        if low_matches:
            boost = min(Decimal("0.12"), Decimal("0.03") * len(low_matches))
            score += boost

        # Relevant agencies (+0.10)
        agency_lower = (grant.agency or "").lower()
        for agency in self.rules.relevant_agencies:
            if agency.lower() in agency_lower:
                score += Decimal("0.10")
                reasons.append(f"Relevant agency: {agency}")
                break

        # Category match (+0.08 each, max +0.16)
        if grant.categories:
            cat_matches = set(grant.categories) & set(self.rules.relevant_categories)
            if cat_matches:
                boost = min(Decimal("0.16"), Decimal("0.08") * len(cat_matches))
                score += boost
                reasons.append(f"Categories: {', '.join(cat_matches)}")

        # Geographic keywords (+0.10)
        for geo in self.rules.geographic_keywords:
            if geo.lower() in text:
                score += Decimal("0.10")
                reasons.append(f"Geographic match: {geo}")
                break

        # Population keywords (+0.05)
        for pop in self.rules.population_keywords:
            if pop.lower() in text:
                score += Decimal("0.05")
                break

        # Negative keywords (-0.10 each, min score 0.10)
        neg_matches = []
        for neg in self.rules.negative_keywords:
            if neg.lower() in text:
                neg_matches.append(neg)
        if neg_matches:
            penalty = min(Decimal("0.20"), Decimal("0.10") * len(neg_matches))
            score -= penalty

        # Funding range bonus (+0.05 if in preferred range)
        if grant.funding_amount_max and self.rules.min_preferred_funding:
            if float(grant.funding_amount_max) >= self.rules.min_preferred_funding:
                score += Decimal("0.05")

        # Cap score at 1.00, floor at 0.10
        score = max(Decimal("0.10"), min(Decimal("1.00"), score))

        explanation = "; ".join(reasons) if reasons else "Base relevance"

        return score, explanation

    async def score_all_grants(self, batch_size: int = 100) -> dict:
        """
        Score all grants in the database.

        Returns:
            Stats about scoring run
        """
        if not self.rules:
            await self.load_rules()

        if not self.rules:
            return {"error": "No scoring rules available", "scored": 0}

        scored = 0
        offset = 0

        while True:
            result = await self.db.execute(
                select(GrantOpportunity)
                .order_by(GrantOpportunity.created_at)
                .offset(offset)
                .limit(batch_size)
            )
            grants = result.scalars().all()

            if not grants:
                break

            for grant in grants:
                score, explanation = self.score_grant(grant)
                grant.relevance_score = score
                grant.relevance_notes = explanation
                scored += 1

            offset += batch_size

        await self.db.commit()
        logger.info(f"Scored {scored} grants")

        return {"scored": scored, "rules_version": "current"}

    async def score_single_grant(self, grant_id: str) -> dict:
        """Score a single grant by ID."""
        from uuid import UUID

        if not self.rules:
            await self.load_rules()

        if not self.rules:
            return {"error": "No scoring rules available"}

        result = await self.db.execute(
            select(GrantOpportunity).where(GrantOpportunity.id == UUID(grant_id))
        )
        grant = result.scalar_one_or_none()

        if not grant:
            return {"error": "Grant not found"}

        score, explanation = self.score_grant(grant)
        grant.relevance_score = score
        grant.relevance_notes = explanation

        await self.db.commit()

        return {
            "grant_id": grant_id,
            "score": float(score),
            "explanation": explanation,
        }
