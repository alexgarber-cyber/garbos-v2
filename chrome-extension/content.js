chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_PROFILE") {
    try {
      const nameEl = document.querySelector('a[href*="/in/"] h2');
      if (!nameEl) { sendResponse({ ok: false, error: 'Profile card not found' }); return; }
      const card = nameEl.closest('a').parentElement.parentElement.parentElement.parentElement;
      const children = Array.from(card.children);
      sendResponse({
        ok: true,
        data: {
          name: nameEl.innerText.trim(),
          title: children[1]?.innerText.trim() || '',
          company: children[2]?.innerText.trim().split(' · ')[0] || '',
          location: children[3]?.innerText.trim().split('\n')[0] || '',
          linkedinUrl: window.location.href.split('?')[0]
        }
      });
    } catch(err) {
      sendResponse({ ok: false, error: err.message });
    }
  }
});
