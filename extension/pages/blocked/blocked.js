const site = new URLSearchParams(window.location.search).get("site");
if (site) {
  document.getElementById("site-name").textContent = site;
  document.title = "Limited — " + site;
}

chrome.storage.local.get("riphours", (data) => {
  const altsRaw = data.riphours?.settings?.alternatives;
  if (altsRaw) {
    const list = altsRaw.split(",").map(s => s.trim()).filter(Boolean);
    if (list.length > 0) {
      const chosen = list[Math.floor(Math.random() * list.length)];
      document.getElementById("touch-grass-text").innerHTML = `Stop scrolling.<br>Go do this instead: <span style="color: var(--text); font-weight: 600;">${chosen}</span>`;
    }
  }
});
