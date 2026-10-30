// Plays the limit alert. Chrome closes this document on its own once audio stops.

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target !== "offscreen" || msg.type !== "play") return;
  const audio = new Audio(chrome.runtime.getURL(msg.src));
  audio.play().catch((err) => console.warn("RIPHours: playback failed", err));
});
