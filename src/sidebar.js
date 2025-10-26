// sidebar.js
const container = document.getElementById("summaries");
const statusDiv = document.getElementById("status");
const summaryTypeSelect = document.getElementById("summary-type");
const clearBtn = document.getElementById("clear-btn");
const toggleGenerationBtn = document.getElementById("toggle-generation-btn");
const stopAllBtn = document.getElementById("stop-all-btn");

let summaries = [];
let processedContentHashes = new Set(); // Store processed content hashes persistently
let activeSummarizations = 0; // Track number of active summarizations
let isGenerationActive = false; // Track if generation is currently active
let siteGroups = {}; // Group summaries by hostname

// Helper function to update toggle button with icon and text
function updateToggleButton(isActive) {
	const iconSpan = toggleGenerationBtn.querySelector(".material-icons");
	const textSpan = document.createElement("span");

	if (isActive) {
		iconSpan.textContent = "stop";
		textSpan.textContent = "Stop";
		toggleGenerationBtn.className = "stop-mode";
	} else {
		iconSpan.textContent = "play_arrow";
		textSpan.textContent = "Start";
		toggleGenerationBtn.className = "start-mode";
	}

	// Replace text content while keeping the icon
	const existingText = toggleGenerationBtn.querySelector(
		"span:not(.material-icons)"
	);
	if (existingText) {
		existingText.textContent = textSpan.textContent;
	} else {
		toggleGenerationBtn.appendChild(textSpan);
	}
}

// Get website colors and apply to sidebar
async function applyWebsiteColors() {
	try {
		const [tab] = await chrome.tabs.query({
			active: true,
			currentWindow: true,
		});
		if (!tab) return;

		const result = await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			function: () => {
				const body = document.body;
				const computedStyle = window.getComputedStyle(body);
				const bgColor = computedStyle.backgroundColor;
				const textColor = computedStyle.color;

				// Simple brightness calculation to determine if it's a dark or light theme
				const rgb = bgColor.match(/\d+/g);
				if (rgb) {
					const brightness =
						(parseInt(rgb[0]) * 299 +
							parseInt(rgb[1]) * 587 +
							parseInt(rgb[2]) * 114) /
						1000;
					return brightness < 128 ? "dark" : "light";
				}
				return "light"; // fallback
			},
		});

		if (result && result[0]) {
			const theme = result[0].result;
			applyThemeToSidebar(theme);
		}
	} catch (e) {
		console.log("Could not get website theme:", e);
		applyThemeToSidebar("light"); // fallback
	}
}

