// content.js
let summarized = new WeakSet();
let processedContentHashes = new Set(); // Store hashes of processed content
let summaryType = "teaser"; // default
let summarizationEnabled = false; // Control flag for summarization - disabled by default
let stopPendingRequested = false; // Flag to stop pending summarizations

// Auto-snap functionality
let autoSnapEnabled = false; // Control flag for auto-snap
let autoSnapDuration = 15; // Default duration in seconds
let pageActivityStartTime = null; // When user started being active on page
let autoSnapTimer = null; // Timer for auto-snap
let pageSnapped = false; // Flag to ensure only one snap per page

// Simple hash function for content deduplication
function hashString(str) {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return hash.toString();
}

// Normalize text for consistent hashing and processing
function normalizeText(text) {
	return text.replace(/\s+/g, " ").trim();
}

// Helper function to extract title from element or nearby heading
function extractTitle(el) {
	// Try to find a heading within or near the element
	const headings = el.querySelectorAll("h1, h2, h3, h4, h5, h6");
	if (headings.length > 0) {
		return headings[0].textContent.trim();
	}

	// Fallback to first line of text
	const firstLine = el.innerText.split("\n")[0].trim();
	return firstLine.length > 50
		? firstLine.slice(0, 50) + "..."
		: firstLine || "Article Summary";
}

function extractElementLink(el) {
	// Try to find a link within the element (anchor tag)
	const link = el.querySelector("a[href]");
	if (link && link.href) {
		return link.href;
	}

	// Try to find any element with a data-url or similar attribute
	const dataUrl = el.getAttribute("data-url") || el.getAttribute("data-href");
	if (dataUrl) {
		return dataUrl;
	}

	// Fallback to current page URL
	return location.href;
}

// Helper function to show error notifications
async function showErrorNotification(title, message) {
	try {
		await chrome.notifications.create({
			type: "basic",
			iconUrl: chrome.runtime.getURL("icon.png"),
			title: title,
			message: message,
		});
	} catch (e) {
		console.error("Failed to show notification:", e);
		// Fallback to console warning if notifications fail
		console.warn(`${title}: ${message}`);
	}
}

// Helper function to store summary locally when sidebar is not available
async function storeSummaryLocally(summaryData) {
	try {
		// Send to background script for proper storage with quota management
		const response = await chrome.runtime.sendMessage({
			type: "STORE_SUMMARY_LOCALLY",
			summaryData: summaryData,
		});

		if (response && response.success) {
			console.log("Summary stored locally via background script");
		} else {
			console.error("Failed to store summary locally:", response?.error);
		}
	} catch (e) {
		console.error("Failed to store summary locally:", e);
	}
}

// Find containers with repeating sibling blocks (like social media feeds)
function findRepeatingSiblings() {
	const candidates = [];
	const allDivs = Array.from(
		document.querySelectorAll("div, section, main, article")
	);

	for (const div of allDivs) {
		const children = Array.from(div.children);
		if (children.length < 2) continue; // Need at least 2 children

		const tagName = children[0].tagName;
		// Check if all children have the same tag name
		if (!children.every((c) => c.tagName === tagName)) continue;

		// Measure text similarity and content quality
		const textLengths = children
			.map((c) => c.innerText?.trim().length || 0)
			.filter((len) => len > 0);

		if (textLengths.length < 2) continue;

		const avgLength =
			textLengths.reduce((a, b) => a + b, 0) / textLengths.length;

		// Calculate standard deviation to check similarity
		const stdDev = Math.sqrt(
			textLengths
				.map((len) => Math.pow(len - avgLength, 2))
				.reduce((a, b) => a + b, 0) / textLengths.length
		);

		// Check if content is substantial and similar
		if (
			avgLength > 100 &&
			stdDev < avgLength * 0.8 &&
			children.length >= 3
		) {
			candidates.push({
				container: div,
				childCount: children.length,
				avgLength,
				score: children.length * avgLength, // Score by total content
			});
		}
	}

	// Sort by score (most posts with longest content first)
	candidates.sort((a, b) => b.score - a.score);
	return candidates[0]?.container || null;
}

// Predict if page is a single article or a feed of posts
function predictPageType() {
	const container = findRepeatingSiblings();
	if (!container) return "article";

	// Additional checks to confirm it's a feed
	const children = Array.from(container.children);
	const hasManySimilarChildren = children.length >= 3;

	// Check if children have similar structure (indicating posts/cards)
	const firstChild = children[0];
	const similarStructure = children.slice(1, 4).every((child) => {
		return (
			child.querySelectorAll("*").length >=
			firstChild.querySelectorAll("*").length * 0.5
		);
	});

	if (hasManySimilarChildren && similarStructure) {
		return "feed";
	}

	return "article";
}

