// background.js
// This is the service worker. It runs in the background (not in any tab).
// Its job: store volume/mute state per tab, and relay messages between popup and content scripts.

// When a tab is closed, clean up its stored volume so we don't leak memory
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(`tab_${tabId}`);
});

// When a tab navigates to a new URL, the content script re-injects itself
// and will ask for the current volume. We reset state for that tab.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    // Clear old gain state when tab navigates — fresh page, fresh start
    chrome.storage.local.remove(`tab_${tabId}`);
  }
});

// Listen for messages from the popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  // MESSAGE: popup wants to get the current volume for a tab
  if (message.type === "GET_VOLUME") {
    const tabId = message.tabId;
    chrome.storage.local.get(`tab_${tabId}`, (result) => {
      const data = result[`tab_${tabId}`];
      if (data) {
        sendResponse({ volume: data.volume, muted: data.muted });
      } else {
        // Default: 100% volume, not muted
        sendResponse({ volume: 100, muted: false });
      }
    });
    return true; // Required for async sendResponse in Chrome
  }

  // MESSAGE: popup changed the volume slider or mute toggle
  if (message.type === "SET_VOLUME") {
    const { tabId, volume, muted } = message;

    // 1. Save the new state to storage
    chrome.storage.local.set({
      [`tab_${tabId}`]: { volume, muted }
    });

    // 2. Forward the new volume to the content script running in that tab
    chrome.tabs.sendMessage(tabId, {
      type: "APPLY_VOLUME",
      volume: muted ? 0 : volume,
      muted
    }).catch(() => {
      // Content script might not be ready yet on some pages (e.g. chrome:// pages)
      // Silently ignore — those pages can't run content scripts anyway
    });

    sendResponse({ ok: true });
    return true;
  }
});