function applyThemeToSidebar(theme) {
	// Remove existing theme styles
	const existingStyle = document.getElementById("dynamic-theme");
	if (existingStyle) {
		existingStyle.remove();
	}

	// Create theme styles
	const style = document.createElement("style");
	style.id = "dynamic-theme";

	if (theme === "dark") {
		style.textContent = `
      body {
        background: #1a1a1a !important;
        color: #ffffff !important;
      }

      #sidebar {
        background: #1a1a1a !important;
        color: #ffffff !important;
      }

      .summary-card {
        background: rgba(255, 255, 255, 0.05) !important;
        border-color: rgba(255, 255, 255, 0.1) !important;
        color: #ffffff !important;
      }

      .summary-card .title {
        color: #ffffff !important;
      }

      .summary-card p {
        color: #ffffff !important;
      }

      .summary-card small {
        color: rgba(255, 255, 255, 0.6) !important;
      }

      .site-header {
        color: rgba(255, 255, 255, 0.8) !important;
        border-bottom-color: rgba(255, 255, 255, 0.2) !important;
      }

      .site-group .summary-card {
        border-left-color: rgba(255, 255, 255, 0.2) !important;
      }

      .loading-dots span {
        background: #ffffff !important;
      }

      #summary-type {
        background: rgba(255, 255, 255, 0.08) !important;
        color: #ffffff !important;
        border-color: rgba(255, 255, 255, 0.2) !important;
      }

      #summary-type option {
        background: #000000 !important;
        color: #f9fafb !important;
      }

      #clear-btn {
        background: rgba(239, 68, 68, 0.2) !important;
        color: #fca5a5 !important;
        border-color: rgba(239, 68, 68, 0.4) !important;
      }

      #stop-all-btn {
        background: rgba(239, 68, 68, 0.2) !important;
        color: #fca5a5 !important;
        border-color: rgba(239, 68, 68, 0.4) !important;
      }

      #generation-controls button {
        background: rgba(34, 197, 94, 0.15) !important;
        color: #22c55e !important;
        border-color: rgba(34, 197, 94, 0.4) !important;
      }

      #generation-controls button:hover:not(:disabled) {
        background: rgba(34, 197, 94, 0.25) !important;
        box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3) !important;
      }

      #generation-controls button:disabled {
        background: rgba(128, 128, 128, 0.1) !important;
        color: rgba(128, 128, 128, 0.6) !important;
        border-color: rgba(128, 128, 128, 0.3) !important;
      }

      #generation-controls button.stop-mode {
        background: rgba(239, 68, 68, 0.15) !important;
        border-color: rgba(239, 68, 68, 0.4) !important;
        color: #ef4444 !important;
      }

      #generation-controls button.stop-mode:hover:not(:disabled) {
        background: rgba(239, 68, 68, 0.25) !important;
        box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3) !important;
      }

      #status {
        color: rgba(255, 255, 255, 0.7) !important;
      }

      h2 {
        color: #ffffff !important;
      }
    `;
	} else {
		// Light theme
		style.textContent = `
      body {
        background: #ffffff !important;
        color: #333333 !important;
      }

      #sidebar {
        background: #ffffff !important;
        color: #333333 !important;
      }

      .summary-card {
        background: rgba(0, 0, 0, 0.05) !important;
        border-color: rgba(0, 0, 0, 0.1) !important;
        color: #333333 !important;
      }

      .summary-card .title {
        color: #333333 !important;
      }

      .summary-card p {
        color: #333333 !important;
      }

    .summary-card small {
      color: rgba(0, 0, 0, 0.6) !important;
    }

    .site-header {
      color: rgba(0, 0, 0, 0.7) !important;
      border-bottom-color: rgba(0, 0, 0, 0.1) !important;
    }

    .site-group .summary-card {
      border-left-color: rgba(0, 0, 0, 0.1) !important;
    }

    .loading-dots span {
      background: #333333 !important;
    }      #summary-type {
        background: rgba(0, 0, 0, 0.05) !important;
        color: #333333 !important;
        border-color: rgba(0, 0, 0, 0.2) !important;
      }

      #clear-btn {
        background: rgba(239, 68, 68, 0.1) !important;
        color: #dc2626 !important;
        border-color: rgba(239, 68, 68, 0.3) !important;
      }

      #stop-all-btn {
        background: rgba(239, 68, 68, 0.1) !important;
        color: #dc2626 !important;
        border-color: rgba(239, 68, 68, 0.3) !important;
      }

      #generation-controls button {
        background: rgba(34, 197, 94, 0.1) !important;
        color: #16a34a !important;
        border-color: rgba(34, 197, 94, 0.3) !important;
      }

      #generation-controls button:hover:not(:disabled) {
        background: rgba(34, 197, 94, 0.2) !important;
        box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3) !important;
      }

      #generation-controls button:disabled {
        background: rgba(156, 163, 175, 0.1) !important;
        color: rgba(156, 163, 175, 0.6) !important;
        border-color: rgba(156, 163, 175, 0.3) !important;
      }

      #generation-controls button.stop-mode {
        background: rgba(239, 68, 68, 0.15) !important;
        border-color: rgba(239, 68, 68, 0.4) !important;
        color: #dc2626 !important;
      }

      #generation-controls button.stop-mode:hover:not(:disabled) {
        background: rgba(239, 68, 68, 0.25) !important;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4) !important;
      }

      #status {
        color: rgba(0, 0, 0, 0.7) !important;
      }

      h2 {
        color: #333333 !important;
      }
    `;
	}

	document.head.appendChild(style);
}

// Group summaries by hostname and render
function renderGroupedSummaries() {
	container.innerHTML = "";

	// Combine summaries and add loading card if active
	const allSummaries = [...summaries];

	// Add a single loading summary if there are active summarizations
	if (activeSummarizations > 0) {
		// Get current tab info for better loading message
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			const currentTab = tabs[0];
			const pageTitle = currentTab ? currentTab.title : "Page";
			const pageUrl = currentTab ? currentTab.url : window.location.href;
			const loadingSummary = {
				url: pageUrl, // Use actual tab URL for proper grouping
				title: `Generating summary for ${pageTitle}...`,
				timestamp: Date.now(),
				loading: true,
			};
			allSummaries.unshift(loadingSummary); // Add at the beginning

			// Continue with rendering after getting tab info
			renderSummaries(allSummaries);
		});
	} else {
		renderSummaries(allSummaries);
	}
}