// Extract individual posts from a feed
function extractPosts() {
	const container = findRepeatingSiblings();
	if (!container) return [];

	const posts = Array.from(container.children)
		.map((el) => ({
			text: el.innerText.trim(),
			element: el,
		}))
		.filter((p) => {
			const wordCount = p.text.split(/\s+/).length;
			return wordCount > 30 && wordCount < 1000; // Reasonable post size
		})
		.slice(0, 10); // Limit to first 10 posts to avoid spam

	return posts;
}

// Main content extraction function that chooses the right method
function extractReadableContent() {
	const pageType = predictPageType();

	if (pageType === "feed") {
		console.log("Detected feed page, extracting individual posts");
		return extractPosts();
	} else {
		console.log("Detected article page, extracting main content");
		return getArticleText();
	}
}

// Fallback article text extraction (simplified Readability-like)
function getArticleText() {
	// Try to find main article content
	const selectors = [
		"article",
		'[role="article"]',
		".post-content",
		".entry-content",
		".article-content",
		".story-body",
		"main article",
		"main .content",
	];

	for (const selector of selectors) {
		const element = document.querySelector(selector);
		if (element && element.innerText.trim().length > 200) {
			return [
				{
					text: element.innerText.trim(),
					element: element,
				},
			];
		}
	}

	// Fallback: find largest text block
	const textBlocks = Array.from(document.querySelectorAll("p, div, section"))
		.map((el) => ({
			text: el.innerText.trim(),
			element: el,
		}))
		.filter((block) => {
			const wordCount = block.text.split(/\s+/).length;
			return wordCount > 50 && wordCount < 2000;
		})
		.sort((a, b) => b.text.length - a.text.length);

	return textBlocks.slice(0, 3); // Return top 3 largest blocks
}

// Load settings from storage
async function loadSettings() {
	return new Promise((resolve) => {
		chrome.storage.sync.get(
			["defaultSummaryType", "autoSnapEnabled", "autoSnapDuration"],
			(result) => {
				const validTypes = ["key-points", "headline", "teaser"];
				summaryType = validTypes.includes(result.defaultSummaryType)
					? result.defaultSummaryType
					: "teaser";
				autoSnapEnabled = result.autoSnapEnabled || false;
				autoSnapDuration = parseInt(result.autoSnapDuration) || 15;

				console.log("Settings loaded:", {
					summaryType,
					autoSnapEnabled,
					autoSnapDuration,
				});
				resolve();
			}
		);
	});
}

// Initialize settings and start functionality
async function initializeContentScript() {
	await loadSettings();

	// Start auto-snap tracking if enabled
	if (autoSnapEnabled) {
		console.log("Auto-snap enabled, starting activity tracking");
		trackUserActivity();
	} else {
		console.log("Auto-snap disabled");
	}
}

// Load settings from storage
loadSettings();

async function isSummarizerAvailable() {
	if (!("Summarizer" in self)) return false;
	try {
		const avail = await self.Summarizer.availability();
		return avail === "available" || avail === "downloadable";
	} catch (e) {
		return false;
	}
}

async function summarizeText(text) {
	if (!(await isSummarizerAvailable())) {
		console.warn("Summarizer not available");
		return null;
	}

	// Check if extension context is still valid
	if (!chrome.runtime || !chrome.runtime.sendMessage) {
		console.warn("Extension context invalidated");
		return null;
	}
	console.log("Summarizing text with type:", summaryType);

	try {
		const session = await self.Summarizer.create({
			type: summaryType,
			format: "plain-text",
			length: "medium",
			outputLanguage: "en",
			expectedInputLanguages: ["en", "ja", "es"],
			expectedContextLanguages: ["en"],
		});
		const summary = await session.summarize(text);
		await session.destroy();
		return summary;
	} catch (e) {
		console.error("Summarization failed:", e);
		return null;
	}
}

