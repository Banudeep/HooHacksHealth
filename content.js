async function simplifyText() {
  // get the selected text
  const selectedText = window.getSelection().toString().trim();

  if (selectedText) {
    // get all of the selected HTML
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);

      // clone the selected HTML
      const selectedContents = range.cloneContents();

      // get all text nodes within the selected HTML
      const textNodes = getTextNodesInRange(selectedContents);

      // simplify each text node individually
      textNodes.forEach((textNode) => {
        const originalText = textNode.textContent.trim();

        // if (originalText) {
        //     fetch("http://localhost:8000/simplify", {
        //         method: "POST",
        //         headers: {
        //             "Content-Type": "application/json"
        //         },
        //         body: JSON.stringify({ text: originalText })
        //     })
        //         .then(response => response.json())
        //         .then(data => {
        //             // Replace the text node with the simplified text
        //             textNode.textContent = data.summary;
        //         })
        //         .catch(error => {
        //             console.error("Error simplifying text:", error);
        //         });
        //
        //     fetch("http://localhost:8000/", {
        //         method: "POST",
        //         headers: {
        //             "Content-Type": "application/json"
        //         },
        //         body: JSON.stringify({ text: originalText })
        //     })
        //         .then(response => response.json())
        //         .then(data => {
        //             // Replace the text node with the simplified text
        //             textNode.textContent = data.vedrict_text;
        //         })
        //         .catch(error => {
        //             console.error("Error simplifying text:", error);
        //         });
        //
        // fetch("http://localhost:8000/truth_source", {
        //         method: "POST",
        //         headers: {
        //             "Content-Type": "application/json"
        //         },
        //         body: JSON.stringify({ text: originalText })
        //     })
        //         .then(response => response.json())
        //         .then(data => {
        //             // Replace the text node with the simplified text
        //             textNode.textContent = data.vedrict_text;
        //         })
        //         .catch(error => {
        //             console.error("Error simplifying text:", error);
        //         });
        // }
        if (originalText) {
          const requestBody = { text: originalText };

          console.log("Sending request body:", requestBody);
          fetch("https://fastapi-eo9y.onrender.com/summarize", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          })
            .then((response) => response.json())
            .then((data) => {
              // Replace the text node with the simplified text
              console.log(
                "Simplified text executed in originalText: ",
                data.summary
              );
              if (data.summary.length > 0) {
                textNode.textContent = data.summary;
              }
              //   textNode.textContent = data.summary;
            })
            .catch((error) => {
              console.error("Error simplifying text:", error);
            });
          //   textNode.textContent = "This is a simplified text: " + originalText;

          console.log("Simplified text executed in originalText: ");
          //     APi call for fake or real
          fetch("https://fastapi-eo9y.onrender.com/fact-check", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: originalText }),
          })
            .then((response) => response.json())
            .then((data) => {
              // Replace the text node with the simplified text

              let fakeOrReal = data.verdict_text;
              if (fakeOrReal === "Mostly accurate" || fakeOrReal === "True") {
                fakeOrReal = "Real";
              } else if (fakeOrReal === "False") {
                fakeOrReal = "Fake";
              }
              console.log("Fake or Real: ", data, fakeOrReal);
              chrome.runtime.sendMessage({
                type: "fakeOrReal",
                text: fakeOrReal,
              });
            })
            .catch((error) => {
              console.error("Error detecting Fake news:", error);
            });
          //   const fakeOrReal = "Fake";
          //   chrome.runtime.sendMessage({
          //     type: "fakeOrReal",
          //     text: fakeOrReal,
          //   });
          //   Api call for suggested sources
          chrome.storage.local.get("fakeOrReal", (result) => {
            const latestfakeOrReal = result.fakeOrReal || "";
            if (latestfakeOrReal === "Real") {
              return;
            }
          });

          fetch("https://fastapi-eo9y.onrender.com/truth_sources", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: originalText }),
          })
            .then((response) => response.json())
            .then((data) => {
              //   const sourcesArray = data.verified_sources.url || [];
              console.log(
                "data.verified_sources[0].url:",
                data.verified_sources[0].url
              );
              const sources = data.verified_sources || [];

              // Extract title and url
              const titleUrlPairs = sources.map((source) => ({
                title: source.title,
                url: source.url,
              }));

              console.log("Extracted title & URL array:", titleUrlPairs);

              chrome.runtime.sendMessage({
                type: "suggestion",
                text: titleUrlPairs,
              });
            })
            .catch((error) => {
              console.error("Error suggesting sources:", error);
            });
        }
        // const Sources = "Suggested sources Links chnaged";
        // chrome.runtime.sendMessage({
        //   type: "suggestion",
        //   text: Sources,
        // });
      });

      // replace the original selected HTML with the simplified HTML
      setTimeout(() => {
        range.deleteContents();
        range.insertNode(selectedContents);
      }, 1000); // Delay to for all API calls to complete
    }
  } else {
    console.log("No text selected.");
  }
}

// Helper function to find all text nodes within a given node
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

// content.js
// (function () {
//   if (!window.__storageClearedOnce__) {
//     chrome.storage.local.remove("latestSuggestion", "fakeOrReal", () => {
//       console.log("latestSuggestion cleared once on page load");
//     });
//     // chrome.storage.local.remove("fakeOrReal", () => {
//     //   console.log("fakeOrReal cleared once on page load");
//     // });

//     // Set a flag on window to prevent running again
//     window.__storageClearedOnce__ = true;
//   }
// })();

// content.js
// (function () {
//   // Check if the flag is set in session storage
//   chrome.storage.session.get("__storageClearedOnce__", (data) => {
//     if (!data.__storageClearedOnce__) {
//       // Clear specific items from local storage
//       chrome.storage.local.remove(["latestSuggestion", "fakeOrReal"], () => {
//         console.log(
//           "latestSuggestion and fakeOrReal cleared once on page load"
//         );
//       });

//       // Set the flag in session storage
//       chrome.storage.session.set({ __storageClearedOnce__: true });
//     }
//   });
// })();

simplifyText();
