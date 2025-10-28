// content.js
let summarized = new WeakSet();
let processedContentHashes = new Set(); // Store hashes of processed content
let summaryType = "teaser"; // default
let summarizationEnabled = false; // Control flag for summarization - disabled by default
let stopPendingRequested = false; // Flag to stop pending summarizations

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
			iconUrl: chrome.runtime.getURL("icon.svg"),
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
		// Get existing summaries from storage
		const result = await chrome.storage.sync.get(["summaries"]);
		const summaries = result.summaries || [];

		// Add the new summary
		summaries.push(summaryData);

		// Save back to storage
		await chrome.storage.sync.set({ summaries: summaries });

		console.log("Summary stored locally due to sidebar unavailability");
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
chrome.storage.sync.get(["summaryType"], (result) => {
	const validTypes = ["key-points", "headline", "teaser"];
	summaryType = validTypes.includes(result.summaryType)
		? result.summaryType
		: "teaser";
});

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
chrome.storage.onChanged.addListener((changes) => {
	if (!chrome.runtime || !chrome.runtime.sendMessage) {
		return; // Extension context invalidated
	}

	if (changes.summaryType) {
		summaryType = changes.summaryType.newValue;
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

// Initial check
if (summarizationEnabled) {
	checkAndSummarize().catch((e) => {
		console.warn("Initial summarization failed:", e);
	});
}

// Handle page snap - summarize the entire page
async function handlePageSnap(requestedSummaryType) {
	try {
		// Get the main page content
		const pageContent = extractReadableContent();
		if (pageContent.length === 0) {
			console.warn("No content found for page snap");
			return;
		}

		// Use the first (most relevant) content block
		const mainContent = pageContent[0];
		const normalizedText = normalizeText(mainContent.text);

		// Check if content is substantial enough
		if (normalizedText.length < 100) {
			console.warn("Content too short for page snap");
			return;
		}

		// Create content hash to avoid duplicates
		const contentHash = hashString(normalizedText);

		// Check if already processed
		if (processedContentHashes.has(contentHash)) {
			console.log("Page already snapped");
			return;
		}

		// Extract title and link
		const title =
			extractTitle(mainContent.element) ||
			document.title ||
			"Page Summary";
		const elementLink =
			extractElementLink(mainContent.element) || location.href;

		// Temporarily set summary type for this snap
		const originalSummaryType = summaryType;
		summaryType = requestedSummaryType;

		// Notify sidebar that summarization is starting
		try {
			await chrome.runtime.sendMessage({
				type: "SUMMARIZING_START",
				url: location.href,
				title: `Snapping ${title}...`,
				contentHash: contentHash,
			});
		} catch (e) {
			// Sidebar might not be open, continue anyway
			console.warn("Could not notify sidebar of page snap start:", e);
		}

		// Summarize the content
		const text = normalizedText.slice(0, 2000); // Limit for API
		const summary = await summarizeText(text);

		// Restore original summary type
		summaryType = originalSummaryType;

		if (summary) {
			// Mark as processed
			processedContentHashes.add(contentHash);

			// Send to sidebar
			try {
				await chrome.runtime.sendMessage({
					type: "NEW_SUMMARY",
					summary,
					url: location.href,
					title: title,
					elementLink: elementLink,
					timestamp: Date.now(),
					contentHash: contentHash,
				});

				// Show success notification for snap captured
				await chrome.runtime.sendMessage({
					type: "SHOW_TOAST_NOTIFICATION",
					title: "Page Snapped",
					message: `"${title}" has been added to your digest`,
				});
			} catch (e) {
				console.warn("Could not send page snap to sidebar:", e);
				// Store in local storage as fallback
				storeSummaryLocally({
					summary,
					url: location.href,
					title: title,
					elementLink: elementLink,
					timestamp: Date.now(),
					contentHash: contentHash,
				});
			}
		}
	} catch (e) {
		console.error("Error in handlePageSnap:", e);
	}
}

// Handle adding selected text directly to digest
async function handleAddSelectedTextRaw(selectedText, url, pageTitle) {
	try {
		// Create a unique hash for the selected text
		const contentHash = hashString(selectedText + url + Date.now());

		// Check if already added (less likely for selected text, but good practice)
		if (processedContentHashes.has(contentHash)) {
			console.log("Selected text already added");
			return;
		}

		// Mark as processed to avoid duplicates
		processedContentHashes.add(contentHash);

		// Create a title for the selected text
		const title =
			selectedText.length > 50
				? selectedText.slice(0, 50) + "..."
				: selectedText;

		// Send to sidebar as direct text addition (no summarization)
		try {
			await chrome.runtime.sendMessage({
				type: "NEW_SUMMARY",
				summary: selectedText, // Use the selected text directly
				url: url,
				title: `Selected Text: ${title}`,
				elementLink: url,
				timestamp: Date.now(),
				contentHash: contentHash,
				isSelectedText: true,
				isRawText: true, // Flag to indicate this is raw text
			});
		} catch (e) {
			console.warn("Could not send raw text to sidebar:", e);
			// Store in local storage as fallback
			storeSummaryLocally({
				summary: selectedText,
				url: url,
				title: `Selected Text: ${title}`,
				elementLink: url,
				timestamp: Date.now(),
				contentHash: contentHash,
				isSelectedText: true,
				isRawText: true,
			});
		}
	} catch (e) {
		console.error("Error in handleAddSelectedTextRaw:", e);
	}
}

// Handle adding selected text with summarization to digest
async function handleAddSelectedTextSummarized(selectedText, url, pageTitle) {
	try {
		// Create a unique hash for the selected text
		const contentHash = hashString(selectedText + url + Date.now());

		// Check if already added (less likely for selected text, but good practice)
		if (processedContentHashes.has(contentHash)) {
			console.log("Selected text already added");
			return;
		}

		// Mark as processed to avoid duplicates
		processedContentHashes.add(contentHash);

		// Create a title for the selected text
		const title =
			selectedText.length > 50
				? selectedText.slice(0, 50) + "..."
				: selectedText;

		// Notify sidebar that summarization is starting
		try {
			await chrome.runtime.sendMessage({
				type: "SUMMARIZING_START",
				url: url,
				title: `Summarizing selected text...`,
				contentHash: contentHash,
			});
		} catch (e) {
			// Sidebar might not be open, continue anyway
			console.warn("Could not notify sidebar of summarization start:", e);
		}

		// Summarize the selected text
		const summary = await summarizeText(selectedText.slice(0, 2000)); // Limit for API

		if (summary) {
			// Send to sidebar with summarized text
			try {
				await chrome.runtime.sendMessage({
					type: "NEW_SUMMARY",
					summary: summary,
					url: url,
					title: `Selected Text: ${title}`,
					elementLink: url,
					timestamp: Date.now(),
					contentHash: contentHash,
					isSelectedText: true,
					originalText: selectedText, // Keep original text for reference
				});

				// Show AI insight notification
				await chrome.runtime.sendMessage({
					type: "SHOW_AI_INSIGHT_NOTIFICATION",
					operation: "summarized",
					title: title,
				});
			} catch (e) {
				console.warn("Could not send summary to sidebar:", e);
				// Store in local storage as fallback
				storeSummaryLocally({
					summary: summary,
					url: url,
					title: `Selected Text: ${title}`,
					elementLink: url,
					timestamp: Date.now(),
					contentHash: contentHash,
					isSelectedText: true,
					originalText: selectedText,
				});
			}
		} else {
			// Show error notification instead of adding to digest
			await showErrorNotification(
				"Summarization Failed",
				"Could not summarize the selected text. Please check your AI settings and try again."
			);
		}
	} catch (e) {
		console.error("Error in handleAddSelectedTextSummarized:", e);
	}
}

// Handle explaining selected text
async function handleExplainSelectedText(selectedText, url, pageTitle) {
	try {
		// Create a unique hash for the selected text
		const contentHash = hashString(
			selectedText + url + "explain" + Date.now()
		);

		// Check if already processed
		if (processedContentHashes.has(contentHash)) {
			console.log("Selected text already explained");
			return;
		}

		// Mark as processed to avoid duplicates
		processedContentHashes.add(contentHash);

		// Create a title for the selected text
		const title =
			selectedText.length > 50
				? selectedText.slice(0, 50) + "..."
				: selectedText;

		// Notify sidebar that explanation is starting
		try {
			await chrome.runtime.sendMessage({
				type: "SUMMARIZING_START",
				url: url,
				title: `Explaining selected text...`,
				contentHash: contentHash,
			});
		} catch (e) {
			// Sidebar might not be open, continue anyway
			console.warn("Could not notify sidebar of explanation start:", e);
		}

		// Explain the selected text by sending to background script
		const explanation = await explainText(selectedText.slice(0, 2000)); // Limit for API

		if (explanation) {
			// Send to sidebar with explanation
			try {
				await chrome.runtime.sendMessage({
					type: "NEW_SUMMARY",
					summary: explanation,
					url: url,
					title: `Explanation: ${title}`,
					elementLink: url,
					timestamp: Date.now(),
					contentHash: contentHash,
					isSelectedText: true,
					originalText: selectedText, // Keep original text for reference
					mode: "explain",
				});

				// Show AI insight notification
				await chrome.runtime.sendMessage({
					type: "SHOW_AI_INSIGHT_NOTIFICATION",
					operation: "explained",
					title: title,
				});
			} catch (e) {
				console.warn("Could not send explanation to sidebar:", e);
				// Store in local storage as fallback
				storeSummaryLocally({
					summary: explanation,
					url: url,
					title: `Explanation: ${title}`,
					elementLink: url,
					timestamp: Date.now(),
					contentHash: contentHash,
					isSelectedText: true,
					originalText: selectedText,
					mode: "explain",
				});
			}
		} else {
			// Show error notification instead of adding to digest
			await showErrorNotification(
				"Text Explanation Failed",
				"Could not generate an explanation for the selected text. Please check your AI settings and try again."
			);
		}
	} catch (e) {
		console.error("Error in handleExplainSelectedText:", e);
	}
}

// Handle simplifying selected text
async function handleSimplifySelectedText(selectedText, url, pageTitle) {
	try {
		// Create a unique hash for the selected text
		const contentHash = hashString(
			selectedText + url + "simplify" + Date.now()
		);

		// Check if already processed
		if (processedContentHashes.has(contentHash)) {
			console.log("Selected text already simplified");
			return;
		}

		// Mark as processed to avoid duplicates
		processedContentHashes.add(contentHash);

		// Create a title for the selected text
		const title =
			selectedText.length > 50
				? selectedText.slice(0, 50) + "..."
				: selectedText;

		// Notify sidebar that simplifying is starting
		try {
			await chrome.runtime.sendMessage({
				type: "SUMMARIZING_START",
				url: url,
				title: `Simplifying selected text...`,
				contentHash: contentHash,
			});
		} catch (e) {
			// Sidebar might not be open, continue anyway
			console.warn(
				"Could not notify sidebar of simplification start:",
				e
			);
		}

		// Simplify the selected text by sending to background script
		const simplified = await simplifyText(selectedText.slice(0, 2000)); // Limit for API

		if (simplified) {
			// Send to sidebar with simplified text
			try {
				await chrome.runtime.sendMessage({
					type: "NEW_SUMMARY",
					summary: simplified,
					url: url,
					title: `Simplified: ${title}`,
					elementLink: url,
					timestamp: Date.now(),
					contentHash: contentHash,
					isSelectedText: true,
					originalText: selectedText, // Keep original text for reference
					mode: "simplify",
				});

				// Show AI insight notification
				await chrome.runtime.sendMessage({
					type: "SHOW_AI_INSIGHT_NOTIFICATION",
					operation: "simplified",
					title: title,
				});
			} catch (e) {
				console.warn("Could not send simplified text to sidebar:", e);
				// Store in local storage as fallback
				storeSummaryLocally({
					summary: simplified,
					url: url,
					title: `Simplified: ${title}`,
					elementLink: url,
					timestamp: Date.now(),
					contentHash: contentHash,
					isSelectedText: true,
					originalText: selectedText,
					mode: "simplify",
				});
			}
		} else {
			// Show error notification instead of adding to digest
			await showErrorNotification(
				"Text Simplification Failed",
				"Could not simplify the selected text. Please check your AI settings and try again."
			);
		}
	} catch (e) {
		console.error("Error in handleSimplifySelectedText:", e);
	}
}

// Explain selected text using external API
async function explainText(text) {
	try {
		// Send request to background script to handle API call
		const response = await chrome.runtime.sendMessage({
			type: "EXPLAIN_TEXT",
			text: text,
		});

		if (response && response.success) {
			return response.result;
		} else {
			console.warn("Explanation failed:", response?.error);
			return null;
		}
	} catch (e) {
		console.error("Error in explainText:", e);
		return null;
	}
}

// Simplify selected text using external API
async function simplifyText(text) {
	try {
		// Send request to background script to handle API call
		const response = await chrome.runtime.sendMessage({
			type: "SIMPLIFY_TEXT",
			text: text,
		});

		if (response && response.success) {
			return response.result;
		} else {
			console.warn("Simplify failed:", response?.error);
			return null;
		}
	} catch (e) {
		console.error("Error in simplifyText:", e);
		return null;
	}
}
