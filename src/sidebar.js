// sidebar.js
const container = document.getElementById("summaries");
const statusDiv = document.getElementById("status");
const summaryTypeSelect = document.getElementById("summary-type");
const clearBtn = document.getElementById("clear-btn");
const toggleGenerationBtn = document.getElementById("toggle-generation-btn");
const stopAllBtn = document.getElementById("stop-all-btn");
const searchInput = document.getElementById("search-input");

let summaries = [];
let processedContentHashes = new Set(); // Store processed content hashes persistently
let activeSummarizations = 0; // Track number of active summarizations
let isGenerationActive = false; // Track if generation is currently active
let siteGroups = {}; // Group summaries by hostname
let currentSearchQuery = ""; // Current search query for filtering
let isLoading = false; // Track loading state

// Loading state management functions
function showLoading(message = "Processing...") {
	const loadingElement = document.getElementById("loading-indicator");
	if (loadingElement) {
		loadingElement.textContent = message;
		loadingElement.style.display = "block";
		isLoading = true;
	}
}

function hideLoading() {
	const loadingElement = document.getElementById("loading-indicator");
	if (loadingElement) {
		loadingElement.style.display = "none";
		isLoading = false;
	}
}

// IndexedDB setup for summaries storage
let dbPromise = null;

function initIndexedDB() {
	if (dbPromise) return dbPromise;

	dbPromise = new Promise((resolve, reject) => {
		const request = indexedDB.open("DoomDigestDB", 1);

		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);

		request.onupgradeneeded = (event) => {
			const db = event.target.result;

			// Create summaries store if it doesn't exist
			if (!db.objectStoreNames.contains("summaries")) {
				const store = db.createObjectStore("summaries", {
					keyPath: "id",
					autoIncrement: true,
				});
				store.createIndex("timestamp", "timestamp", { unique: false });
				store.createIndex("url", "url", { unique: false });
				store.createIndex("contentHash", "contentHash", {
					unique: false,
				});
			}
		};
	});

	return dbPromise;
}

// Save summaries to IndexedDB
async function saveSummariesToIndexedDB(summaries) {
	try {
		const db = await initIndexedDB();
		const transaction = db.transaction(["summaries"], "readwrite");
		const store = transaction.objectStore("summaries");

		// Clear existing summaries and add new ones
		await new Promise((resolve, reject) => {
			const clearRequest = store.clear();
			clearRequest.onsuccess = () => resolve();
			clearRequest.onerror = () => reject(clearRequest.error);
		});

		// Add all summaries
		for (const summary of summaries) {
			await new Promise((resolve, reject) => {
				const addRequest = store.add(summary);
				addRequest.onsuccess = () => resolve();
				addRequest.onerror = () => reject(addRequest.error);
			});
		}

		return { success: true };
	} catch (error) {
		console.error("Error saving summaries to IndexedDB:", error);
		return { success: false, error: error.message };
	}
}

// Load summaries from IndexedDB
async function loadSummariesFromIndexedDB() {
	try {
		const db = await initIndexedDB();
		const transaction = db.transaction(["summaries"], "readonly");
		const store = transaction.objectStore("summaries");

		return new Promise((resolve, reject) => {
			const request = store.getAll();
			request.onsuccess = () => {
				const summaries = request.result || [];
				resolve(summaries);
			};
			request.onerror = () => reject(request.error);
		});
	} catch (error) {
		console.error("Error loading summaries from IndexedDB:", error);
		return [];
	}
}

