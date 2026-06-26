chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "GET_PROFILE") return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) {
      sendResponse({ ok: false, error: "No active tab" });
      return;
    }

    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        world: "MAIN",
        func: () => {
          const nameEl = document.querySelector('a[href*="/in/"] h2');
          if (!nameEl) return { error: 'Profile card not found' };
          const card = nameEl.closest('a').parentElement.parentElement.parentElement.parentElement;
          const children = Array.from(card.children);

          const name = nameEl.innerText.trim();
          const title = children[1]?.innerText.trim() || '';
          const company = children[2]?.innerText.trim().split(' · ')[0] || '';
          const location = children[3]?.innerText.trim().split('\n')[0] || '';
          const linkedinUrl = window.location.href.split('?')[0];

          return { name, title, company, location, linkedinUrl };
        },
      },
      (results) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        if (!results || !results[0] || !results[0].result) {
          sendResponse({ ok: false, error: "No result from page" });
          return;
        }
        sendResponse({ ok: true, data: results[0].result });
      }
    );
  });

  return true; // keep channel open for async sendResponse
});
