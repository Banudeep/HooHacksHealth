document.addEventListener("DOMContentLoaded", () => {
  const resultEl = document.getElementById("resultText");
  const fakeOrRealEl = document.getElementById("fakeOrReal");
  const simplifyBtn = document.getElementById("simplifyBtn");
  const statusEl = document.getElementById("status");
  const factCheckBtn = document.getElementById("factCheckBtn");
  const glossaryPara = document.getElementById("glossary");
  const searchInput = document.getElementById("searchInput");
  const searchButton = document.getElementById("searchBtn");

  // Initial state
  chrome.storage.local.get(
    ["latestSuggestion", "fakeOrReal", "glossary"],
    (result) => {
      if (result.latestSuggestion?.length > 0)
        updateSuggestions(result.latestSuggestion);
      if (result.fakeOrReal) updateFakeOrReal(result.fakeOrReal);
      if (result.glossary) glossaryPara.textContent = result.glossary;
    }
  );

  simplifyBtn.addEventListener("click", () => {
    simplifyBtn.disabled = true;
    statusEl.style.display = "block";
    statusEl.textContent = "Summarizing...";
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) {
        showError("No active tab found.");
        return;
      }
      chrome.scripting
        .executeScript({
          target: { tabId: tabs[0].id },
          func: () => {
            window.runMode = "summarize";
          },
        })
        .then(() => {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: ["content.js"],
          });
        });
    });
  });

  factCheckBtn.addEventListener("click", () => {
    factCheckBtn.disabled = true;
    statusEl.style.display = "block";
    statusEl.textContent = "Checking...";
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) {
        showError("No active tab found.");
        return;
      }
      chrome.scripting
        .executeScript({
          target: { tabId: tabs[0].id },
          func: () => {
            window.runMode = "factcheck";
          },
        })
        .then(() => {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: ["content.js"],
          });
        });
    });
  });

  searchButton.addEventListener("click", () => {
    const query = searchInput.value.trim();
    console.log("INSIDE SEARCH BUTTON");
    if (!query) {
      glossaryPara.textContent = "Please enter a word.";
      return;
    }
    searchButton.disabled = true;
    statusEl.style.display = "block";
    statusEl.textContent = "Searching...";
    handleSearch(query);
  });

  searchInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      const query = searchInput.value.trim();
      if (query) {
        searchButton.disabled = true;
        statusEl.style.display = "block";
        statusEl.textContent = "Searching...";
        handleSearch(query);
      }
    }
  });

  function handleSearch(query) {
    console.log("Search term:", query);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) {
        showError("No active tab found.");
        return;
      }
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: (q) => {
          if (typeof searchGlossary === "function") searchGlossary(q);
          else console.warn("searchGlossary function not found in content.js");
        },
        args: [query],
      });
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") {
      if (changes.latestSuggestion)
        updateSuggestions(changes.latestSuggestion.newValue);
      if (changes.fakeOrReal) updateFakeOrReal(changes.fakeOrReal.newValue);
      if (changes.glossary) {
        glossaryPara.textContent = changes.glossary.newValue;
        resetButton();
      }
    }
  });

  async function updateSuggestions(suggestions) {
    if (!suggestions.length) {
      resultEl.textContent = "No suggestions available.";
      resetButton();
      return;
    }
    let formattedHTML = "<strong>Trusted Sources:</strong><br>";
    for (const item of suggestions) {
      try {
        const res = await fetch(
          `https://api.microlink.io/?url=${encodeURIComponent(item.url)}`
        );
        const data = await res.json();
        const thumbUrl = data?.data?.image?.url || "";
        formattedHTML += `
          <div style="margin-bottom: 10px; display: flex; align-items: center; gap: 10px;">
            ${
              thumbUrl
                ? `<img src="${thumbUrl}" style="width: 50px; height: 50px; object-fit: cover;" />`
                : ""
            }
            <a href="${
              item.url
            }" target="_blank" style="flex: 1; text-decoration: none; color: #007bff;">${
          item.title
        }</a>
          </div>
        `;
      } catch (error) {
        console.error("Failed to fetch thumbnail:", error);
        formattedHTML += `
          <div style="margin-bottom: 10px;">
            <a href="${item.url}" target="_blank">${item.title}</a>
          </div>
        `;
      }
    }
    resultEl.innerHTML = formattedHTML;
    resetButton();
  }

  function updateFakeOrReal(verdict) {
    fakeOrRealEl.textContent = verdict;
    fakeOrRealEl.style.backgroundColor = "";
    fakeOrRealEl.style.color = "";
    fakeOrRealEl.style.padding = "5px 10px";
    fakeOrRealEl.style.borderRadius = "3px";
    fakeOrRealEl.style.textAlign = "center";
    fakeOrRealEl.style.fontWeight = "600";
    if (verdict === "Real") {
      fakeOrRealEl.style.backgroundColor = "#27ae60"; // Green
      fakeOrRealEl.style.color = "white";
    } else if (verdict === "Fake") {
      fakeOrRealEl.style.backgroundColor = "#e74c3c"; // Red
      fakeOrRealEl.style.color = "white";
    }
    resetButton();
  }

  function showError(message) {
    statusEl.textContent = message;
    statusEl.style.color = "#e74c3c";
    simplifyBtn.disabled = false;
    factCheckBtn.disabled = false;
    searchButton.disabled = false;
  }

  function resetButton() {
    simplifyBtn.disabled = false;
    factCheckBtn.disabled = false;
    searchButton.disabled = false;
    statusEl.style.display = "none";
  }
});
