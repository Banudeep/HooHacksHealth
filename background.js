chrome.runtime.onInstalled.addListener(() => {
  console.log("Text Simplifier Extension Installed");
});

chrome.commands.onCommand.addListener((command) => {
  console.log("Command received:", command);
  if (command === "simplify-action") {
    executeSimplifyScript();
  }
});

function executeSimplifyScript() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs.length) {
      console.error("No active tab found.");
      return;
    }
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files: ["content.js"],
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received in background:", message);
  if (message.type === "suggestion") {
    chrome.storage.local.set({ latestSuggestion: message.text });
  }
  if (message.type === "fakeOrReal") {
    chrome.storage.local.set({ fakeOrReal: message.text });
  }
  if (message.type === "glossary") {
    chrome.storage.local.set({ glossary: message.text });
  }
  if (message.type === "error") {
    chrome.storage.local.set({ error: message.text });
  }
  if (message.type === "getLatestSuggestion") {
    chrome.storage.local.get("latestSuggestion", (result) => {
      sendResponse({ text: result.latestSuggestion || "" });
    });
    return true;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    chrome.storage.local.remove(
      ["latestSuggestion", "fakeOrReal", "glossary", "error"],
      () => {
        console.log("Cleared storage on page load");
      }
    );
  }
});