// Clear all summaries from IndexedDB
async function clearIndexedDB() {
	try {
		const db = await initIndexedDB();
		const transaction = db.transaction(["summaries"], "readwrite");
		const store = transaction.objectStore("summaries");

		return new Promise((resolve, reject) => {
			const clearRequest = store.clear();
			clearRequest.onsuccess = () => resolve();
			clearRequest.onerror = () => reject(clearRequest.error);
		});
	} catch (error) {
		console.error("Error clearing IndexedDB:", error);
		throw error;
	}
}

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
	// Filter summaries based on search query
	let filteredSummaries = allSummaries;
	if (currentSearchQuery.trim()) {
		const query = currentSearchQuery.toLowerCase().trim();
		filteredSummaries = allSummaries.filter((summary) => {
			// Search in title, summary content, and URL
			const title = (summary.title || "").toLowerCase();
			const summaryText = (summary.summary || "").toLowerCase();
			const url = (summary.url || "").toLowerCase();

			return (
				title.includes(query) ||
				summaryText.includes(query) ||
				url.includes(query)
			);
		});
	}

	// Sort all summaries by timestamp (newest first)
	filteredSummaries.sort((a, b) => {
		const timeA = a.timestamp || 0;
		const timeB = b.timestamp || 0;
		return timeB - timeA;
	});

	// Limit to 20 summaries for sidebar view
	const sidebarSummaries = filteredSummaries.slice(0, 20);
	const hasMoreSummaries = filteredSummaries.length > 20;

	// Group summaries by day
	const grouped = {};
	sidebarSummaries.forEach((summary) => {
		const date = summary.timestamp
			? new Date(summary.timestamp).toDateString()
			: "Unknown Date";
		if (!grouped[date]) {
			grouped[date] = [];
		}
		grouped[date].push(summary);
	});

	// Sort dates (newest first)
	const sortedDates = Object.keys(grouped).sort((a, b) => {
		const dateA = new Date(a).getTime();
		const dateB = new Date(b).getTime();
		return dateB - dateA;
	});

	// Render groups
	sortedDates.forEach((date) => {
		const daySummaries = grouped[date];

		// Create day group container
		const dayGroup = document.createElement("div");
		dayGroup.className = "day-group";

		// Day header
		const dayHeader = document.createElement("div");
		dayHeader.className = "day-header";
		dayHeader.textContent = date;
		dayGroup.appendChild(dayHeader);

		// Render each summary in the day
		daySummaries.forEach((summary) => {
			const card = document.createElement("div");
			card.className = "summary-card";

			const time = summary.timestamp
				? new Date(summary.timestamp).toLocaleTimeString()
				: "Unknown Time";

			// Get page title/hostname for display
			let pageHeading = "";
			try {
				const url = new URL(summary.url);
				pageHeading = url.hostname;
			} catch (e) {
				pageHeading = "Unknown Site";
			}

			if (summary.loading) {
				// Loading state
				card.innerHTML = `
            <div class="card-header">
                <small>${time}</small>
                <div class="page-heading">${pageHeading}</div>
            </div>
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

				// Add mode indicator for AI operations
				let modeIndicator = "";
				if (summary.mode) {
					modeIndicator = ` <span class="mode-indicator">${summary.mode}</span>`;
				}

				card.innerHTML = `
            <div class="card-header">
                <small>${time}</small>
                <div class="page-heading">${pageHeading}${modeIndicator}</div>
            </div>
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

			dayGroup.appendChild(card);
		});

		container.appendChild(dayGroup);
	});

	// Add "View All" button if there are more summaries
	if (hasMoreSummaries) {
		const viewAllButton = document.createElement("button");
		viewAllButton.id = "view-all-btn";
		viewAllButton.innerHTML = `
            <span class="material-icons">expand_more</span>
            <span>View All Digests (${filteredSummaries.length})</span>
        `;
		viewAllButton.addEventListener("click", () => {
			// Open the digest page
			chrome.tabs.create({ url: chrome.runtime.getURL("digest.html") });
		});
		container.appendChild(viewAllButton);
	}
}

// Apply website colors on load
applyWebsiteColors();

// Listen for visibility changes to refresh data when sidebar becomes visible
document.addEventListener("visibilitychange", () => {
	if (!document.hidden) {
		// Sidebar became visible, refresh data
		loadSummariesFromIndexedDB()
			.then((loadedSummaries) => {
				summaries = loadedSummaries || [];
				renderGroupedSummaries();
				statusDiv.textContent = `${summaries.length} summaries`;
			})
			.catch((error) => {
				console.error(
					"Error refreshing sidebar on visibility change:",
					error
				);
			});
	}
});

