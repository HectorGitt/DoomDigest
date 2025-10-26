chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Create context menu items
chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		id: "snap-page",
		title: "Snap Page",
		contexts: ["page"],
	});

	chrome.contextMenus.create({
		id: "add-to-digest",
		title: "Add to Digest",
		contexts: ["selection"],
	});

	chrome.contextMenus.create({
		id: "summarize-selection",
		title: "Summarize",
		contexts: ["selection"],
	});

	chrome.contextMenus.create({
		id: "rewrite-selection",
		title: "Rewrite",
		contexts: ["selection"],
	});

	chrome.contextMenus.create({
		id: "simplify-selection",
		title: "Simplify",
		contexts: ["selection"],
	});
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId === "snap-page") {
		// Snap the entire page
		chrome.tabs.sendMessage(tab.id, {
			type: "SNAP_PAGE_SUMMARY",
			summaryType: "key-points", // Default to key-points for page snap
		});
	} else if (info.menuItemId === "add-to-digest") {
		// Add selected text to digest without summarization
		const selectedText = info.selectionText;
		if (selectedText && selectedText.trim().length > 0) {
			chrome.tabs.sendMessage(tab.id, {
				type: "ADD_SELECTED_TEXT_RAW",
				selectedText: selectedText.trim(),
				url: tab.url,
				title: tab.title,
			});
		}
	} else if (info.menuItemId === "summarize-selection") {
		// Summarize selected text before adding to digest
		const selectedText = info.selectionText;
		if (selectedText && selectedText.trim().length > 0) {
			chrome.tabs.sendMessage(tab.id, {
				type: "ADD_SELECTED_TEXT_SUMMARIZED",
				selectedText: selectedText.trim(),
				url: tab.url,
				title: tab.title,
			});
		}
	} else if (info.menuItemId === "rewrite-selection") {
		// Rewrite selected text
		const selectedText = info.selectionText;
		if (selectedText && selectedText.trim().length > 0) {
			chrome.tabs.sendMessage(tab.id, {
				type: "REWRITE_SELECTED_TEXT",
				selectedText: selectedText.trim(),
				url: tab.url,
				title: tab.title,
			});
		}
	} else if (info.menuItemId === "simplify-selection") {
		// Simplify selected text
		const selectedText = info.selectionText;
		if (selectedText && selectedText.trim().length > 0) {
			chrome.tabs.sendMessage(tab.id, {
				type: "SIMPLIFY_SELECTED_TEXT",
				selectedText: selectedText.trim(),
				url: tab.url,
				title: tab.title,
			});
		}
	}
});

// Listen for tab changes and notify sidebar
chrome.tabs.onActivated.addListener(async (activeInfo) => {
	try {
		// Notify sidebar to update colors
		chrome.runtime.sendMessage({
			type: "TAB_ACTIVATED",
			tabId: activeInfo.tabId,
		});

		// Note: Removed automatic summarization trigger on tab switch
		// Users can manually start summarization using the sidebar controls
	} catch (error) {
		console.log("Error handling tab activation:", error);
	}
});

// Also listen for tab updates (URL changes)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.status === "complete") {
		// Check if this is the currently active tab
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (tabs[0] && tabs[0].id === tabId) {
				// Notify sidebar to update colors
				chrome.runtime.sendMessage({
					type: "TAB_UPDATED",
					tabId: tabId,
				});

				// Note: Removed automatic summarization trigger on URL change
				// Users can manually start summarization using the sidebar controls
			}
		});
	}
});

// Handle API requests from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.type === "REWRITE_TEXT") {
		handleRewriteText(request.text)
			.then((result) => {
				sendResponse({ success: true, result });
			})
			.catch((error) => {
				console.error("Rewrite text error:", error);
				sendResponse({ success: false, error: error.message });
			});
		return true; // Keep message channel open for async response
	} else if (request.type === "SIMPLIFY_TEXT") {
		handleSimplifyText(request.text)
			.then((result) => {
				sendResponse({ success: true, result });
			})
			.catch((error) => {
				console.error("Simplify text error:", error);
				sendResponse({ success: false, error: error.message });
			});
		return true; // Keep message channel open for async response
	} else if (request.type === "GET_SUMMARIES_FOR_EXPORT") {
		// Handle export request from settings page
		chrome.storage.sync.get(["summaries"], (result) => {
			sendResponse({
				summaries: result.summaries || [],
			});
		});
		return true; // Keep message channel open for async response
	}
});

// Rewrite text using the Rewriter API
async function handleRewriteText(text) {
	try {
		// Get API provider settings
		const settings = await chrome.storage.sync.get([
			"apiProvider",
			"geminiApiKey",
		]);

		const provider = settings.apiProvider || "chrome-ai";

		// Always use Rewriter API for rewrite functionality
		if (provider === "gemini") {
			// For Gemini, use a rewrite-style prompt
			return await rewriteWithGemini(text);
		} else {
			// For Chrome AI or other providers, use the Rewriter API
			return await rewriteWithRewriterAPI(text);
		}
	} catch (error) {
		console.error("Error in handleRewriteText:", error);
		throw error;
	}
}