function getVisibleArticles() {
	// Use smart content detection
	const contentBlocks = extractReadableContent();

	// Filter by visibility and deduplication
	const visibleElements = contentBlocks
		.map((block) => block.element)
		.filter((el) => {
			// Check content hash to prevent processing same content twice
			const normalizedText = normalizeText(el.innerText);
			const contentHash = hashString(normalizedText);
			if (processedContentHashes.has(contentHash)) {
				console.log(
					"Skipping duplicate content:",
					normalizedText.slice(0, 100) + "..."
				);
				return false;
			}

			const rect = el.getBoundingClientRect();
			const visible =
				rect.top < window.innerHeight && // Must be in viewport
				rect.bottom > -50 && // A bit above viewport
				normalizedText.length > 100 && // Minimum normalized text
				el.offsetHeight > 30 && // Lower height threshold
				rect.width > 150; // Minimum width
			return visible;
		});

	// Take top 5 most relevant elements to avoid spam
	const topElements = visibleElements.slice(0, 5);

	return topElements;
}

async function checkAndSummarize() {
	if (!(await isSummarizerAvailable()) || !summarizationEnabled) return;

	try {
		const visible = getVisibleArticles();
		if (visible.length > 0 && !stopPendingRequested) {
			// Notify sidebar that summarization is starting
			try {
				await chrome.runtime.sendMessage({ type: "SUMMARIZING_START" });
			} catch (e) {
				// Ignore if sidebar isn't ready
			}
		}

		for (const el of visible) {
			// Check if we should stop processing
			if (!summarizationEnabled || stopPendingRequested) break;

			// Normalize text for consistent processing
			const normalizedText = normalizeText(el.innerText);
			const contentHash = hashString(normalizedText);

			// Skip if content already processed (double-check)
			if (processedContentHashes.has(contentHash)) {
				console.log(
					"Skipping duplicate content:",
					normalizedText.slice(0, 100) + "..."
				);
				continue;
			}

			summarized.add(el);

			// Use normalized text for summarization input (limited to 2000 chars)
			const text = normalizedText.slice(0, 2000);
			if (text.length < 100) continue; // Skip very short content

			// Extract better title
			const title = extractTitle(el);

			// Extract element link for clickable summaries
			const elementLink = extractElementLink(el);

			// Notify sidebar that summarization is starting for this specific content
			try {
				await chrome.runtime.sendMessage({
					type: "SUMMARIZING_START",
					url: location.href,
					title: title,
					contentHash: contentHash,
				});
			} catch (e) {
				// Ignore if sidebar isn't ready
			}

			const summary = await summarizeText(text);
			if (summary) {
				// Mark content as processed
				processedContentHashes.add(contentHash);

				try {
					await chrome.runtime.sendMessage({
						type: "NEW_SUMMARY",
						summary,
						url: location.href,
						title: title,
						elementLink: elementLink, // Include element-specific link
						timestamp: Date.now(),
						contentHash: contentHash, // Include hash for persistent storage
					});
				} catch (e) {
					// Extension context might be invalidated, stop processing
					console.warn(
						"Extension context invalidated, stopping summarization"
					);
					return;
				}
			}
		}
	} catch (e) {
		console.error("Error in checkAndSummarize:", e);
	} finally {
		// Reset stop pending flag after processing
		stopPendingRequested = false;
	}
}

// Listen for settings changes
chrome.storage.onChanged.addListener(async (changes) => {
	if (!chrome.runtime || !chrome.runtime.sendMessage) {
		return; // Extension context invalidated
	}

	let settingsChanged = false;

	if (changes.defaultSummaryType) {
		const validTypes = ["key-points", "headline", "teaser"];
		summaryType = validTypes.includes(changes.defaultSummaryType.newValue)
			? changes.defaultSummaryType.newValue
			: "teaser";
		settingsChanged = true;
	}

	if (changes.autoSnapEnabled) {
		autoSnapEnabled = changes.autoSnapEnabled.newValue;
		settingsChanged = true;

		// Start or stop activity tracking based on new setting
		if (autoSnapEnabled) {
			console.log("Auto-snap enabled via settings change");
			trackUserActivity();
		} else {
			console.log("Auto-snap disabled via settings change");
			clearTimeout(autoSnapTimer);
			autoSnapTimer = null;
		}
	}

	if (changes.autoSnapDuration) {
		autoSnapDuration = parseInt(changes.autoSnapDuration.newValue) || 15;
		settingsChanged = true;

		// Restart timer with new duration if currently active
		if (autoSnapEnabled && pageActivityStartTime) {
			trackUserActivity();
		}
	}

	if (settingsChanged) {
		console.log("Settings updated:", {
			summaryType,
			autoSnapEnabled,
			autoSnapDuration,
		});
	}
});

