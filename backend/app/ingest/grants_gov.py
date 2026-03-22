"""
Grants.gov API Ingestion

Fetches federal grant opportunities relevant to nonprofit organizations.
Uses the public search2 and fetchOpportunity APIs (no authentication required).

API Documentation: https://grants.gov/api/api-guide
"""

import asyncio
import logging
import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GrantOpportunity, GrantStatus, GrantSource

logger = logging.getLogger(__name__)

GRANTS_GOV_SEARCH_API = "https://api.grants.gov/v1/api/search2"
GRANTS_GOV_FETCH_API = "https://api.grants.gov/v1/api/fetchOpportunity"

# Eligibility codes for nonprofit organizations
ELIGIBILITIES = {
    "12": "Nonprofits having a 501(c)(3) status",
    "13": "Nonprofits that do not have a 501(c)(3) status",
    "25": "Others (see text field)",
    "00": "State governments",
    "01": "County governments",
    "02": "City or township governments",
}

# Funding categories relevant to Nexus Center
FUNDING_CATEGORIES = {
    "HL": "Health",
    "ISS": "Income Security and Social Services",
    "CD": "Community Development",
    "ED": "Education",
    "ST": "Science and Technology",
    "O": "Other",
}

# Keywords to search for nonprofit-relevant grants (IDD care focus)
SEARCH_KEYWORDS = [
    "disability services",
    "intellectual disability",
    "developmental disability",
    "IDD",
    "phlebotomy",
    "healthcare access",
    "sensory-friendly",
    "assistive technology",
    "ADA compliance",
    "medical care equity",
    "nonprofit capacity building",
    "community health",
    "patient education",
    "caregiver support",
    "health equity",
    "disability healthcare",
    "blood draw",
    "healthcare training",
    "community services",
    "special needs healthcare",
]


@dataclass
class IngestionResult:
    """Result of an ingestion run."""
    total_fetched: int
    new_grants: int
    updated_grants: int
    details_fetched: int
    scored: int
    errors: list[str]


