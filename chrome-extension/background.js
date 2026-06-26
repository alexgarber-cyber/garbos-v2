chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_PROFILE") {
    // Try active tab in current window first, fall back to any LinkedIn tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      let tab = tabs[0];
      if (!tab || !tab.url?.includes('linkedin.com/in/')) {
        // Fall back to any visible LinkedIn profile tab
        chrome.tabs.query({ url: "https://www.linkedin.com/in/*" }, (liTabs) => {
          if (!liTabs?.length) {
            sendResponse({ ok: false, error: 'No LinkedIn profile tab found' });
            return;
          }
          runScraper(liTabs[0].id, sendResponse);
        });
      } else {
        runScraper(tab.id, sendResponse);
      }
    });
    return true;
  }
});

function runScraper(tabId, sendResponse) {
  chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
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
  }, (results) => {
    if (chrome.runtime.lastError || !results?.[0]?.result) {
      sendResponse({ ok: false, error: chrome.runtime.lastError?.message || 'No result' });
    } else {
      const data = results[0].result;
      if (data.error) {
        sendResponse({ ok: false, error: data.error });
      } else {
        sendResponse({ ok: true, data });
      }
    }
  });
}