// Simplify text using the selected API provider
async function handleSimplifyText(text) {
	try {
		// Get API provider settings
		const settings = await chrome.storage.sync.get([
			"apiProvider",
			"geminiApiKey",
		]);

		const provider = settings.apiProvider || "chrome-ai";

		if (provider === "chrome-ai") {
			// For Chrome AI, we'll use a different approach since it doesn't support custom prompts
			// Fall back to a basic simplification or use available built-in APIs
			if (settings.geminiApiKey) {
				return await simplifyWithGemini(text, settings.geminiApiKey);
			} else if ("ai" in self && "writer" in self.ai) {
				return await simplifyWithRewriterAPI(text);
			} else if ("ai" in self && "languageModel" in self.ai) {
				return await simplifyWithPromptAPI(text);
			} else {
				// Return a fallback message
				return `Simplified: ${text}\n\n(Note: Chrome AI doesn't support custom prompts. Please configure Gemini API or ensure your browser supports built-in AI APIs for better simplifications.)`;
			}
		} else if (provider === "gemini") {
			if (!settings.geminiApiKey) {
				throw new Error("Gemini API key not configured");
			}
			return await simplifyWithGemini(text, settings.geminiApiKey);
		} else if (provider === "promptapi") {
			return await simplifyWithPromptAPI(text);
		} else if (provider === "rewriterapi") {
			return await simplifyWithRewriterAPI(text);
		} else {
			throw new Error("Unknown API provider");
		}
	} catch (error) {
		console.error("Error in handleSimplifyText:", error);
		throw error;
	}
}

// Rewrite text using Gemini API
async function rewriteWithGemini(text) {
	try {
		const { GoogleGenerativeAI } = await import("@google/generative-ai");

		const apiKey = await getGeminiApiKey();
		if (!apiKey) {
			throw new Error("Gemini API key not configured");
		}

		const genAI = new GoogleGenerativeAI(apiKey);
		const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

		const prompt = `Please rewrite the following text using different words and sentence structure while maintaining the original meaning and key information. Keep the same level of formality and tone:

${text}

Rewritten version:`;

		const result = await model.generateContent(prompt);
		const response = await result.response;
		const rewrittenText = response.text().trim();

		return rewrittenText;
	} catch (error) {
		console.error("Gemini rewrite failed:", error);
		throw new Error(`Gemini rewrite failed: ${error.message}`);
	}
}

// Simplify text using Gemini API
async function simplifyWithGemini(text, apiKey) {
	const { GoogleGenerativeAI } = await import("@google/generative-ai");

	const genAI = new GoogleGenerativeAI(apiKey);
	const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

	const prompt = `Please simplify the following text. Use simpler words and shorter sentences. Make it easier to understand while keeping the main ideas:\n\n${text}`;

	const result = await model.generateContent(prompt);
	const response = await result.response;
	return response.text();
}

// Simplify text using PromptAPI (Gemini Nano in browser)
async function simplifyWithPromptAPI(text) {
	// PromptAPI uses Chrome's built-in Prompt API with Gemini Nano
	if (!("ai" in self) || !("languageModel" in self.ai)) {
		throw new Error(
			"PromptAPI (Language Model API) not supported in this browser"
		);
	}

	try {
		const capabilities = await self.ai.languageModel.capabilities();
		if (capabilities.available === "no") {
			throw new Error("Language Model API is not available");
		}

		const languageModel = await self.ai.languageModel.create({
			initialPrompts: [
				{
					role: "system",
					content:
						"You are an expert at simplifying complex text. Use simpler words and shorter sentences while keeping the main ideas.",
				},
			],
		});

		const prompt = `Please simplify the following text. Use easier words and shorter sentences. Make it easier to understand while keeping the main ideas:\n\n${text}`;
		const result = await languageModel.prompt(prompt);

		return result;
	} catch (error) {
		console.error("PromptAPI simplification failed:", error);
		throw new Error(`PromptAPI simplification failed: ${error.message}`);
	}
}

// Get Gemini API key from storage
async function getGeminiApiKey() {
	try {
		const result = await chrome.storage.sync.get(["geminiApiKey"]);
		return result.geminiApiKey;
	} catch (error) {
		console.error("Error getting Gemini API key:", error);
		return null;
	}
}

// Rewrite text using RewriterApi (Chrome Writer API)
async function rewriteWithRewriterAPI(text) {
	try {
		// Check Rewriter API availability
		if (typeof Rewriter === "undefined" || !Rewriter.availability) {
			throw new Error("Rewriter API not available in this browser");
		}

		const available = await Rewriter.availability();
		if (available !== "available") {
			throw new Error(
				"Rewriter API model not downloaded. Please enable AI features in Chrome settings to download the model."
			);
		}

		const writer = await Rewriter.create({
			sharedContext:
				"You are an expert at rewriting text in different ways while maintaining the original meaning.",
			tone: "as-is",
			format: "plain-text",
			length: "as-is",
		});

		const stream = await writer.rewrite(text, {
			context:
				"Please rewrite this text using different words and sentence structure while keeping the same meaning and key information.",
		});

		return await stream;
	} catch (error) {
		console.error("RewriterApi rewrite failed:", error);
		throw new Error(`RewriterApi rewrite failed: ${error.message}`);
	}
}

// Simplify text using RewriterApi (Chrome Writer API)
async function simplifyWithRewriterAPI(text) {
	try {
		// Check Rewriter API availability
		if (typeof Rewriter === "undefined" || !Rewriter.availability) {
			throw new Error("Rewriter API not available in this browser");
		}

		const available = await Rewriter.availability();
		if (available !== "available") {
			throw new Error(
				"Rewriter API model not downloaded. Please enable AI features in Chrome settings to download the model."
			);
		}

		const writer = await Rewriter.create({
			sharedContext: "You are an expert at simplifying complex text.",
			tone: "more-casual",
			format: "plain-text",
			length: "as-is",
		});

		const stream = await writer.rewrite(text, {
			context:
				"Please simplify this text using easier words and shorter sentences.",
		});

		return await stream;
	} catch (error) {
		console.error("RewriterApi simplification failed:", error);
		throw new Error(`RewriterApi simplification failed: ${error.message}`);
	}
}