function renderSummaries(allSummaries) {
	// Group summaries by hostname
	const grouped = {};
	allSummaries.forEach((summary) => {
		try {
			const hostname = summary.url
				? new URL(summary.url).hostname
				: "Unknown Site";
			if (!grouped[hostname]) {
				grouped[hostname] = [];
			}
			grouped[hostname].push(summary);
		} catch (e) {
			// Handle invalid URLs
			console.warn("Invalid URL in summary:", summary.url, e);
			const hostname = "Unknown Site";
			if (!grouped[hostname]) {
				grouped[hostname] = [];
			}
			grouped[hostname].push(summary);
		}
	});

	// Sort hostnames and render groups
	Object.keys(grouped)
		.sort()
		.forEach((hostname) => {
			const siteSummaries = grouped[hostname];

			// Create site group container
			const siteGroup = document.createElement("div");
			siteGroup.className = "site-group";

			// Site header
			const siteHeader = document.createElement("div");
			siteHeader.className = "site-header";
			siteHeader.textContent = hostname || "Unknown Site";
			siteGroup.appendChild(siteHeader);

			// Sort summaries by timestamp (newest first)
			siteSummaries.sort((a, b) => {
				const timeA = a.timestamp || 0;
				const timeB = b.timestamp || 0;
				return timeB - timeA;
			});

			// Render each summary in the group
			siteSummaries.forEach((summary, index) => {
				const card = document.createElement("div");
				card.className = "summary-card";

				const time = summary.timestamp
					? new Date(summary.timestamp).toLocaleTimeString()
					: "Unknown Time";

				// Add step indicator if multiple summaries from same site
				const stepIndicator =
					siteSummaries.length > 1
						? ` (${index + 1}/${siteSummaries.length})`
						: "";

				if (summary.loading) {
					// Loading state
					card.innerHTML = `
            <small>${time}${stepIndicator}</small>
            <div class="title">${summary.title}</div>
            <div class="loading-animation">
              <div class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          `;
					card.classList.add("loading");
				} else {
					// Normal summary
					const linkUrl = summary.elementLink || summary.url;
					const isSelectedText = summary.isSelectedText;
					const isRawText = summary.isRawText;
					const displayTitle = isSelectedText
						? summary.title
						: summary.title || "Article Summary";

					card.innerHTML = `
            <small>${time}${stepIndicator}</small>
            <div class="title">${displayTitle}</div>
            <p>${summary.summary}</p>
          `;

					// Add special styling for selected text
					if (isSelectedText) {
						if (isRawText) {
							// Raw text styling
							card.classList.add("selected-text-raw");
						} else {
							// Summarized text styling
							card.classList.add("selected-text");
						}
					}

					// Make the card clickable to open the link
					if (linkUrl) {
						card.classList.add("clickable");
						card.addEventListener("click", () => {
							chrome.tabs.create({ url: linkUrl });
						});
					}
				}

				siteGroup.appendChild(card);
			});

			container.appendChild(siteGroup);
		});
}

// Apply website colors on load
applyWebsiteColors();

// Listen for tab changes and update colors
chrome.runtime.onMessage.addListener((message) => {
	if (message.type === "TAB_ACTIVATED" || message.type === "TAB_UPDATED") {
		// Small delay to ensure the tab is fully loaded
		setTimeout(() => {
			applyWebsiteColors();
		}, 100);
	}
});

// Load saved settings and processed hashes
chrome.storage.sync.get(["summaryType", "processedContentHashes"], (result) => {
	const validTypes = ["key-points", "headline", "teaser"];
	const savedType = validTypes.includes(result.summaryType)
		? result.summaryType
		: "key-points";
	summaryTypeSelect.value = savedType;

	// Load processed content hashes
	if (result.processedContentHashes) {
		processedContentHashes = new Set(result.processedContentHashes);
	}
});

// Save settings when changed
summaryTypeSelect.addEventListener("change", () => {
	const validTypes = ["key-points", "headline", "teaser"];
	const type = validTypes.includes(summaryTypeSelect.value)
		? summaryTypeSelect.value
		: "key-points";
	chrome.storage.sync.set({ summaryType: type });
	// Notify content scripts
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		if (tabs[0]) {
			chrome.tabs.sendMessage(tabs[0].id, {
				type: "UPDATE_SETTINGS",
				summaryType: type,
				processedContentHashes: Array.from(processedContentHashes),
			});
		}
	});
});

// Clear all summaries
clearBtn.addEventListener("click", () => {
	summaries = [];
	processedContentHashes.clear();
	activeSummarizations = 0; // Reset active summarizations
	renderGroupedSummaries();

	// Clear from storage
	chrome.storage.sync.remove(["processedContentHashes"]);

	statusDiv.textContent = "Summaries cleared";
	setTimeout(() => {
		statusDiv.textContent = `Ready - ${summaries.length} summaries`;
	}, 2000);
});

