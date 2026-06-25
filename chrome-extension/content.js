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

function scrapeProfile() {
  // Name — try multiple selectors in order of reliability
  const fullName = scrapeText([
    "h1.text-heading-xlarge",
    "h1.inline.t-24.v-align-middle.break-words",
    ".pv-top-card--list > li:first-child",
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
    ".text-body-medium.break-words",
    "[data-field='headline']",
    ".pv-top-card-section__headline",
    ".ph5 .mt2 .t-black .break-words",
  ]);

  // Current company — try the top-card experience highlight first, then experience section
  const company = scrapeText([
    // Top-card: "at Company" or inline button
    ".pv-top-card--experience-list-item .t-bold span",
    ".pv-top-card--experience-list .pv-top-card--experience-list-item button .t-bold span",
    // Experience section first entry
    "#experience ~ .pvs-list__container li:first-child .t-bold span",
    "#experience + div li:first-child .t-bold span",
    // Fallback: any bold text in top-card details
    ".pv-top-card-v2-ctas ~ .mt2 a[data-field='experience_company_logo'] span",
  ]);

  // Location
  const location = scrapeText([
    ".text-body-small.inline.t-black--light.break-words",
    "[data-field='location']",
    ".pv-top-card--list-bullet > li span",
    ".pb2 .t-black--light span",
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
