"""
GrantExec Portal Ingestion

Browser automation to scrape grant opportunities from GrantExec portal.
Uses Playwright for headless browsing with randomized timing to avoid detection.

Credentials are loaded from environment variables:
- GRANTEXEC_USERNAME
- GRANTEXEC_PASSWORD
"""

import asyncio
import logging
import os
import random
import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Optional

from playwright.async_api import async_playwright, Page, Browser
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GrantOpportunity, GrantStatus, GrantSource

logger = logging.getLogger(__name__)

# GrantExec portal URLs
GRANTEXEC_BASE_URL = "https://www.grantexec.com"
GRANTEXEC_LOGIN_URL = "https://platform.grantexec.com/"
# Public grants page for New Mexico - no login required
GRANTEXEC_NM_GRANTS_URL = f"{GRANTEXEC_BASE_URL}/grants/state/new-mexico"


@dataclass
class IngestionResult:
    """Result of a GrantExec ingestion run."""
    total_fetched: int
    new_grants: int
    updated_grants: int
    errors: list[str]


def get_credentials() -> tuple[str, str]:
    """Get GrantExec credentials from environment."""
    username = os.getenv("GRANTEXEC_USERNAME", "")
    password = os.getenv("GRANTEXEC_PASSWORD", "")

    if not username or not password:
        raise ValueError("GRANTEXEC_USERNAME and GRANTEXEC_PASSWORD must be set")

    return username, password


async def random_delay(min_seconds: float = 1.0, max_seconds: float = 3.0):
    """Wait a random amount of time to simulate human behavior."""
    delay = random.uniform(min_seconds, max_seconds)
    await asyncio.sleep(delay)


async def human_type(page: Page, selector: str, text: str):
    """Type text with random delays between keystrokes to simulate human typing."""
    element = await page.wait_for_selector(selector)
    await element.click()

    for char in text:
        await page.keyboard.type(char)
        # Random delay between keystrokes (50-150ms)
        await asyncio.sleep(random.uniform(0.05, 0.15))


