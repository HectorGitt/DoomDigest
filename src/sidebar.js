// sidebar.js
const container = document.getElementById("summaries");
const toggleGenerationBtn = document.getElementById("toggle-generation-btn");
const stopAllBtn = document.getElementById("stop-all-btn");
const floatingSettingsBtn = document.getElementById("floating-settings-btn");
const viewAllBtn = document.getElementById("view-all-btn");
const autoSnapToggleBtn = document.getElementById("auto-snap-toggle-btn");

let summaries = [];
let processedContentHashes = new Set(); // Store processed content hashes persistently
let activeSummarizations = 0; // Track number of active summarizations
let isGenerationActive = false; // Track if generation is currently active
let siteGroups = {}; // Group summaries by hostname
let isLoading = false; // Track loading state
let isSidebarReady = false; // Track if sidebar is fully loaded

// Loading state management functions
function showLoading(message = "Processing...") {
	const loadingElement = document.getElementById("loading-indicator");
	if (loadingElement) {
		loadingElement.textContent = message;
		loadingElement.style.display = "block";
		isLoading = true;
		// Save loading state to storage
		chrome.storage.local.set({
			sidebarLoadingState: { isLoading: true, message: message },
		});
	}
}

function hideLoading() {
	const loadingElement = document.getElementById("loading-indicator");
	if (loadingElement) {
		loadingElement.style.display = "none";
		isLoading = false;
		// Clear loading state from storage
		chrome.storage.local.remove(["sidebarLoadingState"]);
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

// Helper function to update toggle button with icon and text
function updateToggleButton(isActive, isReady = false) {
	const iconSpan = toggleGenerationBtn.querySelector(".material-icons");
	const textSpan = document.createElement("span");

	if (isReady && !isActive) {
		// Ready state - show success color when fully loaded
		iconSpan.textContent = "check_circle";
		textSpan.textContent = "Start Page Pulse";
		toggleGenerationBtn.className = "ready-mode";
	} else if (isActive) {
		iconSpan.textContent = "stop";
		textSpan.textContent = "Stop All";
		toggleGenerationBtn.className = "stop-mode";
	} else {
		iconSpan.textContent = "play_arrow";
		textSpan.textContent = "Start PagePulse";
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

// Helper function to update processing counter
function updateProcessingCounter(count) {
	const counter = document.getElementById("processing-counter");
	const countSpan = document.getElementById("processing-count");

	if (count > 0) {
		countSpan.textContent = count;
		counter.style.display = "flex";
	} else {
		counter.style.display = "none";
	}
}

// Helper function to update View All button with total count
function updateViewAllButton(count) {
	const viewAllBtn = document.getElementById("view-all-btn");
	const textSpan = viewAllBtn.querySelector("span:last-child");

	if (count > 0) {
		textSpan.textContent = `View All (${count})`;
	} else {
		textSpan.textContent = "View All";
	}
}

// Helper function to update Auto Snap button state
function updateAutoSnapButton(isEnabled) {
	const iconSpan = autoSnapToggleBtn.querySelector(".material-icons");
	const textSpan = autoSnapToggleBtn.querySelector("span:last-child");

	if (isEnabled) {
		autoSnapToggleBtn.classList.add("active");
		iconSpan.textContent = "flash_on";
		textSpan.textContent = "Auto Snap: ON";
	} else {
		autoSnapToggleBtn.classList.remove("active");
		iconSpan.textContent = "flash_off";
		textSpan.textContent = "Auto Snap: OFF";
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
        background: rgba(34, 159, 197, 0.08) !important;
        color: #22c55e !important;
        border-color: rgba(0, 0, 0, 0.3) !important;
      }

      #generation-controls button:hover:not(:disabled) {
        background: rgba(92, 193, 230, 0.15) !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
      }

      #generation-controls button:disabled {
        background: rgba(128, 128, 128, 0.1) !important;
        color: rgba(128, 128, 128, 0.6) !important;
        border-color: rgba(128, 128, 128, 0.3) !important;
      }

      #generation-controls button.stop-mode {
        background: rgba(239, 68, 68, 0.08) !important;
        border-color: rgba(239, 68, 68, 0.3) !important;
        color: #ef4444 !important;
      }

      #generation-controls button.stop-mode:hover:not(:disabled) {
        background: rgba(239, 68, 68, 0.15) !important;
        box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3) !important;
      }

      #generation-controls button.ready-mode {
        background: rgba(16, 185, 129, 0.3) !important;
        border-color: rgba(16, 185, 129, 0.6) !important;
        color: #ffffff !important;
      }

      #generation-controls button.ready-mode:hover:not(:disabled) {
        background: rgba(16, 185, 129, 0.4) !important;
        box-shadow: 0 2px 8px rgba(16, 185, 129, 0.5) !important;
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
        background: rgba(34, 197, 94, 0.2) !important;
        color: #16a34a !important;
        border-color: rgba(34, 197, 94, 0.4) !important;
      }

      #generation-controls button:hover:not(:disabled) {
        background: rgba(34, 197, 94, 0.3) !important;
        box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3) !important;
      }

      #generation-controls button:disabled {
        background: rgba(156, 163, 175, 0.1) !important;
        color: rgba(156, 163, 175, 0.6) !important;
        border-color: rgba(156, 163, 175, 0.3) !important;
      }

      #generation-controls button.stop-mode {
        background: rgba(239, 68, 68, 0.2) !important;
        border-color: rgba(239, 68, 68, 0.4) !important;
        color: #dc2626 !important;
      }

      #generation-controls button.stop-mode:hover:not(:disabled) {
        background: rgba(239, 68, 68, 0.3) !important;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4) !important;
      }

      #generation-controls button.ready-mode {
        background: rgba(16, 185, 129, 0.5) !important;
        border-color: rgba(16, 185, 129, 0.7) !important;
        color: #000000 !important;
      }

      #generation-controls button.ready-mode:hover:not(:disabled) {
        background: rgba(16, 185, 129, 0.6) !important;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.6) !important;
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
	// Sort all summaries by timestamp (newest first)
	allSummaries.sort((a, b) => {
		const timeA = a.timestamp || 0;
		const timeB = b.timestamp || 0;
		return timeB - timeA;
	});

	// Limit to 20 summaries for sidebar view
	const sidebarSummaries = allSummaries.slice(0, 20);
	const hasMoreSummaries = allSummaries.length > 20;
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

	// Update View All button with total count
	updateViewAllButton(allSummaries.length);
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
				updateViewAllButton(summaries.length);
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
chrome.storage.sync.get(
	["processedContentHashes", "autoSnapEnabled"],
	(result) => {
		// Load processed content hashes
		if (result.processedContentHashes) {
			processedContentHashes = new Set(result.processedContentHashes);
		}

		// Update auto snap button state
		updateAutoSnapButton(result.autoSnapEnabled || false);

		// Restore loading state if it exists
		chrome.storage.local.get(["sidebarLoadingState"], (localResult) => {
			if (
				localResult.sidebarLoadingState &&
				localResult.sidebarLoadingState.isLoading
			) {
				showLoading(localResult.sidebarLoadingState.message);
			}

			// Load saved summaries from IndexedDB
			loadSummariesFromIndexedDB()
				.then((loadedSummaries) => {
					summaries = loadedSummaries || [];
					renderGroupedSummaries();
					updateViewAllButton(summaries.length);
					updateStatus();

					// Mark sidebar as ready and update button
					isSidebarReady = true;
					updateToggleButton(isGenerationActive, isSidebarReady);
				})
				.catch((error) => {
					console.error(
						"Error loading summaries from IndexedDB:",
						error
					);
					summaries = [];
					renderGroupedSummaries();
					updateViewAllButton(0);
					updateStatus();

					// Still mark as ready even on error
					isSidebarReady = true;
					updateToggleButton(isGenerationActive, isSidebarReady);
				});
		});
	}
);

