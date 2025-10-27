import { GoogleGenerativeAI } from "@google/generative-ai";

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
	} else if (request.type === "GET_SUMMARIES_FOR_EXPORT") {
		// Handle export request from settings page
		chrome.storage.sync.get(["summaries"], (result) => {
			sendResponse({
				summaries: result.summaries || [],
			});
		});
		return true; // Keep message channel open for async response
	} else if (request.type === "SYNC_TO_GOOGLE_DRIVE") {
		// Handle Google Drive sync request from settings page
		handleGoogleDriveSync(request.summaries)
			.then((result) => {
				sendResponse(result);
			})
			.catch((error) => {
				console.error("Google Drive sync error:", error);
				sendResponse({ success: false, error: error.message });
			});
		return true; // Keep message channel open for async response
	} else if (request.type === "CONNECT_GOOGLE_DRIVE") {
		// Handle Google Drive connect request from settings page
		handleGoogleDriveConnect()
			.then((result) => {
				sendResponse(result);
			})
			.catch((error) => {
				console.error("Google Drive connect error:", error);
				sendResponse({ success: false, error: error.message });
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
			"geminiApiTested",
		]);

		// Prioritize Gemini if it has been tested successfully
		if (settings.geminiApiTested && settings.geminiApiKey) {
			return await rewriteWithGemini(text);
		}

		const provider = settings.apiProvider || "chrome-ai";

		// For rewrite, always use Gemini if available, otherwise return original text
		if (provider === "gemini" && settings.geminiApiKey) {
			return await rewriteWithGemini(text);
		} else {
			// For Chrome AI without Gemini, return original text with note
			return `${text}\n\n(Note: Text rewriting requires Gemini API configuration.)`;
		}
	} catch (error) {
		console.error("Error in handleRewriteText:", error);
		throw error;
	}
}

// Rewrite text using Gemini API
async function rewriteWithGemini(text) {
	try {
		const apiKey = await getGeminiApiKey();
		if (!apiKey) {
			throw new Error("Gemini API key not configured");
		}

		const genAI = new GoogleGenerativeAI(apiKey);
		const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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

// Handle Google Drive sync
async function handleGoogleDriveSync(summaries) {
	try {
		// Get auth token - use interactive mode to prompt for auth if needed
		const token = await new Promise((resolve, reject) => {
			chrome.identity.getAuthToken({ interactive: true }, (token) => {
				if (chrome.runtime.lastError) {
					reject(chrome.runtime.lastError);
				} else {
					resolve(token);
				}
			});
		});

		// Sync summaries to Google Drive
		await syncSummariesToDrive(token, summaries);

		return {
			success: true,
			message: "Successfully synced digest to Google Drive!",
		};
	} catch (error) {
		console.error("Google Drive sync failed:", error);

		// Provide more specific error messages
		let errorMessage = error.message;
		if (error.message.includes("-100")) {
			errorMessage =
				"Network connection failed. Please check your internet connection and try again.";
		} else if (error.message.includes("access_denied")) {
			errorMessage =
				"Access denied. Please reconnect to Google Drive and grant permissions.";
		} else if (error.message.includes("invalid_grant")) {
			errorMessage =
				"Authentication expired. Please reconnect to Google Drive.";
		} else if (error.message.includes("403")) {
			errorMessage =
				"Permission denied. Please check that you have access to create files in Drive.";
		}

		return { success: false, error: errorMessage };
	}
}

// Handle Google Drive connect
async function handleGoogleDriveConnect() {
	try {
		// Get auth token - use interactive mode to prompt for auth
		const token = await new Promise((resolve, reject) => {
			chrome.identity.getAuthToken({ interactive: true }, (token) => {
				if (chrome.runtime.lastError) {
					reject(chrome.runtime.lastError);
				} else {
					resolve(token);
				}
			});
		});

		// Test the token by making a simple API call
		const testResponse = await fetch(
			"https://www.googleapis.com/drive/v3/files?pageSize=1",
			{
				headers: {
					Authorization: `Bearer ${token}`,
				},
			}
		);

		if (!testResponse.ok) {
			throw new Error(`Token validation failed: ${testResponse.status}`);
		}

		return {
			success: true,
			message: "Successfully connected to Google Drive!",
		};
	} catch (error) {
		console.error("Google Drive connect failed:", error);

		// Provide more specific error messages
		let errorMessage = error.message;
		if (error.message.includes("-100")) {
			errorMessage =
				"Network connection failed. Please check your internet connection and try again.";
		} else if (error.message.includes("access_denied")) {
			errorMessage =
				"Access denied. Please grant the necessary permissions and try again.";
		} else if (error.message.includes("invalid_client")) {
			errorMessage =
				"Invalid client configuration. Please check the OAuth setup in manifest.json.";
		}

		return { success: false, error: errorMessage };
	}
}

async function syncSummariesToDrive(token, summaries) {
	const fileName = `DoomDigest-${new Date().toISOString().split("T")[0]}.md`;
	const markdownContent = createMarkdownContent(summaries);

	try {
		const response = await fetch(
			"https://digest-store-850708581112.us-central1.run.app",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					fileName: fileName,
					content: markdownContent,
				}),
			}
		);

		if (!response.ok) {
			throw new Error(`Cloud function error: ${response.status}`);
		}

		const result = await response.json();
		return result;
	} catch (error) {
		console.error("Cloud function call failed:", error);
		throw error;
	}
}

function createMarkdownContent(summaries) {
	let content = `# DoomDigest Export\n\n`;
	content += `*Generated on ${new Date().toLocaleString()}*\n\n`;
	content += `---\n\n`;

	summaries.forEach((summary, index) => {
		content += `## ${index + 1}. ${summary.title}\n\n`;
		content += `**URL:** ${summary.url}\n\n`;
		content += `**Time:** ${new Date(
			summary.timestamp
		).toLocaleString()}\n\n`;
		content += `${summary.summary}\n\n`;
		content += `---\n\n`;
	});

	return content;
}
