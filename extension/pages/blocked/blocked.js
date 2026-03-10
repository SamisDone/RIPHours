const site = new URLSearchParams(window.location.search).get("site");
if (site) {
  document.getElementById("site-name").textContent = site + " is blocked";
  document.title = "⚰ " + site + " — Blocked";
}

chrome.storage.local.get("riphours", (data) => {
  const altsRaw = data.riphours?.settings?.alternatives;
  if (altsRaw) {
    const list = altsRaw.split(",").map(s => s.trim()).filter(Boolean);
    if (list.length > 0) {
      const chosen = list[Math.floor(Math.random() * list.length)];
      document.getElementById("touch-grass-text").innerHTML = `Stop scrolling.<br>Go do this instead: <b style="color: #F1FAEE; font-size: 14px;">${chosen}</b>`;
    }
  }
});
