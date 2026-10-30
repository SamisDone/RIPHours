// Runs before first paint so pages open in the right theme instead of flashing.
// The worker's settings are the source of truth; pages refresh this cache.
(() => {
  const modes = ["dark", "light", "system"];
  const accents = ["red", "green", "purple", "blue", "orange", "pink"];
  let cached = {};
  try {
    cached = JSON.parse(localStorage.getItem("riphours-theme")) || {};
  } catch {}
  const root = document.documentElement;
  root.classList.add(
    "mode-" + (modes.includes(cached.mode) ? cached.mode : "dark"),
    "accent-" + (accents.includes(cached.accent) ? cached.accent : "red"),
  );
})();