class GrantExecIngester:
    """
    Scrapes grant opportunities from GrantExec portal.

    Uses Playwright for browser automation with human-like behavior
    to avoid detection.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None

    async def start_browser(self, headless: bool = True):
        """Start the browser instance."""
        playwright = await async_playwright().start()

        # Use Firefox for better fingerprint resistance
        self.browser = await playwright.firefox.launch(
            headless=headless,
            slow_mo=50,  # Slow down operations slightly
        )

        # Create a context with realistic settings
        context = await self.browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
            locale="en-US",
            timezone_id="America/Denver",
        )

        self.page = await context.new_page()
        logger.info("Browser started")

    async def close(self):
        """Close the browser."""
        if self.browser:
            await self.browser.close()
            logger.info("Browser closed")

    async def navigate_to_grants(self) -> bool:
        """Navigate to public grants listing page (no login required)."""
        if not self.page:
            raise RuntimeError("Browser not started")

        try:
            logger.info(f"Navigating to grants listing: {GRANTEXEC_NM_GRANTS_URL}")
            await self.page.goto(GRANTEXEC_NM_GRANTS_URL)
            await random_delay(2, 4)

            # Wait for grants to load
            await self.page.wait_for_load_state("networkidle")
            await random_delay(1, 2)

            logger.info("Navigated to grants listing")
            return True

        except Exception as e:
            logger.exception(f"Failed to navigate to grants: {e}")
            return False

    def _parse_amount(self, text: str) -> Optional[Decimal]:
        """Parse a dollar amount from text."""
        if not text:
            return None

        # Remove $ and commas, find numbers
        match = re.search(r'\$?([\d,]+(?:\.\d{2})?)', text.replace(',', ''))
        if match:
            try:
                return Decimal(match.group(1).replace(',', ''))
            except:
                pass
        return None

    def _parse_date(self, text: str) -> Optional[datetime]:
        """Parse a date from various formats."""
        if not text:
            return None

        formats = [
            "%m/%d/%Y",
            "%m-%d-%Y",
            "%Y-%m-%d",
            "%B %d, %Y",
            "%b %d, %Y",
        ]

        for fmt in formats:
            try:
                return datetime.strptime(text.strip(), fmt)
            except ValueError:
                continue

        return None

    async def _get_existing_grant(self, source_id: str) -> Optional[GrantOpportunity]:
        """Check if a grant already exists by source_id."""
        result = await self.db.execute(
            select(GrantOpportunity)
            .where(GrantOpportunity.source == GrantSource.GRANTEXEC)
            .where(GrantOpportunity.source_id == source_id)
        )
        return result.scalar_one_or_none()

    async def parse_grant_listing(self) -> list[dict]:
        """
        Parse grant opportunities from the current page.

        GrantExec uses card components with shadow-sm class for grant listings.
        Returns a list of grant data dictionaries.
        """
        if not self.page:
            raise RuntimeError("Browser not started")

        grants = []

        try:
            # Wait for content to load
            await self.page.wait_for_load_state("networkidle")
            await random_delay(1, 2)

            # GrantExec uses card elements with these classes
            # Try various selectors based on the page structure
            selectors_to_try = [
                "div.rounded-lg.border.shadow-sm",  # Card with shadow
                "div[class*='card'][class*='shadow']",
                "div.border.rounded-lg",
                "article",
                "div.p-6",  # Card padding
            ]

            grant_elements = []
            for selector in selectors_to_try:
                try:
                    elements = await self.page.query_selector_all(selector)
                    # Filter to only elements that look like grant cards
                    if elements and len(elements) > 0:
                        # Check if first element has grant-like content
                        first_text = await elements[0].inner_text()
                        if "$" in first_text or "grant" in first_text.lower() or "funding" in first_text.lower():
                            grant_elements = elements
                            logger.info(f"Found {len(elements)} potential grants with selector: {selector}")
                            break
                except Exception as e:
                    logger.debug(f"Selector {selector} failed: {e}")
                    continue

            if not grant_elements:
                # Try a more generic approach - get all links to grant detail pages
                logger.info("Trying to find grants via links...")
                links = await self.page.query_selector_all("a[href*='/grants/']")
                for link in links:
                    try:
                        href = await link.get_attribute("href")
                        if href and "/grants/" in href and "state" not in href:
                            # This might be a grant detail link
                            parent = await link.evaluate_handle("el => el.closest('div.border, article, section')")
                            if parent:
                                grant_elements.append(parent)
                    except:
                        continue
                logger.info(f"Found {len(grant_elements)} grants via links")

            if not grant_elements:
                logger.warning("No grant elements found on page")
                # Take a screenshot for debugging
                await self.page.screenshot(path="/tmp/grantexec_debug.png")
                # Get page content for debugging
                content = await self.page.content()
                logger.debug(f"Page content preview: {content[:2000]}")
                return []

            for element in grant_elements[:50]:  # Limit to 50 per page
                try:
                    grant_data = await self._parse_grant_element(element)
                    if grant_data:
                        grants.append(grant_data)
                except Exception as e:
                    logger.warning(f"Failed to parse grant element: {e}")

        except Exception as e:
            logger.exception(f"Failed to parse grant listing: {e}")

        logger.info(f"Parsed {len(grants)} grants from page")
        return grants

    async def _parse_grant_element(self, element) -> Optional[dict]:
        """
        Parse a single grant element from GrantExec card.

        GrantExec cards typically show:
        - Grant title (linked)
        - Award amount (prominently displayed)
        - Funder/agency
        - Deadline type
        - Brief description
        """
        try:
            # Get all text from the element
            full_text = await element.inner_text()

            # Skip if too short or doesn't look like a grant
            if len(full_text) < 50:
                return None

            # Try to extract grant ID from link
            grant_id = None
            source_url = None
            link = await element.query_selector("a[href*='/grants/']")
            if link:
                href = await link.get_attribute("href")
                if href:
                    # Extract slug from URL like /grants/some-grant-name-12345
                    match = re.search(r'/grants/([^/\s]+)', href)
                    if match:
                        grant_id = match.group(1)
                    source_url = href if href.startswith("http") else f"{GRANTEXEC_BASE_URL}{href}"

            if not grant_id:
                # Generate ID from content hash
                grant_id = f"ge-{abs(hash(full_text[:200])) % 10000000}"

            # Extract title - usually in a heading or bold link
            title = ""
            for sel in ["h2", "h3", "h4", "a.font-bold", "a.font-semibold", "strong", "b", "a"]:
                try:
                    title_el = await element.query_selector(sel)
                    if title_el:
                        title = (await title_el.inner_text()).strip()
                        # Skip if title is just an amount or too short
                        if title and len(title) > 10 and not title.startswith("$"):
                            break
                        title = ""
                except:
                    continue

            if not title:
                # Try to extract from full text - first substantial line
                lines = [l.strip() for l in full_text.split("\n") if l.strip()]
                for line in lines:
                    if len(line) > 20 and not line.startswith("$") and "deadline" not in line.lower():
                        title = line
                        break

            if not title:
                return None

            # Extract amount - look for dollar amounts
            amount = None
            amount_match = re.search(r'\$[\d,]+(?:\.\d{2})?(?:\s*-\s*\$[\d,]+(?:\.\d{2})?)?', full_text)
            if amount_match:
                # If there's a range, take the higher amount
                amounts = re.findall(r'\$([\d,]+(?:\.\d{2})?)', amount_match.group())
                if amounts:
                    max_amount = max(Decimal(a.replace(',', '')) for a in amounts)
                    amount = max_amount

            # Extract funder/agency - usually after title
            agency = ""
            # Look for common patterns like "Funded by:" or organization names
            agency_patterns = [
                r'(?:Funded by|Funder|From|By)[:\s]+([^\n$]+)',
                r'((?:Department|Bureau|Foundation|Agency|Administration|Office)[^\n$]+)',
            ]
            for pattern in agency_patterns:
                match = re.search(pattern, full_text, re.IGNORECASE)
                if match:
                    agency = match.group(1).strip()
                    break

            # Extract deadline
            deadline = None
            deadline_patterns = [
                r'(?:Deadline|Due|Closes?)[:\s]+([^\n]+)',
                r'(\d{1,2}/\d{1,2}/\d{2,4})',
            ]
            for pattern in deadline_patterns:
                match = re.search(pattern, full_text, re.IGNORECASE)
                if match:
                    deadline_text = match.group(1).strip()
                    if "rolling" not in deadline_text.lower():
                        deadline = self._parse_date(deadline_text)
                    break

            # Extract description - text after title
            description = ""
            lines = [l.strip() for l in full_text.split("\n") if l.strip()]
            for i, line in enumerate(lines):
                # Skip title, amounts, and short lines
                if line == title or line.startswith("$") or len(line) < 30:
                    continue
                # Take first substantial descriptive text
                if not any(kw in line.lower() for kw in ["deadline", "rolling", "funded by"]):
                    description = line
                    break

            return {
                "source_id": str(grant_id),
                "title": title[:500],  # Limit title length
                "description": description[:2000],
                "agency": agency[:255],
                "funding_amount_max": amount,
                "deadline": deadline,
                "source_url": source_url,
            }

        except Exception as e:
            logger.warning(f"Failed to parse grant element: {e}")
            return None

    async def scrape_grant_detail(self, url: str) -> dict:
        """
        Scrape additional details from a grant detail page.

        Args:
            url: URL of the grant detail page

        Returns:
            Dictionary with additional grant details
        """
        if not self.page:
            raise RuntimeError("Browser not started")

        try:
            await random_delay(2, 4)
            await self.page.goto(url)
            await self.page.wait_for_load_state("networkidle")
            await random_delay(1, 2)

            details = {}

            # Try to extract eligibility
            for sel in [".eligibility", "#eligibility", "[data-section='eligibility']"]:
                el = await self.page.query_selector(sel)
                if el:
                    details["eligibility"] = (await el.inner_text()).strip()
                    break

            # Try to extract full description
            for sel in [".full-description", ".description", "#description"]:
                el = await self.page.query_selector(sel)
                if el:
                    details["description"] = (await el.inner_text()).strip()
                    break

            return details

        except Exception as e:
            logger.warning(f"Failed to scrape grant detail {url}: {e}")
            return {}

    async def ingest_all(
        self,
        max_pages: int = 10,
        fetch_details: bool = False,
    ) -> IngestionResult:
        """
        Run full ingestion from GrantExec public grants page.

        Uses the public New Mexico grants listing at grantexec.com
        which doesn't require login.

        Args:
            max_pages: Maximum number of listing pages to scrape
            fetch_details: Whether to fetch full details for each grant

        Returns:
            IngestionResult with statistics
        """
        result = IngestionResult(
            total_fetched=0,
            new_grants=0,
            updated_grants=0,
            errors=[],
        )

        try:
            await self.start_browser()

            # Navigate directly to public grants page (no login needed)
            if not await self.navigate_to_grants():
                result.errors.append("Failed to navigate to grants listing")
                return result

            # Scrape grants from listing pages
            for page_num in range(max_pages):
                logger.info(f"Scraping page {page_num + 1}...")

                grants = await self.parse_grant_listing()

                if not grants:
                    logger.info("No more grants found, stopping")
                    break

                for grant_data in grants:
                    try:
                        # Fetch additional details if requested
                        if fetch_details and grant_data.get("source_url"):
                            details = await self.scrape_grant_detail(grant_data["source_url"])
                            grant_data.update(details)
                            await random_delay(1, 3)

                        # Upsert grant
                        await self._upsert_grant(grant_data, result)

                    except Exception as e:
                        error_msg = f"Error processing grant {grant_data.get('source_id')}: {e}"
                        logger.error(error_msg)
                        result.errors.append(error_msg)

                # Try to navigate to next page
                if not await self._next_page():
                    logger.info("No more pages available")
                    break

                await random_delay(2, 4)

            # Commit changes
            await self.db.commit()
            logger.info(f"Ingestion complete: {result.new_grants} new, {result.updated_grants} updated")

        except Exception as e:
            await self.db.rollback()
            result.errors.append(f"Ingestion failed: {e}")
            logger.exception("Ingestion failed")

        finally:
            await self.close()

        return result

    async def _next_page(self) -> bool:
        """Navigate to the next page of results."""
        if not self.page:
            return False

        try:
            # Try common pagination selectors
            next_selectors = [
                "a:has-text('Next')",
                ".pagination .next",
                "button:has-text('Next')",
                "[aria-label='Next page']",
                ".next-page",
            ]

            for selector in next_selectors:
                try:
                    next_btn = await self.page.wait_for_selector(selector, timeout=2000)
                    if next_btn:
                        is_disabled = await next_btn.get_attribute("disabled")
                        if not is_disabled:
                            await next_btn.click()
                            await self.page.wait_for_load_state("networkidle")
                            return True
                except:
                    continue

            return False

        except Exception as e:
            logger.warning(f"Failed to navigate to next page: {e}")
            return False

    async def _upsert_grant(self, data: dict, result: IngestionResult):
        """Insert or update a grant opportunity."""
        source_id = data.get("source_id", "")
        existing = await self._get_existing_grant(source_id)

        # Build content text for search
        content_parts = [
            data.get("title", ""),
            data.get("agency", ""),
            data.get("description", ""),
            data.get("eligibility", ""),
        ]
        content_text = "\n".join(filter(None, content_parts))

        # Infer categories
        categories = self._infer_categories(data.get("title", ""), data.get("agency", ""))

        if existing:
            # Update existing
            existing.title = data.get("title", existing.title)
            existing.agency = data.get("agency", existing.agency)
            existing.description = data.get("description", existing.description)
            existing.eligibility = data.get("eligibility", existing.eligibility)
            existing.funding_amount_max = data.get("funding_amount_max", existing.funding_amount_max)
            existing.deadline = data.get("deadline", existing.deadline)
            existing.source_url = data.get("source_url", existing.source_url)
            existing.content_text = content_text
            existing.categories = categories
            result.updated_grants += 1
        else:
            # Create new
            grant = GrantOpportunity(
                source=GrantSource.GRANTEXEC,
                source_id=source_id,
                title=data.get("title", "Unknown"),
                agency=data.get("agency"),
                description=data.get("description"),
                eligibility=data.get("eligibility"),
                funding_amount_max=data.get("funding_amount_max"),
                deadline=data.get("deadline"),
                source_url=data.get("source_url"),
                content_text=content_text,
                categories=categories,
                status=GrantStatus.OPEN,
            )
            self.db.add(grant)
            result.new_grants += 1

        result.total_fetched += 1

    def _infer_categories(self, title: str, agency: str) -> list[str]:
        """Infer categories from grant title and agency."""
        categories = []
        title_lower = (title or "").lower()
        agency_lower = (agency or "").lower()
        combined = f"{title_lower} {agency_lower}"

        if any(kw in combined for kw in ["health", "medical", "clinical", "patient", "phlebotomy", "blood"]):
            categories.append("healthcare")
        if any(kw in combined for kw in ["disability", "disabled", "idd", "intellectual", "developmental", "special needs", "ada"]):
            categories.append("disability_services")
        if any(kw in combined for kw in ["training", "education", "workforce", "certification"]):
            categories.append("education")
        if any(kw in combined for kw in ["community", "nonprofit", "capacity", "outreach"]):
            categories.append("community_development")
        if any(kw in combined for kw in ["social", "caregiver", "family", "support services"]):
            categories.append("social_services")

        return categories if categories else ["other"]