class GrantsGovIngester:
    """
    Ingests grant opportunities from grants.gov.

    Uses the public search2 API to find grants and fetchOpportunity
    to get full details.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.client = httpx.AsyncClient(timeout=60.0)

    async def close(self):
        await self.client.aclose()

    async def search_grants(
        self,
        keyword: str = "",
        eligibilities: list[str] | None = None,
        funding_categories: list[str] | None = None,
        rows: int = 100,
        start_record: int = 0,
    ) -> dict:
        """
        Search grants.gov for opportunities.

        Args:
            keyword: Search term
            eligibilities: List of eligibility codes (e.g., ["01", "02"])
            funding_categories: List of funding category codes (e.g., ["CD", "ENV"])
            rows: Number of results per page (max 1000)
            start_record: Starting record for pagination

        Returns:
            API response dict with oppHits list
        """
        payload = {
            "keyword": keyword,
            "oppStatuses": "posted|forecasted",
            "rows": rows,
            "startRecordNum": start_record,
        }

        if eligibilities:
            payload["eligibilities"] = "|".join(eligibilities)

        if funding_categories:
            payload["fundingCategories"] = "|".join(funding_categories)

        response = await self.client.post(
            GRANTS_GOV_SEARCH_API,
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        response.raise_for_status()

        data = response.json()
        if data.get("errorcode") != 0:
            raise Exception(f"API error: {data.get('msg')}")

        return data.get("data", {})

    async def fetch_opportunity_details(self, opportunity_id: int) -> dict | None:
        """
        Fetch full details for a specific opportunity.

        Args:
            opportunity_id: The grants.gov opportunity ID (integer)

        Returns:
            Full opportunity data dict, or None if fetch failed
        """
        try:
            response = await self.client.post(
                GRANTS_GOV_FETCH_API,
                json={"opportunityId": opportunity_id},
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()

            data = response.json()
            if data.get("errorcode") != 0:
                logger.warning(f"fetchOpportunity error for {opportunity_id}: {data.get('msg')}")
                return None

            opp_data = data.get("data", {})

            # Check for backend unavailable error
            if "message" in opp_data and "not available" in opp_data.get("message", ""):
                logger.warning(f"Backend unavailable for opportunity {opportunity_id}")
                return None

            return opp_data

        except Exception as e:
            logger.warning(f"Failed to fetch details for {opportunity_id}: {e}")
            return None

    def _parse_date(self, date_str: str | None) -> datetime | None:
        """Parse date string from grants.gov format."""
        if not date_str:
            return None

        # Try various formats
        formats = [
            "%m/%d/%Y",
            "%b %d, %Y %I:%M:%S %p %Z",
            "%Y-%m-%d-%H-%M-%S",
        ]

        for fmt in formats:
            try:
                return datetime.strptime(date_str, fmt)
            except ValueError:
                continue

        # Try extracting just the date part
        match = re.search(r'(\w{3} \d{1,2}, \d{4})', date_str)
        if match:
            try:
                return datetime.strptime(match.group(1), "%b %d, %Y")
            except ValueError:
                pass

        logger.warning(f"Could not parse date: {date_str}")
        return None

    def _strip_html(self, html: str | None) -> str:
        """Remove HTML tags from a string."""
        if not html:
            return ""
        # Simple HTML tag removal
        clean = re.sub(r'<[^>]+>', ' ', html)
        # Normalize whitespace
        clean = re.sub(r'\s+', ' ', clean).strip()
        return clean

    def _parse_decimal(self, value: str | int | None) -> Decimal | None:
        """Parse a numeric value to Decimal."""
        if value is None:
            return None
        try:
            # Remove commas and convert
            if isinstance(value, str):
                value = value.replace(",", "")
            return Decimal(str(value))
        except Exception:
            return None

    def _map_status(self, opp_status: str) -> GrantStatus:
        """Map grants.gov status to our status enum."""
        status_map = {
            "posted": GrantStatus.OPEN,
            "forecasted": GrantStatus.OPEN,
            "closed": GrantStatus.CLOSED,
            "archived": GrantStatus.CLOSED,
        }
        return status_map.get(opp_status, GrantStatus.OPEN)

    async def _get_existing_grant(self, source_id: str) -> GrantOpportunity | None:
        """Check if a grant already exists by source_id."""
        result = await self.db.execute(
            select(GrantOpportunity)
            .where(GrantOpportunity.source == GrantSource.GRANTS_GOV)
            .where(GrantOpportunity.source_id == source_id)
        )
        return result.scalar_one_or_none()

    def _infer_categories(self, title: str, agency: str, funding_cats: list[dict] | None = None) -> list[str]:
        """Infer categories from grant data."""
        categories = []
        title_lower = (title or "").lower()
        agency_lower = (agency or "").lower()

        # From funding activity categories
        if funding_cats:
            for cat in funding_cats:
                cat_id = cat.get("id", "")
                if cat_id == "HL":
                    categories.append("healthcare")
                elif cat_id == "ISS":
                    categories.append("social_services")
                elif cat_id == "CD":
                    categories.append("community_development")
                elif cat_id == "ED":
                    categories.append("education")
                elif cat_id == "ST":
                    categories.append("research")

        # Healthcare/disability keywords
        if any(kw in title_lower for kw in ["health", "medical", "clinical", "patient", "phlebotomy", "blood"]):
            if "healthcare" not in categories:
                categories.append("healthcare")

        # Disability services
        if any(kw in title_lower for kw in ["disability", "disabled", "idd", "intellectual", "developmental", "special needs", "accessible", "ada"]):
            if "disability_services" not in categories:
                categories.append("disability_services")

        # Training/education
        if any(kw in title_lower for kw in ["training", "education", "workforce", "professional development", "certification"]):
            if "education" not in categories:
                categories.append("education")

        # Community development
        if any(kw in title_lower for kw in ["community", "nonprofit", "capacity", "outreach"]):
            if "community_development" not in categories:
                categories.append("community_development")

        # Social services
        if any(kw in title_lower for kw in ["social", "caregiver", "family", "support services"]):
            if "social_services" not in categories:
                categories.append("social_services")

        # Agency-based inference
        if "hhs" in agency_lower or "health" in agency_lower:
            if "healthcare" not in categories:
                categories.append("healthcare")
        if "acl" in agency_lower or "community living" in agency_lower:
            if "disability_services" not in categories:
                categories.append("disability_services")
        if "hrsa" in agency_lower:
            if "healthcare" not in categories:
                categories.append("healthcare")

        return categories if categories else ["other"]

    async def _upsert_grant(
        self,
        search_hit: dict,
        full_details: dict | None = None
    ) -> tuple[GrantOpportunity, bool]:
        """
        Insert or update a grant opportunity.

        Args:
            search_hit: Data from search2 API
            full_details: Optional full data from fetchOpportunity

        Returns:
            Tuple of (grant, is_new)
        """
        source_id = str(search_hit.get("id", ""))
        existing = await self._get_existing_grant(source_id)

        # Extract data from search hit
        title = search_hit.get("title", "Unknown")
        agency = search_hit.get("agency")
        opp_status = search_hit.get("oppStatus", "posted")

        # Initialize fields
        description = None
        eligibility = None
        funding_min = None
        funding_max = None
        cost_sharing = False
        open_date = None
        close_date = None
        cfda_number = None
        funding_cats = None

        # If we have full details, extract additional info
        if full_details:
            synopsis = full_details.get("synopsis", {})

            # Description from synopsis
            synopsis_desc = synopsis.get("synopsisDesc") or synopsis.get("fundingActivityCategoryDesc")
            description = self._strip_html(synopsis_desc)

            # Eligibility
            eligibility = synopsis.get("applicantEligibilityDesc")

            # Funding amounts
            funding_min = self._parse_decimal(synopsis.get("awardFloor"))
            funding_max = self._parse_decimal(synopsis.get("awardCeiling"))

            # Cost sharing
            cost_sharing = synopsis.get("costSharing", False)

            # Dates
            open_date = self._parse_date(synopsis.get("postingDate"))
            close_date = self._parse_date(synopsis.get("responseDate"))

            # CFDA/ALN numbers
            alns = full_details.get("alns", [])
            if alns:
                cfda_number = alns[0].get("aln") if alns else None

            # Funding categories
            funding_cats = synopsis.get("fundingActivityCategories", [])

        # Parse deadline from search hit
        deadline = self._parse_date(search_hit.get("closeDate"))
        if not deadline and close_date:
            deadline = close_date

        # Build content text for search
        content_parts = [title, agency or ""]
        if description:
            content_parts.append(description)
        if eligibility:
            content_parts.append(eligibility)
        content_text = "\n".join(filter(None, content_parts))

        # Infer categories
        categories = self._infer_categories(title, agency or "", funding_cats)

        if existing:
            # Update existing grant
            existing.title = title
            existing.agency = agency
            existing.status = self._map_status(opp_status)
            existing.deadline = deadline
            existing.source_url = f"https://www.grants.gov/search-results-detail/{source_id}"

            # Update with full details if available
            if full_details:
                existing.description = description
                existing.eligibility = eligibility
                existing.funding_amount_min = funding_min
                existing.funding_amount_max = funding_max
                existing.cost_sharing_required = cost_sharing
                existing.open_date = open_date
                existing.close_date = close_date
                existing.cfda_number = cfda_number
                existing.content_text = content_text
                existing.categories = categories

            return existing, False
        else:
            # Create new grant
            grant = GrantOpportunity(
                source=GrantSource.GRANTS_GOV,
                source_id=source_id,
                title=title,
                agency=agency,
                description=description,
                eligibility=eligibility,
                funding_amount_min=funding_min,
                funding_amount_max=funding_max,
                cost_sharing_required=cost_sharing,
                open_date=open_date,
                deadline=deadline,
                close_date=close_date,
                status=self._map_status(opp_status),
                categories=categories,
                cfda_number=cfda_number,
                content_text=content_text,
                source_url=f"https://www.grants.gov/search-results-detail/{source_id}",
            )
            self.db.add(grant)
            return grant, True

    async def ingest_all(
        self,
        eligibilities: list[str] | None = None,
        keywords: list[str] | None = None,
        max_results: int = 500,
        fetch_details: bool = True,
        detail_delay: float = 0.5,
        score_grants: bool = True,
    ) -> IngestionResult:
        """
        Run full ingestion from grants.gov.

        Args:
            eligibilities: Eligibility codes to filter by (default: municipal governments)
            keywords: Keywords to search (default: SEARCH_KEYWORDS)
            max_results: Maximum total results to fetch
            fetch_details: Whether to fetch full details for each grant
            detail_delay: Delay between detail fetches (rate limiting)
            score_grants: Whether to score grants for relevance after ingestion

        Returns:
            IngestionResult with statistics
        """
        if eligibilities is None:
            eligibilities = list(ELIGIBILITIES.keys())

        if keywords is None:
            keywords = SEARCH_KEYWORDS

        result = IngestionResult(
            total_fetched=0,
            new_grants=0,
            updated_grants=0,
            details_fetched=0,
            scored=0,
            errors=[],
        )

        seen_ids: set[str] = set()

        # Search by each keyword
        for keyword in keywords:
            if result.total_fetched >= max_results:
                break

            try:
                logger.info(f"Searching grants.gov for: {keyword}")

                data = await self.search_grants(
                    keyword=keyword,
                    eligibilities=eligibilities,
                    rows=min(100, max_results - result.total_fetched),
                )

                hits = data.get("oppHits", [])
                logger.info(f"Found {len(hits)} grants for '{keyword}' (total: {data.get('hitCount', 0)})")

                for opp in hits:
                    if result.total_fetched >= max_results:
                        break

                    opp_id = str(opp.get("id", ""))
                    if opp_id in seen_ids:
                        continue
                    seen_ids.add(opp_id)

                    try:
                        # Fetch full details if enabled
                        full_details = None
                        if fetch_details:
                            full_details = await self.fetch_opportunity_details(int(opp_id))
                            if full_details:
                                result.details_fetched += 1
                            # Rate limiting
                            await asyncio.sleep(detail_delay)

                        grant, is_new = await self._upsert_grant(opp, full_details)
                        result.total_fetched += 1
                        if is_new:
                            result.new_grants += 1
                        else:
                            result.updated_grants += 1

                    except Exception as e:
                        error_msg = f"Error processing grant {opp_id}: {e}"
                        logger.error(error_msg)
                        result.errors.append(error_msg)

            except Exception as e:
                error_msg = f"Error searching for '{keyword}': {e}"
                logger.error(error_msg)
                result.errors.append(error_msg)

        # Commit all changes
        try:
            await self.db.commit()
            logger.info(
                f"Ingestion complete: {result.new_grants} new, "
                f"{result.updated_grants} updated, {result.details_fetched} with details, "
                f"{len(result.errors)} errors"
            )
        except Exception as e:
            await self.db.rollback()
            result.errors.append(f"Database commit failed: {e}")
            logger.error(f"Failed to commit: {e}")
            return result

        # Score grants if enabled
        if score_grants and result.total_fetched > 0:
            try:
                from app.scoring.relevance import RelevanceScorer
                scorer = RelevanceScorer(self.db)
                try:
                    scoring_result = await scorer.score_all_grants()
                    result.scored = scoring_result.get("scored", 0)
                    logger.info(f"Scored {result.scored} grants")
                except Exception as e:
                    logger.warning(f"Scoring failed (non-fatal): {e}")
                    result.errors.append(f"Scoring failed: {e}")
                finally:
                    await scorer.close()
            except Exception as e:
                logger.warning(f"Could not initialize scorer: {e}")

        return result

    async def ingest_by_category(
        self,
        categories: list[str],
        max_results: int = 200,
        fetch_details: bool = True,
        score_grants: bool = True,
    ) -> IngestionResult:
        """
        Ingest grants filtered by funding category.

        Args:
            categories: List of funding category codes (e.g., ["CD", "ENV"])
            max_results: Maximum results to fetch
            fetch_details: Whether to fetch full details
            score_grants: Whether to score grants for relevance after ingestion

        Returns:
            IngestionResult with statistics
        """
        eligibilities = list(ELIGIBILITIES.keys())

        result = IngestionResult(
            total_fetched=0,
            new_grants=0,
            updated_grants=0,
            details_fetched=0,
            scored=0,
            errors=[],
        )

        seen_ids: set[str] = set()

        try:
            logger.info(f"Searching grants.gov by categories: {categories}")

            data = await self.search_grants(
                keyword="",
                eligibilities=eligibilities,
                funding_categories=categories,
                rows=max_results,
            )

            hits = data.get("oppHits", [])
            logger.info(f"Found {len(hits)} grants (total: {data.get('hitCount', 0)})")

            for opp in hits:
                opp_id = str(opp.get("id", ""))
                if opp_id in seen_ids:
                    continue
                seen_ids.add(opp_id)

                try:
                    # Fetch full details if enabled
                    full_details = None
                    if fetch_details:
                        full_details = await self.fetch_opportunity_details(int(opp_id))
                        if full_details:
                            result.details_fetched += 1
                        await asyncio.sleep(0.5)

                    grant, is_new = await self._upsert_grant(opp, full_details)
                    result.total_fetched += 1
                    if is_new:
                        result.new_grants += 1
                    else:
                        result.updated_grants += 1
                except Exception as e:
                    error_msg = f"Error processing grant {opp_id}: {e}"
                    logger.error(error_msg)
                    result.errors.append(error_msg)

        except Exception as e:
            error_msg = f"Error searching categories: {e}"
            logger.error(error_msg)
            result.errors.append(error_msg)

        # Commit all changes
        try:
            await self.db.commit()
            logger.info(
                f"Category ingestion complete: {result.new_grants} new, "
                f"{result.updated_grants} updated, {result.details_fetched} with details"
            )
        except Exception as e:
            await self.db.rollback()
            result.errors.append(f"Database commit failed: {e}")
            return result

        # Score grants if enabled
        if score_grants and result.total_fetched > 0:
            try:
                from app.scoring.relevance import RelevanceScorer
                scorer = RelevanceScorer(self.db)
                try:
                    scoring_result = await scorer.score_all_grants()
                    result.scored = scoring_result.get("scored", 0)
                    logger.info(f"Scored {result.scored} grants")
                except Exception as e:
                    logger.warning(f"Scoring failed (non-fatal): {e}")
                    result.errors.append(f"Scoring failed: {e}")
                finally:
                    await scorer.close()
            except Exception as e:
                logger.warning(f"Could not initialize scorer: {e}")

        return result

    async def refresh_grant_details(self, grant_id: str) -> bool:
        """
        Refresh details for a specific grant from grants.gov.

        Args:
            grant_id: UUID of the grant in our database

        Returns:
            True if refresh succeeded
        """
        from uuid import UUID as PyUUID

        try:
            result = await self.db.execute(
                select(GrantOpportunity).where(GrantOpportunity.id == PyUUID(grant_id))
            )
            grant = result.scalar_one_or_none()

            if not grant or grant.source != GrantSource.GRANTS_GOV:
                return False

            if not grant.source_id:
                return False

            full_details = await self.fetch_opportunity_details(int(grant.source_id))
            if not full_details:
                return False

            synopsis = full_details.get("synopsis", {})

            # Update fields
            synopsis_desc = synopsis.get("synopsisDesc") or synopsis.get("fundingActivityCategoryDesc")
            grant.description = self._strip_html(synopsis_desc)
            grant.eligibility = synopsis.get("applicantEligibilityDesc")
            grant.funding_amount_min = self._parse_decimal(synopsis.get("awardFloor"))
            grant.funding_amount_max = self._parse_decimal(synopsis.get("awardCeiling"))
            grant.cost_sharing_required = synopsis.get("costSharing", False)
            grant.open_date = self._parse_date(synopsis.get("postingDate"))
            grant.close_date = self._parse_date(synopsis.get("responseDate"))

            alns = full_details.get("alns", [])
            if alns:
                grant.cfda_number = alns[0].get("aln")

            # Update content text
            content_parts = [grant.title, grant.agency or ""]
            if grant.description:
                content_parts.append(grant.description)
            if grant.eligibility:
                content_parts.append(grant.eligibility)
            grant.content_text = "\n".join(filter(None, content_parts))

            await self.db.commit()
            return True

        except Exception as e:
            logger.error(f"Failed to refresh grant {grant_id}: {e}")
            await self.db.rollback()
            return False