chrome.runtime.onMessage.addListener((msg) => {
	if (!chrome.runtime || !chrome.runtime.sendMessage) {
		return; // Extension context invalidated
	}

	if (msg.type === "UPDATE_SETTINGS") {
		const validTypes = ["key-points", "headline", "teaser"];
		summaryType = validTypes.includes(msg.summaryType)
			? msg.summaryType
			: "teaser";

		// Update processed content hashes
		if (msg.processedContentHashes) {
			processedContentHashes = new Set(msg.processedContentHashes);
		}
	} else if (msg.type === "START_SUMMARIZATION") {
		// Update settings if provided
		if (msg.summaryType) {
			const validTypes = ["key-points", "headline", "teaser"];
			summaryType = validTypes.includes(msg.summaryType)
				? msg.summaryType
				: "teaser";
		}

		// Update processed content hashes
		if (msg.processedContentHashes) {
			processedContentHashes = new Set(msg.processedContentHashes);
		}

		// Only start summarization if this tab is active/visible. This prevents background tabs
		// from performing expensive summarization work.
		if (document.visibilityState !== "visible" && !msg.forceStart) {
			console.log("START_SUMMARIZATION ignored: tab not active/visible");
			return;
		}

		// Re-enable summarization and trigger manual summarization
		summarizationEnabled = true;
		stopPendingRequested = false;
		checkAndSummarize().catch((e) => {
			console.warn("Manual summarization failed:", e);
		});
	} else if (msg.type === "STOP_PENDING_SUMMARIZATIONS") {
		// Set flag to stop processing pending items
		stopPendingRequested = true;
	} else if (msg.type === "STOP_ALL_SUMMARIZATIONS") {
		// Disable summarization completely
		summarizationEnabled = false;
		stopPendingRequested = true;
	} else if (msg.type === "DISABLE_GENERATION") {
		// Extra explicit disable command from sidebar
		summarizationEnabled = false;
		stopPendingRequested = true;
		console.log("Generation disabled by sidebar");
	} else if (msg.type === "ENABLE_GENERATION") {
		// ENABLE_GENERATION should start summarization at the user's request
		// even if the tab temporarily loses visibility when the sidebar opened.
		summarizationEnabled = true;
		stopPendingRequested = false;
		console.log("Generation enabled by sidebar");
		// Trigger summarization immediately (guarded inside checkAndSummarize)
		checkAndSummarize().catch((e) => {
			console.warn("Enable-triggered summarization failed:", e);
		});
	} else if (msg.type === "SNAP_PAGE_SUMMARY") {
		// Handle page snap - summarize the entire page regardless of generation state
		handlePageSnap(msg.summaryType || "teaser").catch((e) => {
			console.warn("Page snap failed:", e);
		});
	} else if (msg.type === "ADD_SELECTED_TEXT_RAW") {
		// Handle adding selected text directly to digest without summarization
		handleAddSelectedTextRaw(msg.selectedText, msg.url, msg.title).catch(
			(e) => {
				console.warn("Add selected text raw failed:", e);
			}
		);
	} else if (msg.type === "ADD_SELECTED_TEXT_SUMMARIZED") {
		// Handle adding selected text with summarization to digest
		handleAddSelectedTextSummarized(
			msg.selectedText,
			msg.url,
			msg.title
		).catch((e) => {
			console.warn("Add selected text summarized failed:", e);
		});
	} else if (msg.type === "EXPLAIN_SELECTED_TEXT") {
		// Handle explaining selected text
		handleExplainSelectedText(msg.selectedText, msg.url, msg.title).catch(
			(e) => {
				console.warn("Explain selected text failed:", e);
			}
		);
	} else if (msg.type === "SIMPLIFY_SELECTED_TEXT") {
		// Handle simplifying selected text
		handleSimplifySelectedText(msg.selectedText, msg.url, msg.title).catch(
			(e) => {
				console.warn("Simplify selected text failed:", e);
			}
		);
	}
});

window.addEventListener("scroll", () => {
	if (!summarizationEnabled) return; // Skip if summarization is disabled

	clearTimeout(window._sumTimer);
	window._sumTimer = setTimeout(() => {
		checkAndSummarize().catch((e) => {
			console.warn("Scroll summarization failed:", e);
		});
	}, 1000); // Quick response for feed detection
});

