// ⚰ RIPHours — Invisible Audio Player

chrome.runtime.onMessage.addListener(msg => {
  if (msg.target === 'offscreen' && msg.type === 'play-audio') {
    const audio = new Audio(chrome.runtime.getURL(msg.src));
    audio.volume = msg.volume || 1.0;
    audio.play().catch(console.error);
    
    // Close the offscreen document once the sound finishes
    audio.addEventListener('ended', () => {
      window.close();
    });
  }
});
