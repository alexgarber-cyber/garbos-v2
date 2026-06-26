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
          return new Promise((resolve) => {
            let attempts = 0;
            const interval = setInterval(() => {
              const nameEl = document.querySelector('a[href*="/in/"] h2');
              attempts++;
              if (nameEl || attempts >= 10) {
                clearInterval(interval);
                if (!nameEl) { resolve({ error: 'Profile card not found' }); return; }
                const card = nameEl.closest('a').parentElement.parentElement.parentElement.parentElement;
                const children = Array.from(card.children);
                const name = nameEl.innerText.trim();
                const title = children[1]?.innerText.trim() || '';
                const company = children[2]?.innerText.trim().split(' · ')[0] || '';
                const location = children[3]?.innerText.trim().split('\n')[0] || '';
                const linkedinUrl = window.location.href.split('?')[0];
                resolve({ name, title, company, location, linkedinUrl });
              }
            }, 300);
          });
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
