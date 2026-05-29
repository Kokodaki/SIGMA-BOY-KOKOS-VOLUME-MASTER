// content.js
// This script runs INSIDE every webpage you visit.
// It intercepts the page's audio and routes it through a GainNode so we can boost/cut volume.
//
// How Web Audio API works (quick explanation):
// Every sound on a webpage goes through an AudioContext.
// An AudioContext is like a mixing board. Audio flows through "nodes" (like effects pedals).
// We insert a GainNode between the audio source and the speakers.
// GainNode.gain.value = 1.0 → 100% volume (normal)
// GainNode.gain.value = 3.0 → 300% volume (boosted)
// GainNode.gain.value = 0.0 → muted

(function () {
  // Prevent double-injection if content script somehow runs twice
  if (window.__sigmaBOIKOKO_injected) return;
  window.__sigmaBOIKOKO_injected = true;

  // We keep a reference to the GainNode so we can update it later
  let gainNode = null;
  let audioCtx = null;

  // This is the current gain multiplier (1.0 = 100%)
  // We store it so if audio starts after the popup sets volume, it still applies
  let currentGain = 1.0;

  // ----- HOOK THE WEB AUDIO API -----
  // Pages create audio using `new AudioContext()`.
  // We override AudioContext so we can intercept when it's created.
  const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;

  if (!OriginalAudioContext) return; // Very old browser, bail out

  // We create a Proxy around AudioContext.
  // A Proxy lets us intercept calls — in this case, `new AudioContext()`.
  window.AudioContext = window.webkitAudioContext = new Proxy(OriginalAudioContext, {
    construct(Target, args) {
      // Create the real AudioContext
      const ctx = new Target(...args);
      audioCtx = ctx;

      // Create a GainNode on this context
      gainNode = ctx.createGain();
      gainNode.gain.value = currentGain;

      // Now we hook ctx.createMediaElementSource and ctx.createMediaStreamSource
      // These are the two most common ways pages connect audio sources to the context.

      // Hook createMediaElementSource (used by <video>, <audio> elements)
      const origCreateMediaElementSource = ctx.createMediaElementSource.bind(ctx);
      ctx.createMediaElementSource = function (mediaElement) {
        const source = origCreateMediaElementSource(mediaElement);
        // Connect: source → gainNode → speakers
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        return source;
      };

      // Hook createMediaStreamSource (used by WebRTC, mic input, etc.)
      const origCreateMediaStreamSource = ctx.createMediaStreamSource.bind(ctx);
      ctx.createMediaStreamSource = function (stream) {
        const source = origCreateMediaStreamSource(stream);
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        return source;
      };

      return ctx;
    }
  });

  // ----- ALSO HANDLE <video> and <audio> TAGS DIRECTLY -----
  // Some pages (like YouTube) manage their own AudioContext internally.
  // For those, we need to hook into the media elements directly when they appear in the DOM.
  function hookMediaElement(el) {
    if (el.__sbk_hooked) return; // Don't hook the same element twice
    el.__sbk_hooked = true;

    // If there's no AudioContext yet, create one now to use for this element
    if (!audioCtx) {
      try {
        audioCtx = new OriginalAudioContext();
        gainNode = audioCtx.createGain();
        gainNode.gain.value = currentGain;
        gainNode.connect(audioCtx.destination);
      } catch (e) {
        return; // Can't create AudioContext, bail
      }
    }

    try {
      const source = audioCtx.createMediaElementSource(el);
      source.connect(gainNode);
      gainNode.connect(audioCtx.destination);
    } catch (e) {
      // Some elements can't be hooked (e.g. cross-origin media)
      // Silently ignore
    }
  }

  // Hook any <video> or <audio> tags already in the DOM
  document.querySelectorAll("video, audio").forEach(hookMediaElement);

  // Watch for new <video> or <audio> tags added later (e.g. YouTube loads player dynamically)
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue; // Only element nodes
        if (node.matches("video, audio")) {
          hookMediaElement(node);
        }
        // Also check children of added nodes
        node.querySelectorAll?.("video, audio").forEach(hookMediaElement);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // ----- LISTEN FOR VOLUME CHANGES FROM BACKGROUND SCRIPT -----
  // When the user moves the slider in the popup, background.js sends us this message.
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "APPLY_VOLUME") {
      // message.volume is 0–600 (percentage)
      // We convert it: 100% → gain of 1.0, 300% → gain of 3.0, etc.
      const gainValue = message.volume / 100;
      currentGain = gainValue;

      if (gainNode) {
        // Use setTargetAtTime for smooth transition (no audio clicks/pops)
        // args: target value, start time, time constant (how fast to ramp)
        gainNode.gain.setTargetAtTime(gainValue, audioCtx.currentTime, 0.01);
      }

      // Resume audio context if it was suspended (browsers auto-suspend idle contexts)
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume();
      }
    }
  });

})();