// Toggle generation button
toggleGenerationBtn.addEventListener("click", async () => {
	try {
		const [tab] = await chrome.tabs.query({
			active: true,
			currentWindow: true,
		});
		if (!tab) {
			statusDiv.textContent = "No active tab found";
			return;
		}

		if (isGenerationActive) {
			// Stop generation
			chrome.tabs.sendMessage(tab.id, {
				type: "STOP_ALL_SUMMARIZATIONS",
			});

			// Reset active summarizations counter
			activeSummarizations = 0;
			isGenerationActive = false;
			updateToggleButton(false);
			renderGroupedSummaries();

			statusDiv.textContent = "Generation stopped";
		} else {
			// Start generation
			chrome.tabs.sendMessage(tab.id, {
				type: "START_SUMMARIZATION",
				summaryType: summaryTypeSelect.value,
				processedContentHashes: Array.from(processedContentHashes),
			});

			isGenerationActive = true;
			updateToggleButton(true);

			statusDiv.textContent = "Starting summarization...";
		}

		toggleGenerationBtn.disabled = true;
		setTimeout(() => {
			toggleGenerationBtn.disabled = false;
		}, 1000); // Prevent rapid clicking
	} catch (error) {
		console.error("Error toggling generation:", error);
		statusDiv.textContent = "Error toggling generation";
	}
});

// Stop all generations button
stopAllBtn.addEventListener("click", async () => {
	try {
		const [tab] = await chrome.tabs.query({
			active: true,
			currentWindow: true,
		});
		if (!tab) {
			statusDiv.textContent = "No active tab found";
			return;
		}

		// Stop all summarizations
		chrome.tabs.sendMessage(tab.id, {
			type: "STOP_ALL_SUMMARIZATIONS",
		});

		// Also inform content scripts to disable any future automatic generation
		chrome.tabs.sendMessage(tab.id, { type: "DISABLE_GENERATION" });

		// Reset active summarizations counter and local state
		activeSummarizations = 0;
		isGenerationActive = false;
		allowNewGenerations = false;
		updateToggleButton(false);
		renderGroupedSummaries();

		statusDiv.textContent =
			"All generations stopped and new generation disabled";

		stopAllBtn.disabled = true;
		setTimeout(() => {
			stopAllBtn.disabled = false;
		}, 1000); // Prevent rapid clicking
	} catch (error) {
		console.error("Error stopping all generations:", error);
		statusDiv.textContent = "Error stopping generations";
	}
});

// Check API availability
async function checkAPIStatus() {
	if ("Summarizer" in self) {
		try {
			const avail = await self.Summarizer.availability();
			if (avail === "available") {
				statusDiv.textContent = "AI Summarizer Ready";
			} else if (avail === "downloadable") {
				statusDiv.textContent = "Downloading AI model...";
			} else {
				statusDiv.textContent = "AI Summarizer Unavailable";
			}
		} catch (e) {
			statusDiv.textContent = "AI Summarizer Error";
		}
	} else {
		statusDiv.textContent = "AI Summarizer Not Supported";
	}
}

checkAPIStatus();

// Listen for new summaries
chrome.runtime.onMessage.addListener((msg) => {
	if (msg.type === "NEW_SUMMARY") {
		// Decrement active summarizations count
		activeSummarizations = Math.max(0, activeSummarizations - 1);

		// Clear loading state if no more active summarizations
		if (activeSummarizations === 0) {
			statusDiv.textContent = `${summaries.length + 1} summaries`;
			// Reset toggle button if generation is complete
			if (isGenerationActive) {
				isGenerationActive = false;
				updateToggleButton(false);
			}
		}

		// Add to summaries array
		summaries.push(msg);

		// Store content hash persistently
		if (msg.contentHash) {
			processedContentHashes.add(msg.contentHash);
			chrome.storage.sync.set({
				processedContentHashes: Array.from(processedContentHashes),
			});
		}

		// Re-render grouped summaries
		renderGroupedSummaries();

		statusDiv.textContent = `${summaries.length} summaries`;
	} else if (msg.type === "SUMMARIZING_START") {
		// Increment active summarizations count
		activeSummarizations++;

		// Re-render to show loading state
		renderGroupedSummaries();

		statusDiv.textContent = `Generating ${activeSummarizations} summary${
			activeSummarizations > 1 ? "ies" : ""
		}...`;
	}
});

// Update status periodically
setInterval(() => {
	if (summaries.length > 0) {
		statusDiv.textContent = `${summaries.length} summaries`;
	}
}, 5000);
