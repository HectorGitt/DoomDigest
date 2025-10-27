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
		// Notify sidebar to update colors (only if sidebar is open)
		chrome.runtime
			.sendMessage({
				type: "TAB_ACTIVATED",
				tabId: activeInfo.tabId,
			})
			.catch(() => {
				// Ignore errors when sidebar is not open
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
				// Notify sidebar to update colors (only if sidebar is open)
				chrome.runtime
					.sendMessage({
						type: "TAB_UPDATED",
						tabId: tabId,
					})
					.catch(() => {
						// Ignore errors when sidebar is not open
					});

				// Note: Removed automatic summarization trigger on URL change
				// Users can manually start summarization using the sidebar controls
			}
		});
	}
});

// Handle API requests from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.type === "SIMPLIFY_TEXT") {
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
	} else if (request.type === "REMOVE_GOOGLE_DRIVE") {
		// Handle Google Drive remove request from settings page
		handleGoogleDriveRemove()
			.then((result) => {
				sendResponse(result);
			})
			.catch((error) => {
				console.error("Google Drive remove error:", error);
				sendResponse({ success: false, error: error.message });
			});
		return true;
	} else if (request.type === "SET_AUTO_SYNC_ALARM") {
		// Handle setting up auto-sync alarm
		chrome.alarms.create(request.alarmInfo.name, {
			delayInMinutes: request.alarmInfo.delayInMinutes,
			periodInMinutes: request.alarmInfo.periodInMinutes,
		});
		return true;
	} else if (request.type === "CLEAR_AUTO_SYNC_ALARM") {
		// Handle clearing auto-sync alarm
		chrome.alarms.clear("autoSync");
		return true;
	}
});

// Restore auto-sync alarm on startup
chrome.storage.sync.get(["autoSyncFrequency"], (result) => {
	const frequency = result.autoSyncFrequency;
	if (frequency && frequency !== "disabled") {
		// Recreate the alarm based on saved frequency
		let alarmInfo;
		switch (frequency) {
			case "minute":
				alarmInfo = {
					name: "autoSync",
					delayInMinutes: 1,
					periodInMinutes: 1,
				};
				break;
			case "weekly":
				alarmInfo = {
					name: "autoSync",
					delayInMinutes: 7 * 24 * 60,
					periodInMinutes: 7 * 24 * 60,
				};
				break;
			case "monthly":
				alarmInfo = {
					name: "autoSync",
					delayInMinutes: 30 * 24 * 60,
					periodInMinutes: 30 * 24 * 60,
				};
				break;
		}
		if (alarmInfo) {
			chrome.alarms.create(alarmInfo.name, {
				delayInMinutes: alarmInfo.delayInMinutes,
				periodInMinutes: alarmInfo.periodInMinutes,
			});
			console.log(`Restored ${frequency} auto-sync alarm`);
		}
	}
});

// Handle alarm triggers for auto-sync
chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name === "autoSync") {
		try {
			console.log("Auto-sync alarm triggered, starting sync...");

			// Get summaries from storage
			const result = await chrome.storage.sync.get(["summaries"]);
			const summaries = result.summaries || [];

			if (summaries.length === 0) {
				console.log("No summaries to sync");
				return;
			}

			// Check if Google Drive is connected
			const settings = await chrome.storage.sync.get([
				"googleDriveConnected",
			]);
			if (!settings.googleDriveConnected) {
				console.log("Google Drive not connected, skipping auto-sync");
				return;
			}

			// Perform the sync
			const syncResult = await handleGoogleDriveSync(summaries);

			if (syncResult.success) {
				console.log(
					"Auto-sync completed successfully:",
					syncResult.message
				);
			} else {
				console.error("Auto-sync failed:", syncResult.error);
			}
		} catch (error) {
			console.error("Auto-sync error:", error);
		}
	}
});