// Settings button
floatingSettingsBtn.addEventListener("click", () => {
	chrome.runtime.openOptionsPage();
});

// View All button
viewAllBtn.addEventListener("click", () => {
	// Open the digest page
	chrome.tabs.create({ url: chrome.runtime.getURL("digest.html") });
});

// Auto Snap toggle button
autoSnapToggleBtn.addEventListener("click", async () => {
	try {
		// Get current auto-snap state
		const result = await chrome.storage.sync.get(["autoSnapEnabled"]);
		const currentState = result.autoSnapEnabled || false;
		const newState = !currentState;

		// Save new state
		await chrome.storage.sync.set({ autoSnapEnabled: newState });

		// Update button appearance
		updateAutoSnapButton(newState);

		// Show feedback
		if (window.showToast) {
			window.showToast(
				`Auto Snap ${newState ? "Enabled" : "Disabled"}`,
				newState ? "success" : "info"
			);
		}

		console.log(`Auto Snap ${newState ? "enabled" : "disabled"}`);
	} catch (error) {
		console.error("Error toggling auto snap:", error);
	}
});

// Toggle generation button
toggleGenerationBtn.addEventListener("click", async () => {
	try {
		const [tab] = await chrome.tabs.query({
			active: true,
			currentWindow: true,
		});
		if (!tab) {
			console.log("No active tab found");
			return;
		}

		if (isGenerationActive) {
			// Stop generation
			chrome.tabs.sendMessage(tab.id, {
				type: "STOP_ALL_SUMMARIZATIONS",
			});

			// Reset active summarizations counter
			activeSummarizations = 0;
			updateProcessingCounter(activeSummarizations);
			isGenerationActive = false;
			updateToggleButton(false, isSidebarReady);
			renderGroupedSummaries();

			console.log("Generation stopped");
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
				// Show error message and open settings
				console.error("AI not available for page pulse");
				if (window.showToast) {
					window.showToast(
						"AI not available. Please configure API in settings.",
						"error"
					);
				}
				showSettingsButton(
					"AI not available. Please configure API in settings."
				);
				return;
			}

			// Load default summary type from settings
			const settings = await chrome.storage.sync.get(["defaultSummaryType"]);
			const summaryType = settings.defaultSummaryType || "teasers";

			// Start generation
			chrome.tabs.sendMessage(tab.id, {
				type: "START_SUMMARIZATION",
				summaryType: summaryType,
				processedContentHashes: Array.from(processedContentHashes),
			});

			isGenerationActive = true;
			updateToggleButton(true, isSidebarReady);

			console.log("Starting summarization...");
		}

		toggleGenerationBtn.disabled = true;
		setTimeout(() => {
			toggleGenerationBtn.disabled = false;
		}, 1000); // Prevent rapid clicking
	} catch (error) {
		console.error("Error toggling generation:", error);
		console.log("Error toggling generation");
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
			console.log("No active tab found");
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
		updateProcessingCounter(activeSummarizations);
		isGenerationActive = false;
		allowNewGenerations = false;
		updateToggleButton(false, isSidebarReady);
		renderGroupedSummaries();

		console.log("All generations stopped and new generation disabled");

		stopAllBtn.disabled = true;
		setTimeout(() => {
			stopAllBtn.disabled = false;
		}, 1000); // Prevent rapid clicking
	} catch (error) {
		console.error("Error stopping all generations:", error);
		console.log("Error stopping generations");
	}
});

