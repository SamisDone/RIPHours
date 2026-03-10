document.getElementById("close-btn").addEventListener("click", () => {
  chrome.tabs.getCurrent((tab) => {
    if (tab) chrome.tabs.remove(tab.id);
  });
});