// Simplify text using the Rewriter API
async function handleSimplifyText(text) {
	try {
		// Get API provider settings
		const settings = await chrome.storage.sync.get([
			"apiProvider",
			"geminiApiKey",
			"geminiApiTested",
		]);

		const provider = settings.apiProvider || "chrome-ai";

		// Try Chrome AI Rewriter first if Chrome AI is selected
		if (provider === "chrome-ai") {
			try {
				if ("Rewriter" in self) {
					const rewriter = await Rewriter.create({
						tone: "as-is",
						format: "plain-text",
						length: "as-is",
					});

					const result = await rewriter.rewrite(text);
					return result;
				}
			} catch (error) {
				console.warn(
					"Chrome AI Rewriter failed, falling back to Gemini:",
					error
				);
			}
		}

		// Fallback to Gemini if available
		if (settings.geminiApiTested && settings.geminiApiKey) {
			return await simplifyWithGemini(text);
		}

		if (provider === "gemini" && settings.geminiApiKey) {
			return await simplifyWithGemini(text);
		}

		// If no API is available, return original text with note
		return `${text}\n\n(Note: Text simplification requires Chrome AI or Gemini API configuration.)`;
	} catch (error) {
		console.error("Error in handleSimplifyText:", error);
		throw error;
	}
}

// Simplify text using Gemini API
async function simplifyWithGemini(text) {
	try {
		const apiKey = await getGeminiApiKey();
		if (!apiKey) {
			throw new Error("Gemini API key not configured");
		}

		const genAI = new GoogleGenerativeAI(apiKey);
		const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

		const prompt = `Please simplify the following text by making it easier to understand while maintaining the original meaning and key information. Use simpler words and shorter sentences where appropriate, but keep the same level of formality and tone:

${text}

Simplified version:`;

		const result = await model.generateContent(prompt);
		const response = await result.response;
		const simplifiedText = response.text().trim();

		return simplifiedText;
	} catch (error) {
		console.error("Gemini simplify failed:", error);
		throw new Error(`Gemini simplify failed: ${error.message}`);
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

// Handle Google Drive remove
async function handleGoogleDriveRemove() {
	try {
		// Get the current auth token to remove it from cache
		const token = await new Promise((resolve, reject) => {
			chrome.identity.getAuthToken({ interactive: false }, (token) => {
				if (chrome.runtime.lastError) {
					// If there's no cached token, that's fine - consider it already removed
					resolve(null);
				} else {
					resolve(token);
				}
			});
		});

		// If we have a token, remove it from cache
		if (token) {
			await new Promise((resolve, reject) => {
				chrome.identity.removeCachedAuthToken({ token: token }, () => {
					if (chrome.runtime.lastError) {
						reject(chrome.runtime.lastError);
					} else {
						resolve();
					}
				});
			});
		}

		return {
			success: true,
			message: "Successfully disconnected from Google Drive!",
		};
	} catch (error) {
		console.error("Google Drive remove failed:", error);
		return { success: false, error: error.message };
	}
}

async function syncSummariesToDrive(token, summaries) {
	const fileName = `DoomDigest-${new Date().toISOString().split("T")[0]}.md`;
	const markdownContent = createMarkdownContent(summaries);

	try {
		// Step 1: Create the file metadata
		const metadata = {
			name: fileName,
			mimeType: "text/markdown",
			description: "DoomDigest export - AI-powered article summaries",
		};

		// Step 2: Upload the file using Google Drive API multipart upload
		const response = await fetch(
			"https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "multipart/related; boundary=boundary123",
				},
				body: createMultipartBody(metadata, markdownContent),
			}
		);

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(
				`Drive API error: ${response.status} - ${
					errorData.error?.message || "Unknown error"
				}`
			);
		}

		const result = await response.json();
		console.log("File created successfully:", result);

		return {
			success: true,
			fileId: result.id,
			fileUrl: `https://drive.google.com/file/d/${result.id}/view`,
			message: `Successfully uploaded to Google Drive: ${fileName}`,
		};
	} catch (error) {
		console.error("Direct Drive API call failed:", error);
		throw error;
	}
}

// Helper function to create multipart body for Drive API
function createMultipartBody(metadata, content) {
	const boundary = "boundary123";
	const delimiter = `\r\n--${boundary}\r\n`;
	const closeDelimiter = `\r\n--${boundary}--`;

	const metadataPart =
		delimiter +
		"Content-Type: application/json; charset=UTF-8\r\n\r\n" +
		JSON.stringify(metadata);

	const contentPart =
		delimiter + "Content-Type: text/markdown\r\n\r\n" + content;

	return metadataPart + contentPart + closeDelimiter;
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
