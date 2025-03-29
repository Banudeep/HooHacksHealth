document.addEventListener("DOMContentLoaded", () => {
  const resultEl = document.getElementById("resultText");
  const fakeOrRealEl = document.getElementById("fakeOrReal");
  const simplifyBtn = document.getElementById("simplifyBtn");
  const statusEl = document.getElementById("status");

  // Initial state
  chrome.storage.local.get("latestSuggestion", (result) => {
    const newVal = result.latestSuggestion || [];
    if (newVal.length > 0) {
      updateSuggestions(newVal);
    }
  });

  chrome.storage.local.get("fakeOrReal", (result) => {
    const latestfakeOrReal = result.fakeOrReal || "";
    if (latestfakeOrReal) {
      updateFakeOrReal(latestfakeOrReal);
    }
  });

  // Button click handler
  simplifyBtn.addEventListener("click", () => {
    simplifyBtn.disabled = true;
    statusEl.style.display = "block";
    statusEl.textContent = "Checking...";

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        showError("No active tab found.");
        return;
      }
      chrome.scripting
        .executeScript({
          target: { tabId: tabs[0].id },
          files: ["content.js"],
        })
        .catch((err) => showError("Error executing script."));
    });
  });

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") {
      if (changes.latestSuggestion) {
        updateSuggestions(changes.latestSuggestion.newValue);
      }
      if (changes.fakeOrReal) {
        updateFakeOrReal(changes.fakeOrReal.newValue);
      }
    }
  });

  // Helper functions
  function updateSuggestions(suggestions) {
    if (suggestions.length > 0) {
      const formattedHTML = suggestions
        .map(
          (item) => `
          <a href="${item.url}" target="_blank">${item.title}</a>`
        )
        .join("");
      resultEl.innerHTML =
        "<strong>Trusted Sources:</strong><br>" + formattedHTML;
    } else {
      resultEl.textContent = "No suggestions available.";
    }
    resetButton();
  }

  function updateFakeOrReal(verdict) {
    fakeOrRealEl.textContent = verdict;
    fakeOrRealEl.className = verdict === "Real" ? "real" : "fake";
    resetButton();
  }

  function showError(message) {
    statusEl.textContent = message;
    statusEl.style.color = "#e74c3c";
    simplifyBtn.disabled = false;
  }

  function resetButton() {
    simplifyBtn.disabled = false;
    statusEl.style.display = "none";
  }
});
