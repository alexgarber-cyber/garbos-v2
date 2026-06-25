// Runs on linkedin.com/in/* pages. Responds to GET_PROFILE messages from the popup.

function scrapeText(selectors) {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.innerText || el.textContent || "";
        const trimmed = text.trim();
        if (trimmed) return trimmed;
      }
    } catch (_) {}
  }
  return "";
}

// Company requires navigating to the experience section rather than a simple selector,
// because LinkedIn renders text as aria-hidden/screen-reader pairs and the top-card
// experience component no longer exists in current LinkedIn DOM.
function scrapeCompany() {
  const sections = document.querySelectorAll("section[data-view-name='profile-card']");
  const expSection = Array.from(sections).find(s => s.children[0]?.id === "experience");
  if (expSection) {
    const firstLi = expSection.querySelector("ul > li");
    if (firstLi) {
      // Yields "Google · Full-time" — split to get just the company name
      const compEl = firstLi.querySelector("span.t-14.t-normal > span[aria-hidden='true']");
      if (compEl) {
        const raw = compEl.textContent.trim();
        if (raw) return raw.split(" · ")[0].trim();
      }
      // Fallback: some single-role layouts put company in a bold span
      const boldEl = firstLi.querySelector("div.t-bold > span[aria-hidden='true']");
      if (boldEl) return boldEl.textContent.trim();
    }
  }
  // Top-card fallbacks for older/alternate LinkedIn layouts
  return scrapeText([
    ".pv-text-details__right-panel span[aria-hidden='true']",
    "a[data-field='experience_company_logo'] span[aria-hidden='true']",
  ]);
}

function scrapeProfile() {
  // Name
  const fullName = scrapeText([
    "div.mt2.relative h1",
    "main h1",
    "h1.text-heading-xlarge",
    "h1",
  ]);

  let firstName = "";
  let lastName = "";
  if (fullName) {
    const parts = fullName.split(/\s+/);
    firstName = parts[0] || "";
    lastName = parts.slice(1).join(" ");
  }

  // Title / headline
  const title = scrapeText([
    "div.mt2.relative div.text-body-medium.break-words",
    "div.text-body-medium.break-words",
    "[data-field='headline']",
  ]);

  // Current company
  const company = scrapeCompany();

  // Location
  const location = scrapeText([
    "span.text-body-small.inline.t-black--light.break-words",
    "div.pb2.pv-text-details__left-panel span.text-body-small.inline.t-black--light.break-words",
    "[data-field='location']",
    ".pv-text-details__left-panel span.text-body-small",
  ]);

  // LinkedIn URL — canonical from current page, strip query/hash
  const linkedinUrl = window.location.href.split("?")[0].split("#")[0].replace(/\/$/, "");

  return { firstName, lastName, fullName, title, company, location, linkedinUrl };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_PROFILE") {
    try {
      sendResponse({ ok: true, data: scrapeProfile() });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  }
  return true; // keep channel open for async (not needed here but harmless)
});