// Check API availability
async function checkAPIStatus() {
	// First check if Gemini API key has been tested successfully
	const geminiTested = await checkGeminiTestedStatus();

	if (geminiTested) {
		// If Gemini has been tested successfully, use it and clear any errors
		await switchToGeminiProvider();
		console.log("Using Gemini API");
		return;
	}

	// Check Chrome AI availability
	if ("Summarizer" in self) {
		try {
			const avail = await self.Summarizer.availability();
			if (avail === "available") {
				console.log("AI Summarizer Ready");
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
	// Since we don't have a status div anymore, just open settings directly
	console.log(message);
	chrome.runtime.openOptionsPage();
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
		updateProcessingCounter(activeSummarizations);

		// Clear loading state if no more active summarizations
		if (activeSummarizations === 0) {
			// Reset toggle button if generation is complete
			if (isGenerationActive) {
				isGenerationActive = false;
				updateToggleButton(false, isSidebarReady);
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
	} else if (msg.type === "SUMMARIZING_START") {
		// Increment active summarizations count
		activeSummarizations++;
		updateProcessingCounter(activeSummarizations);

		// Re-render to show loading state
		renderGroupedSummaries();
	} else if (msg.type === "REFRESH_SIDEBAR") {
		// Refresh sidebar data
		loadSummariesFromIndexedDB()
			.then((loadedSummaries) => {
				summaries = loadedSummaries || [];
				renderGroupedSummaries();
				updateViewAllButton(summaries.length);
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
			updateViewAllButton(summaries.length);
		})
		.catch((error) => {
			console.error("Error loading summaries on init:", error);
			summaries = [];
			renderGroupedSummaries();
			updateViewAllButton(0);
		});
});

// Update status display
function updateStatus() {
	// Status display removed - no longer needed
}