// Listen for tab changes and update colors
chrome.runtime.onMessage.addListener((message) => {
	if (message.type === "TAB_ACTIVATED" || message.type === "TAB_UPDATED") {
		// Small delay to ensure the tab is fully loaded
		setTimeout(() => {
			applyWebsiteColors();
		}, 100);
	} else if (message.type === "SHOW_LOADING") {
		showLoading(message.message || "Processing...");
	} else if (message.type === "HIDE_LOADING") {
		hideLoading();
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

	// Load saved summaries from IndexedDB
	loadSummariesFromIndexedDB()
		.then((loadedSummaries) => {
			summaries = loadedSummaries || [];
			renderGroupedSummaries();
			updateStatus();
		})
		.catch((error) => {
			console.error("Error loading summaries from IndexedDB:", error);
			summaries = [];
			renderGroupedSummaries();
			updateStatus();
		});
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

	// Clear from IndexedDB and storage
	clearIndexedDB()
		.then(() => {
			console.log("Summaries cleared from IndexedDB");
		})
		.catch((error) => {
			console.error("Error clearing IndexedDB:", error);
		});
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
			// Check API availability before starting generation
			const geminiTested = await checkGeminiTestedStatus();
			let canProceed = false;

			if (geminiTested) {
				canProceed = true;
			} else if ("Summarizer" in self) {
				try {
					const avail = await self.Summarizer.availability();
					canProceed = avail === "available";
				} catch (e) {
					canProceed = false;
				}
			}

			if (!canProceed) {
				showSettingsButton(
					"AI not available. Please configure API in settings."
				);
				toggleGenerationBtn.disabled = false;
				return;
			}

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
	// First check if Gemini API key has been tested successfully
	const geminiTested = await checkGeminiTestedStatus();

	if (geminiTested) {
		// If Gemini has been tested successfully, use it and clear any errors
		await switchToGeminiProvider();
		statusDiv.textContent = "Using Gemini API";
		return;
	}

	// Check Chrome AI availability
	if ("Summarizer" in self) {
		try {
			const avail = await self.Summarizer.availability();
			if (avail === "available") {
				statusDiv.textContent = "AI Summarizer Ready";
			} else {
				// Show button to go to settings instead of downloading
				showSettingsButton(
					"AI model not ready. Configure API in settings."
				);
			}
		} catch (e) {
			showSettingsButton(
				"AI Summarizer Error. Configure alternative API in settings."
			);
		}
	} else {
		showSettingsButton(
			"AI Summarizer Not Supported. Configure alternative API in settings."
		);
	}
}

function showSettingsButton(message) {
	statusDiv.innerHTML = `
		<span>${message}</span>
		<button id="go-to-settings" style="margin-left: 10px; padding: 4px 8px; font-size: 12px;">
			Settings
		</button>
	`;

	// Add event listener to the button
	document.getElementById("go-to-settings").addEventListener("click", () => {
		chrome.runtime.openOptionsPage();
	});
}

async function checkGeminiTestedStatus() {
	return new Promise((resolve) => {
		chrome.storage.sync.get(["geminiApiTested"], (result) => {
			resolve(result.geminiApiTested === true);
		});
	});
}

async function switchToGeminiProvider() {
	return new Promise((resolve) => {
		chrome.storage.sync.set({ apiProvider: "gemini" }, () => {
			resolve();
		});
	});
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

		// Store summaries persistently in IndexedDB
		saveSummariesToIndexedDB(summaries)
			.then(() => {
				console.log("Summary saved to IndexedDB");
			})
			.catch((error) => {
				console.error("Error saving summary to IndexedDB:", error);
			});

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
	} else if (msg.type === "REFRESH_SIDEBAR") {
		// Refresh sidebar data
		loadSummariesFromIndexedDB()
			.then((loadedSummaries) => {
				summaries = loadedSummaries || [];
				renderGroupedSummaries();
				statusDiv.textContent = `${summaries.length} summaries`;
			})
			.catch((error) => {
				console.error("Error refreshing sidebar:", error);
			});
	}
});

// Listen for storage changes to update API status
chrome.storage.onChanged.addListener((changes, namespace) => {
	if (
		namespace === "sync" &&
		(changes.apiProvider || changes.geminiApiTested)
	) {
		// Re-check API status when provider or test status changes
		checkAPIStatus();
	}
});

// Handle messages from settings for export
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === "GET_SUMMARIES_FOR_EXPORT") {
		// Load summaries from IndexedDB for export
		loadSummariesFromIndexedDB()
			.then((loadedSummaries) => {
				sendResponse({ summaries: loadedSummaries || [] });
			})
			.catch((error) => {
				console.error("Error loading summaries for export:", error);
				sendResponse({ summaries: [] });
			});
		return true; // Keep the message channel open for async response
	}
});

// Load persisted summaries on init
chrome.storage.sync.get(["processedContentHashes"], (result) => {
	if (result.processedContentHashes) {
		processedContentHashes = new Set(result.processedContentHashes);
	}

	// Load summaries from IndexedDB
	loadSummariesFromIndexedDB()
		.then((loadedSummaries) => {
			summaries = loadedSummaries || [];
			renderGroupedSummaries();
			statusDiv.textContent = `${summaries.length} summaries`;
		})
		.catch((error) => {
			console.error("Error loading summaries on init:", error);
			summaries = [];
			renderGroupedSummaries();
			statusDiv.textContent = "0 summaries";
		});
});

// Search functionality
searchInput.addEventListener("input", () => {
	currentSearchQuery = searchInput.value;
	renderGroupedSummaries();
});

// Update status display
function updateStatus() {
	statusDiv.textContent = `${summaries.length} summaries`;
}
