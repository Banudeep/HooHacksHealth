async function simplifyText() {
  const selectedText = window.getSelection().toString().trim();
  console.log("SELECTED TEXT: ", selectedText);
  if (selectedText) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const selectedContents = range.cloneContents();
      const textNodes = getTextNodesInRange(selectedContents);

      console.log("TEXTNODES: ", textNodes);

      textNodes.forEach((textNode) => {
        const originalText = textNode.textContent.trim();
        if (originalText) {
          const requestBody = { text: originalText };
          console.log("Sending request body:", requestBody);
          fetch("https://fastapi-eo9y.onrender.com/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          })
            .then((response) => response.json())
            .then((data) => {
              if (data.summary && data.summary.length > 0) {
                const span = document.createElement("span");
                span.textContent = data.summary;
                span.style.backgroundColor = "#ffff99";
                span.style.borderRadius = "3px";
                span.style.padding = "2px 4px";
                span.style.fontWeight = "bold";
                span.title = "Summarized using AI";
                range.deleteContents();
                range.insertNode(span);
                console.log(
                  "✅ Replaced selected text with summarized version."
                );
              }
            })
            .catch((error) => console.error("Error simplifying text:", error));
        }
      });
    }
  } else {
    console.log("No text selected.");
  }
}

async function factCheck() {
  const selectedText = window.getSelection().toString().trim();
  if (selectedText) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const selectedContents = range.cloneContents();
      const textNodes = getTextNodesInRange(selectedContents);

      textNodes.forEach((textNode) => {
        const originalText = textNode.textContent.trim();
        if (originalText) {
          fetch("https://fastapi-eo9y.onrender.com/fact-check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: originalText }),
          })
            .then((response) => response.json())
            .then((data) => {
              let fakeOrReal = data.verdict;
              // if (fakeOrReal === "Mostly accurate" || fakeOrReal === "True") {
              //   fakeOrReal = "Real";
              // } else if (fakeOrReal === "False") {
              //   fakeOrReal = "Fake";
              // }
              console.log("Fake or Real: ", data, fakeOrReal);
              chrome.runtime.sendMessage({
                type: "fakeOrReal",
                text: fakeOrReal,
              });
              if (fakeOrReal === "False") {
                const sources = data.source || [];
                console.log("Sources: ", sources);
                const titleUrlPairs = sources.map((source) => ({
                  title: source.title,
                  url: source.url,
                }));
                console.log("Extracted title & URL array:", titleUrlPairs);
                chrome.runtime.sendMessage({
                  type: "suggestion",
                  text: titleUrlPairs,
                });
              }
            })
            .catch((error) =>
              console.error("Error detecting Fake news:", error)
            );
        }
      });

      setTimeout(() => {
        range.deleteContents();
        range.insertNode(selectedContents);
      }, 1000);
    }
  } else {
    console.log("No text selected.");
  }
}

async function searchGlossary(query) {
  console.log("Searching glossary for:", query);
  fetch("https://fastapi-eo9y.onrender.com/glossary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: query }),
  })
    .then((response) => response.json())
    .then((data) => {
      const definition = data.definition || "No definition found.";
      chrome.runtime.sendMessage({ type: "glossary", text: definition });
    })
    .catch((error) => {
      console.error("Error fetching glossary:", error);
      chrome.runtime.sendMessage({
        type: "glossary",
        text: "Error fetching definition.",
      });
    });
}

function getTextNodesInRange(node) {
  const textNodes = [];
  const walk = document.createTreeWalker(
    node,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  let currentNode;
  while ((currentNode = walk.nextNode())) {
    textNodes.push(currentNode);
  }
  return textNodes;
}

if (typeof runMode !== "undefined") {
  if (runMode === "summarize") simplifyText();
  else if (runMode === "factcheck") factCheck();
}
