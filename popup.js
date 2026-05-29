// popup.js

const volumeSlider  = document.getElementById("volumeSlider");
const volumeNumber  = document.getElementById("volumeNumber");
const trackFill     = document.getElementById("trackFill");
const statusLine    = document.getElementById("statusLine");
const muteBtn       = document.getElementById("muteBtn");
const muteLabel     = document.getElementById("muteLabel");
const speakerIcon   = document.getElementById("speakerIcon");
const resetBtn      = document.getElementById("resetBtn");
const tabBadge      = document.getElementById("tabBadge");

let currentTabId = null;
let isMuted = false;
let volumeBeforeMute = 100;

function updateUI(volume, muted) {
  isMuted = muted;

  // Hero number
  volumeNumber.textContent = volume;

  // Track fill — map 0–600 to 0–100% width
  const fillPct = Math.min((volume / 600) * 100, 100);
  trackFill.style.width = muted ? "0%" : fillPct + "%";
  trackFill.classList.toggle("boosted", volume > 100 && !muted);
  trackFill.classList.toggle("muted", muted);

  // Status line
  statusLine.classList.remove("boosted", "muted");
  if (muted) {
    statusLine.textContent = "Muted";
    statusLine.classList.add("muted");
  } else if (volume === 0) {
    statusLine.textContent = "Silent";
  } else if (volume > 100) {
    statusLine.textContent = "Boost \u00d7" + (volume / 100).toFixed(1);
    statusLine.classList.add("boosted");
  } else {
    statusLine.textContent = "Active";
  }

  // Mute button state
  muteBtn.classList.toggle("mute-active", muted);
  muteLabel.textContent = muted ? "Unmute" : "Mute";

  // Speaker icon
  if (muted) {
    speakerIcon.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <line x1="23" y1="9" x2="17" y2="15"></line>
      <line x1="17" y1="9" x2="23" y2="15"></line>
    `;
  } else {
    speakerIcon.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    `;
  }
}

function sendVolume(volume, muted) {
  chrome.runtime.sendMessage({
    type: "SET_VOLUME",
    tabId: currentTabId,
    volume,
    muted
  });
}

// Init: get active tab and load saved volume
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs || tabs.length === 0) return;
  const tab = tabs[0];
  currentTabId = tab.id;
  tabBadge.textContent = "Tab " + tab.id;

  chrome.runtime.sendMessage({ type: "GET_VOLUME", tabId: currentTabId }, (response) => {
    if (chrome.runtime.lastError) {
      updateUI(100, false);
      volumeSlider.value = 100;
      return;
    }
    const { volume, muted } = response;
    volumeBeforeMute = volume;
    volumeSlider.value = volume;
    updateUI(volume, muted);
  });
});

// Slider
volumeSlider.addEventListener("input", () => {
  const v = parseInt(volumeSlider.value, 10);
  if (isMuted) isMuted = false;
  volumeBeforeMute = v;
  updateUI(v, false);
  sendVolume(v, false);
});

// Mute toggle
muteBtn.addEventListener("click", () => {
  if (isMuted) {
    isMuted = false;
    const restore = volumeBeforeMute || 100;
    volumeSlider.value = restore;
    updateUI(restore, false);
    sendVolume(restore, false);
  } else {
    volumeBeforeMute = parseInt(volumeSlider.value, 10);
    isMuted = true;
    updateUI(volumeBeforeMute, true);
    sendVolume(volumeBeforeMute, true);
  }
});

// Reset
resetBtn.addEventListener("click", () => {
  isMuted = false;
  volumeBeforeMute = 100;
  volumeSlider.value = 100;
  updateUI(100, false);
  sendVolume(100, false);
});
