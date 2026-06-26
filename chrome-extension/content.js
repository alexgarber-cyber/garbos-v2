// Runs in isolated world on linkedin.com/in/* pages.
// DOM scraping happens via an injected MAIN-world script; data returns via postMessage.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_PROFILE") {
    const messageId = "GARBOS_" + Date.now();

    const handler = (e) => {
      if (e.data && e.data.type === messageId) {
        window.removeEventListener("message", handler);
        sendResponse({ ok: true, data: e.data });
      }
    };
    window.addEventListener("message", handler);

    setTimeout(() => {
      window.removeEventListener("message", handler);
      sendResponse({ ok: false, error: "Scrape timeout" });
    }, 3000);

    const script = document.createElement("script");
    script.textContent =
      "(function() {" +
      "  function scrapeText(selectors) {" +
      "    for (var i = 0; i < selectors.length; i++) {" +
      "      try {" +
      "        var el = document.querySelector(selectors[i]);" +
      "        if (el) {" +
      "          var text = (el.innerText || el.textContent || '').trim();" +
      "          if (text) return text;" +
      "        }" +
      "      } catch (_) {}" +
      "    }" +
      "    return '';" +
      "  }" +
      "  function scrapeCompany() {" +
      "    var sections = document.querySelectorAll(\"section[data-view-name='profile-card']\");" +
      "    var expSection = null;" +
      "    for (var i = 0; i < sections.length; i++) {" +
      "      if (sections[i].children[0] && sections[i].children[0].id === 'experience') {" +
      "        expSection = sections[i]; break;" +
      "      }" +
      "    }" +
      "    if (expSection) {" +
      "      var firstLi = expSection.querySelector('ul > li');" +
      "      if (firstLi) {" +
      "        var compEl = firstLi.querySelector(\"span.t-14.t-normal > span[aria-hidden='true']\");" +
      "        if (compEl) {" +
      "          var raw = compEl.textContent.trim();" +
      "          if (raw) return raw.split(' \\u00b7 ')[0].trim();" +
      "        }" +
      "        var boldEl = firstLi.querySelector(\"div.t-bold > span[aria-hidden='true']\");" +
      "        if (boldEl) return boldEl.textContent.trim();" +
      "      }" +
      "    }" +
      "    return scrapeText([" +
      "      \".pv-text-details__right-panel span[aria-hidden='true']\"," +
      "      \"a[data-field='experience_company_logo'] span[aria-hidden='true']\"" +
      "    ]);" +
      "  }" +
      "  var fullName = scrapeText([" +
      "    'div.mt2.relative h1'," +
      "    'main h1'," +
      "    'h1.text-heading-xlarge'," +
      "    'h1'" +
      "  ]);" +
      "  var firstName = '', lastName = '';" +
      "  if (fullName) {" +
      "    var parts = fullName.split(/\\s+/);" +
      "    firstName = parts[0] || '';" +
      "    lastName = parts.slice(1).join(' ');" +
      "  }" +
      "  var title = scrapeText([" +
      "    'div.mt2.relative div.text-body-medium.break-words'," +
      "    'div.text-body-medium.break-words'," +
      "    \"[data-field='headline']\"" +
      "  ]);" +
      "  var company = scrapeCompany();" +
      "  var location = scrapeText([" +
      "    'span.text-body-small.inline.t-black--light.break-words'," +
      "    'div.pb2.pv-text-details__left-panel span.text-body-small.inline.t-black--light.break-words'," +
      "    \"[data-field='location']\"," +
      "    '.pv-text-details__left-panel span.text-body-small'" +
      "  ]);" +
      "  var linkedinUrl = window.location.href.split('?')[0].split('#')[0].replace(/\\/+$/, '');" +
      "  window.postMessage({ type: '" + messageId + "', firstName: firstName, lastName: lastName, fullName: fullName, title: title, company: company, location: location, linkedinUrl: linkedinUrl }, '*');" +
      "})();";

    document.head.appendChild(script);
    script.remove();

    return true; // keep message channel open for async sendResponse
  }
});
