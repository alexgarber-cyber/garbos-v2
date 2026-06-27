const DEFAULT_API_URL = "https://garbos.io/api";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const settingsPanel  = document.getElementById("settings-panel");
const mainContent    = document.getElementById("main-content");
const settingsBar    = document.getElementById("settings-bar");
const inputApiUrl    = document.getElementById("input-api-url");
const inputToken     = document.getElementById("input-token");
const btnSave        = document.getElementById("btn-save-settings");
const btnOpenSettings = document.getElementById("btn-open-settings");

const profileSection = document.getElementById("profile-section");
const actionSection  = document.getElementById("action-section");
const noticeSection  = document.getElementById("notice-section");
const noticeText     = document.getElementById("notice-text");
const loadingSection = document.getElementById("loading-section");

const fName     = document.getElementById("f-name");
const fTitle    = document.getElementById("f-title");
const fCompany  = document.getElementById("f-company");
const fLocation = document.getElementById("f-location");
const fUrl      = document.getElementById("f-url");

const dupWarning = document.getElementById("duplicate-warning");
const dupTitle   = document.getElementById("dup-title");
const dupDetail  = document.getElementById("dup-detail");

const btnProspect = document.getElementById("btn-prospect");
const btnContact  = document.getElementById("btn-contact");
const resultDiv   = document.getElementById("result");

// ── State ─────────────────────────────────────────────────────────────────────
let apiUrl = DEFAULT_API_URL;
let token  = "";
let profile = null; // stashed scrape result; Add buttons read from this

// ── Helpers ───────────────────────────────────────────────────────────────────
function showLoading() {
  loadingSection.style.display = "";
  profileSection.style.display = "none";
  actionSection.style.display = "none";
  noticeSection.style.display = "none";
}

function showNotice(msg) {
  loadingSection.style.display = "none";
  profileSection.style.display = "none";
  actionSection.style.display = "none";
  noticeSection.style.display = "";
  noticeText.textContent = msg;
}

// showError reuses the notice element to surface scrape/injection failures.
function showError(msg) {
  showNotice(msg);
}

function showProfile() {
  loadingSection.style.display = "none";
  profileSection.style.display = "";
  actionSection.style.display = "";
  noticeSection.style.display = "none";
}

function setResult(msg, isError) {
  resultDiv.className = isError ? "result-err" : "result-ok";
  resultDiv.textContent = msg;
}

function setButtons(enabled) {
  btnProspect.disabled = !enabled;
  btnContact.disabled = !enabled;
}