// Auto-snap activity tracking
function trackUserActivity() {
	if (!autoSnapEnabled || pageSnapped) return;

	// Reset activity timer on any user interaction
	clearTimeout(autoSnapTimer);

	if (pageActivityStartTime === null) {
		pageActivityStartTime = Date.now();
	}

	// Set timer for auto-snap
	autoSnapTimer = setTimeout(() => {
		performAutoSnap();
	}, autoSnapDuration * 1000);
}

// Track various user activities
document.addEventListener("mousemove", trackUserActivity);
document.addEventListener("scroll", trackUserActivity);
document.addEventListener("keydown", trackUserActivity);
document.addEventListener("click", trackUserActivity);

// Reset auto-snap when page becomes hidden (user switches tabs)
document.addEventListener("visibilitychange", () => {
	if (document.hidden) {
		// Clear timer when user leaves the page
		clearTimeout(autoSnapTimer);
		autoSnapTimer = null;
	} else if (autoSnapEnabled && !pageSnapped && pageActivityStartTime) {
		// Restart timer when user returns (if they were previously active)
		trackUserActivity();
	}
});

// Initial check
if (summarizationEnabled) {
	checkAndSummarize().catch((e) => {
		console.warn("Initial summarization failed:", e);
	});
}

// Initialize content script
initializeContentScript().catch((e) => {
	console.error("Content script initialization failed:", e);
});

// Handle page snap - summarize the entire page
async function handlePageSnap(requestedSummaryType) {
	try {
		// Send to background script for processing
		const response = await chrome.runtime.sendMessage({
			type: "SNAP_PAGE",
			url: location.href,
			title: document.title,
			summaryType: requestedSummaryType,
		});

		if (response && response.success) {
			console.log("Page snap completed successfully");
			return true;
		} else {
			console.error("Page snap failed:", response?.error);
			return false;
		}
	} catch (error) {
		console.error("Error in handlePageSnap:", error);
		return false;
	}
}

// Handle adding selected text directly to digest
async function handleAddSelectedTextRaw(selectedText, url, pageTitle) {
	try {
		// Send to background script for processing
		const response = await chrome.runtime.sendMessage({
			type: "ADD_SELECTED_TEXT_RAW",
			selectedText: selectedText,
			url: url,
			title: pageTitle,
		});

		if (response && response.success) {
			console.log("Selected text added successfully");
			return true;
		} else {
			console.error("Add selected text raw failed:", response?.error);
			return false;
		}
	} catch (error) {
		console.error("Error in handleAddSelectedTextRaw:", error);
		return false;
	}
}

// Handle adding selected text with summarization to digest
async function handleAddSelectedTextSummarized(selectedText, url, pageTitle) {
	try {
		// Send to background script for processing
		const response = await chrome.runtime.sendMessage({
			type: "ADD_SELECTED_TEXT_SUMMARIZED",
			selectedText: selectedText,
			url: url,
			title: pageTitle,
		});

		if (response && response.success) {
			console.log("Selected text summarized successfully");
			return true;
		} else {
			console.error(
				"Add selected text summarized failed:",
				response?.error
			);
			return false;
		}
	} catch (error) {
		console.error("Error in handleAddSelectedTextSummarized:", error);
		return false;
	}
} // Handle explaining selected text
async function handleExplainSelectedText(selectedText, url, pageTitle) {
	try {
		// Send to background script for processing
		const response = await chrome.runtime.sendMessage({
			type: "EXPLAIN_SELECTED_TEXT",
			selectedText: selectedText,
			url: url,
			title: pageTitle,
		});

		if (response && response.success) {
			console.log("Selected text explained successfully");
			return true;
		} else {
			console.error("Explain selected text failed:", response?.error);
			return false;
		}
	} catch (error) {
		console.error("Error in handleExplainSelectedText:", error);
		return false;
	}
}

// Handle simplifying selected text
async function handleSimplifySelectedText(selectedText, url, pageTitle) {
	try {
		// Send to background script for processing
		const response = await chrome.runtime.sendMessage({
			type: "SIMPLIFY_SELECTED_TEXT",
			selectedText: selectedText,
			url: url,
			title: pageTitle,
		});

		if (response && response.success) {
			console.log("Selected text simplified successfully");
			return true;
		} else {
			console.error("Simplify selected text failed:", response?.error);
			return false;
		}
	} catch (error) {
		console.error("Error in handleSimplifySelectedText:", error);
		return false;
	}
}

