chrome.runtime.onInstalled.addListener(() => {
  console.log("Text Simplifier Extension Installed");
});

// Listen for command (keyboard shortcut) to trigger simplify action
chrome.commands.onCommand.addListener((command) => {
  console.log("Command received:", command); // Log the command received
  if (command === "simplify-action") {
    executeSimplifyScript();
  }
});

// Function to execute the simplification script in the active tab
function executeSimplifyScript() {
  // Query the active tab in the current window
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      console.error("No active tab found.");
      return;
    }

    // Run the content script in the active tab
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files: ["content.js"],
    });
  });
}

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received in background:", message);
  if (message.type === "suggestion") {
    chrome.storage.local.set({ latestSuggestion: message.text }, () => {
      console.log("Suggestion saved:", message.text);
    });
  }
  if (message.type === "fakeOrReal") {
    chrome.storage.local.set({ fakeOrReal: message.text }, () => {
      console.log("fakeOrReal saved:", message.text);
    });
  }
  if (message.type === "getLatestSuggestion") {
    chrome.storage.local.get("latestSuggestion", (result) => {
      sendResponse({ text: result.latestSuggestion || "" });
    });

    // Return true to indicate sendResponse will be called asynchronously
    return true;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    chrome.storage.local.remove(["latestSuggestion", "fakeOrReal"], () => {
      console.log("Cleared suggestion and fakeOrReal on page load");
    });
  }
});