async function apiFetch(path, opts = {}) {
  const url = `${apiUrl}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Settings ──────────────────────────────────────────────────────────────────
function showSettingsPanel() {
  settingsPanel.style.display = "";
  mainContent.style.display = "none";
  chrome.storage.local.get(["garbos_api_url", "garbos_token"], (stored) => {
    inputApiUrl.value = stored.garbos_api_url || DEFAULT_API_URL;
    inputToken.value  = stored.garbos_token   || "";
  });
}

function hideSettingsPanel() {
  settingsPanel.style.display = "none";
  mainContent.style.display = "";
}

btnSave.addEventListener("click", () => {
  const url = inputApiUrl.value.trim().replace(/\/$/, "") || DEFAULT_API_URL;
  const tok = inputToken.value.trim();
  if (!tok) {
    alert("Please enter your API token.");
    return;
  }
  chrome.storage.local.set({ garbos_api_url: url, garbos_token: tok }, () => {
    apiUrl = url;
    token  = tok;
    hideSettingsPanel();
    init();
  });
});

btnOpenSettings.addEventListener("click", showSettingsPanel);

// ── Duplicate check ───────────────────────────────────────────────────────────
async function checkDuplicate(linkedinUrl) {
  try {
    const params = new URLSearchParams({ url: linkedinUrl });
    const contact = await apiFetch(`/contacts/by-linkedin?${params}`);
    return contact; // null or contact object
  } catch (_) {
    return null; // treat errors as "no duplicate"
  }
}

// ── Scraper ───────────────────────────────────────────────────────────────────
// Injected into the LinkedIn page via chrome.scripting (world: MAIN). Serialized
// and run in the page context — must be fully self-contained, no outer refs.
function scrapeProfile() {
  const nameEl = document.querySelector('a[href*="/in/"] h2');
  if (!nameEl) return { error: 'Profile card not found' };
  const card = nameEl.closest('a').parentElement.parentElement.parentElement.parentElement;
  const children = Array.from(card.children);
  return {
    name: nameEl.innerText.trim(),
    title: children[1]?.innerText.trim() || '',
    company: children[2]?.innerText.trim().split(' · ')[0] || '',
    location: children[3]?.innerText.trim().split('\n')[0] || '',
    linkedinUrl: window.location.href.split('?')[0]
  };
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderProfile(data) {
  console.log('[GarbOS] rendering:', data);
  fName.textContent     = data.name     || "(unknown)";
  fTitle.textContent    = data.title    || "—";
  fCompany.textContent  = data.company  || "—";
  fLocation.textContent = data.location || "—";

  const url = data.linkedinUrl;
  if (url) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.textContent = url.replace("https://www.linkedin.com/in/", "linkedin.com/in/");
    fUrl.innerHTML = "";
    fUrl.appendChild(a);
  } else {
    fUrl.textContent = "—";
  }
}

// ── Main init ─────────────────────────────────────────────────────────────────
async function init() {
  showLoading();

  // 1. Load stored credentials
  const stored = await new Promise(r => chrome.storage.local.get(["garbos_api_url", "garbos_token"], r));
  apiUrl = stored.garbos_api_url || DEFAULT_API_URL;
  token  = stored.garbos_token   || "";

  if (!token) {
    showSettingsPanel();
    return;
  }

  settingsBar.style.display = "";

  // 2. Confirm the active tab is a LinkedIn profile
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes("linkedin.com/in/")) {
    showError("Open a LinkedIn profile (linkedin.com/in/…) first.");
    return;
  }

  // 3. Inject the scraper directly into the page and read the result here.
  //    No content script, no service worker, no sendMessage.
  chrome.scripting.executeScript(
    { target: { tabId: tab.id }, world: "MAIN", func: scrapeProfile },
    async (results) => {
      if (chrome.runtime.lastError) {
        console.log("[GarbOS] executeScript error:", chrome.runtime.lastError.message);
        showError(chrome.runtime.lastError.message);
        return;
      }
      const data = results && results[0] && results[0].result;
      console.log("[GarbOS] scrape result:", data);
      if (!data || data.error) {
        showError(data?.error || "Could not read profile.");
        return;
      }

      profile = data;
      renderProfile(data);
      showProfile();

      // Duplicate check + enable Add buttons
      if (data.linkedinUrl) {
        const existing = await checkDuplicate(data.linkedinUrl);
        if (existing) {
          const role = existing.lifecycle_status === "Lead" ? "Prospect" : "Contact";
          const name = [existing.first_name, existing.last_name].filter(Boolean).join(" ");
          dupTitle.textContent  = `Already in GarbOS as a ${role}`;
          dupDetail.textContent = name ? `Name on record: ${name}` : "";
          dupWarning.style.display = "";
        }
      }

      setButtons(true);
    }
  );
}

// ── Add as Prospect ───────────────────────────────────────────────────────────
btnProspect.addEventListener("click", async () => {
  if (!profile) return;
  if (!profile.company) {
    setResult("Company is required to add as Prospect. Could not extract it from this page.", true);
    return;
  }
  setButtons(false);
  resultDiv.textContent = "";
  try {
    const [firstName, ...rest] = (profile.name || "Unknown").split(" ");
    const lastName = rest.join(" ");
    await apiFetch("/leads", {
      method: "POST",
      body: JSON.stringify({
        first_name:   firstName,
        last_name:    lastName || null,
        title:        profile.title     || null,
        company_name: profile.company,
        linkedin_url: profile.linkedinUrl || null,
      }),
    });
    setResult("Added to GarbOS as Prospect ✓", false);
    dupWarning.style.display = "none";
  } catch (err) {
    setResult(`Error: ${err.message}`, true);
    setButtons(true);
  }
});

// ── Add as Contact ────────────────────────────────────────────────────────────
btnContact.addEventListener("click", async () => {
  if (!profile) return;
  setButtons(false);
  resultDiv.textContent = "";
  try {
    const [firstName, ...rest] = (profile.name || "Unknown").split(" ");
    const lastName = rest.join(" ");
    await apiFetch("/contacts", {
      method: "POST",
      body: JSON.stringify({
        first_name:   firstName,
        last_name:    lastName || null,
        title:        profile.title     || null,
        linkedin_url: profile.linkedinUrl || null,
      }),
    });
    setResult("Added to GarbOS as Contact ✓", false);
    dupWarning.style.display = "none";
  } catch (err) {
    setResult(`Error: ${err.message}`, true);
    setButtons(true);
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
