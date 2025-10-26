// content.js
let summarized = new WeakSet();
let processedContentHashes = new Set(); // Store hashes of processed content
let summaryType = "key-points"; // default
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

// Helper function to extract link from element (for social media posts, etc.)
function extractElementLink(el) {
	// First, check if the element itself is a link
	if (el.tagName === "A" && el.href) {
		return el.href;
	}

	// Look for links within the element (social media post links, etc.)
	const links = el.querySelectorAll("a[href]");
	for (const link of links) {
		// Prefer links that seem to be the main post/content link
		// Skip navigation, footer, or other non-content links
		const href = link.href;
		if (
			href &&
			!href.includes("#") &&
			!link.closest("nav, footer, header")
		) {
			// For social media, look for post URLs (contain post IDs, etc.)
			if (
				href.includes("/status/") ||
				href.includes("/posts/") ||
				href.includes("/p/") ||
				href.includes("/tweet/")
			) {
				return href;
			}
			// Return the first reasonable link found
			return href;
		}
	}

	// Check closest ancestor link
	const ancestorLink = el.closest("a[href]");
	if (ancestorLink && ancestorLink.href) {
		return ancestorLink.href;
	}

	// Fallback to page URL
	return location.href;
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
		: "key-points";
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
			: "key-points";

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
				: "key-points";
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
