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
let profile = null; // scraped profile data

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

  // 2. Check active tab is a LinkedIn profile
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.match(/^https:\/\/www\.linkedin\.com\/in\//)) {
    showNotice("Navigate to a LinkedIn profile (linkedin.com/in/…) and try again.");
    return;
  }

  // 3. Ask content script for profile data
  let response;
  try {
    response = await chrome.tabs.sendMessage(tab.id, { type: "GET_PROFILE" });
  } catch (err) {
    showNotice("Could not read page. Try reloading the LinkedIn profile.");
    return;
  }

  if (!response || !response.ok) {
    showNotice("Profile data unavailable. Try reloading the LinkedIn profile.");
    return;
  }

  profile = response.data;

  // 4. Render profile fields
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  fName.textContent     = fullName     || "(unknown)";
  fTitle.textContent    = profile.title    || "—";
  fCompany.textContent  = profile.company  || "—";
  fLocation.textContent = profile.location || "—";

  const url = profile.linkedinUrl;
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

  showProfile();

  // 5. Duplicate check
  if (url) {
    const existing = await checkDuplicate(url);
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
    await apiFetch("/leads", {
      method: "POST",
      body: JSON.stringify({
        first_name:   profile.firstName || profile.fullName || "Unknown",
        last_name:    profile.lastName  || null,
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
    await apiFetch("/contacts", {
      method: "POST",
      body: JSON.stringify({
        first_name:   profile.firstName || profile.fullName || "Unknown",
        last_name:    profile.lastName  || null,
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