// Check if current page is appropriate for auto-snap
function isPageAppropriateForAutoSnap() {
	try {
		// Skip login/authentication pages
		const loginKeywords = [
			"login",
			"signin",
			"sign-in",
			"auth",
			"authenticate",
			"password",
			"log-in",
		];
		const url = location.href.toLowerCase();
		const title = document.title.toLowerCase();

		if (
			loginKeywords.some(
				(keyword) => url.includes(keyword) || title.includes(keyword)
			)
		) {
			console.log(
				"Skipping auto-snap: login/authentication page detected"
			);
			return false;
		}

		// Skip very short pages
		const bodyText = document.body.innerText || "";
		const wordCount = bodyText
			.split(/\s+/)
			.filter((word) => word.length > 0).length;

		if (wordCount < 5) {
			console.log(
				"Skipping auto-snap: page too short (less than 100 words)"
			);
			return false;
		}

		/* // Skip pages with mostly non-text content (e.g., image galleries, videos)
		const textToTotalRatio =
			bodyText.length / (document.body.innerHTML.length || 1);
		if (textToTotalRatio < 0.001) {
			console.log(
				"Skipping auto-snap: page appears to be mostly non-text content"
			);
			return false;
		} */

		// Skip error pages
		const errorKeywords = [
			"404",
			"error",
			"not found",
			"server error",
			"maintenance",
		];
		if (errorKeywords.some((keyword) => title.includes(keyword))) {
			console.log("Skipping auto-snap: error page detected");
			return false;
		}

		// Skip file download pages or binary content
		const fileExtensions = [
			".pdf",
			".doc",
			".docx",
			".xls",
			".xlsx",
			".ppt",
			".pptx",
			".zip",
			".rar",
			".exe",
			".dmg",
		];
		if (fileExtensions.some((ext) => url.includes(ext))) {
			console.log("Skipping auto-snap: file download page detected");
			return false;
		}

		return true;
	} catch (error) {
		console.error("Error checking page appropriateness:", error);
		// Default to allowing auto-snap if check fails
		return true;
	}
}

// Perform automatic page snap after user activity threshold
async function performAutoSnap() {
	if (pageSnapped || !autoSnapEnabled) return;

	// Check if page is appropriate for auto-snap
	if (!isPageAppropriateForAutoSnap()) {
		console.log("Auto-snap cancelled: page not appropriate");
		pageSnapped = true; // Mark as snapped to prevent further attempts
		return;
	}

	// Extract page content for deduplication check
	const contentBlocks = extractReadableContent();
	if (!contentBlocks || contentBlocks.length === 0) {
		console.log(
			"Auto-snap cancelled: no content found for deduplication check"
		);
		pageSnapped = true; // Mark as snapped to prevent further attempts
		return;
	}

	// Use the first (most relevant) content block for hashing
	const mainContent = contentBlocks[0];
	const normalizedText = normalizeText(mainContent.text);
	const contentHash = hashString(normalizedText);

	// Check if content already processed
	if (processedContentHashes.has(contentHash)) {
		console.log(
			"Auto-snap cancelled: content already processed (duplicate)"
		);
		pageSnapped = true; // Mark as snapped to prevent further attempts
		return;
	}

	try {
		console.log(
			`Auto-snapping page after ${autoSnapDuration} seconds of activity`
		);

		// Mark page as snapped to prevent multiple snaps
		pageSnapped = true;

		// Send to background script for processing
		const response = await chrome.runtime.sendMessage({
			type: "SNAP_PAGE",
			url: location.href,
			title: document.title,
			summaryType: summaryType,
			isAutoSnap: true, // Flag to indicate this is an automatic snap
		});

		if (response && response.success) {
			console.log("Auto-snap completed successfully");
			// Add content hash to processed set and persist
			processedContentHashes.add(contentHash);
			// Update persistent storage
			try {
				await chrome.runtime.sendMessage({
					type: "UPDATE_PROCESSED_HASHES",
					contentHash: contentHash,
				});
			} catch (e) {
				console.warn("Failed to update persistent hashes:", e);
			}
		} else {
			const errorMsg = response?.error || "Unknown error";
			console.error("Auto-snap failed:", errorMsg);
			// Reset flag on failure so user can try manual snap
			pageSnapped = false;
			// Don't show error notification for auto-snap failures to avoid spam
		}
	} catch (error) {
		console.error("Auto-snap failed:", error);
		// Reset flag on failure so user can try manual snap
		pageSnapped = false;
		// Don't show error notification for auto-snap failures to avoid spam
	}
}
