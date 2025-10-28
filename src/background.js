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
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	try {
		// Open the sidebar first to ensure it's ready to receive messages
		await chrome.sidePanel.open({ tabId: tab.id });

		// Small delay to ensure sidebar is fully loaded
		await new Promise((resolve) => setTimeout(resolve, 100));

		if (info.menuItemId === "snap-page") {
			// Snap the entire page
			chrome.tabs.sendMessage(tab.id, {
				type: "SNAP_PAGE_SUMMARY",
				summaryType: "teaser", // Default to teaser for page snap
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
	} catch (error) {
		console.error("Error handling context menu click:", error);
		// Fallback: try to send message anyway in case sidebar was already open
		try {
			if (info.menuItemId === "snap-page") {
				chrome.tabs.sendMessage(tab.id, {
					type: "SNAP_PAGE_SUMMARY",
					summaryType: "teaser",
				});
			} else if (info.menuItemId === "add-to-digest") {
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
		} catch (fallbackError) {
			console.error(
				"Fallback context menu handling also failed:",
				fallbackError
			);
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
	} else if (request.type === "SHOW_TOAST_NOTIFICATION") {
		// Handle toast notification requests
		showToastNotification(request.title, request.message);
		return true;
	} else if (request.type === "SHOW_AI_INSIGHT_NOTIFICATION") {
		// Handle AI insight notification
		showAiInsightNotification(request.operation, request.title);
		return true;
	} else if (request.type === "GENERATE_ANALYTICS") {
		// Handle analytics generation request from settings page
		handleGenerateAnalytics(request.summaries)
			.then((analytics) => {
				sendResponse({ success: true, analytics: analytics });
			})
			.catch((error) => {
				console.error("Analytics generation error:", error);
				sendResponse({ success: false, error: error.message });
			});
		return true; // Keep message channel open for async response
	} else if (request.type === "GENERATE_CUSTOM_ANALYTICS") {
		// Handle custom analytics generation request from analytics page
		handleGenerateCustomAnalytics(request.summaries, request.customization)
			.then((analytics) => {
				sendResponse({ success: true, analytics: analytics });
			})
			.catch((error) => {
				console.error("Custom analytics generation error:", error);
				sendResponse({ success: false, error: error.message });
			});
		return true; // Keep message channel open for async response
	}
});
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

			// Perform the sync (handleGoogleDriveSync handles badge setting)
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
			// Clear badge on error
			await setSyncBadge(false);
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

// Handle custom analytics generation
async function handleGenerateCustomAnalytics(summaries, customization) {
	try {
		// Get API provider settings
		const settings = await chrome.storage.sync.get([
			"apiProvider",
			"geminiApiKey",
			"geminiApiTested",
		]);

		const provider = settings.apiProvider || "chrome-ai";

		// Try Chrome AI Prompt API first if Chrome AI is selected
		if (provider === "chrome-ai") {
			try {
				if ("LanguageModel" in self) {
					const session = await LanguageModel.create({
						monitor(m) {
							m.addEventListener("downloadprogress", (e) => {
								console.log(`Downloaded ${e.loaded * 100}%`);
							});
						},
					});

					const promptText = createCustomAnalyticsPrompt(
						summaries,
						customization
					);
					const result = await session.prompt(promptText);

					return result;
				}
			} catch (error) {
				console.warn(
					"Chrome AI Prompt API failed, falling back to Gemini:",
					error
				);
			}
		}

		// Fallback to Gemini if available
		if (settings.geminiApiTested && settings.geminiApiKey) {
			return await generateCustomAnalyticsWithGemini(
				summaries,
				customization
			);
		}

		if (provider === "gemini" && settings.geminiApiKey) {
			return await generateCustomAnalyticsWithGemini(
				summaries,
				customization
			);
		}

		// If no API is available, return error message
		throw new Error(
			"Analytics generation requires Chrome AI or Gemini API configuration."
		);
	} catch (error) {
		console.error("Error in handleGenerateCustomAnalytics:", error);
		throw error;
	}
}

// Create custom analytics prompt from summaries and customization options
function createCustomAnalyticsPrompt(summaries, customization) {
	const summariesText = summaries
		.map((s, i) => `${i + 1}. ${s.title}: ${s.summary}`)
		.join("\n\n");

	// Build focus areas text with DoomDigest-specific context
	const focusAreasText =
		customization.focusAreas.length > 0
			? `Focus on these areas: ${customization.focusAreas.join(", ")}`
			: "";

	// Build depth instruction with productivity context
	let depthInstruction = "";
	switch (customization.depth) {
		case "brief":
			depthInstruction =
				"Provide a brief productivity overview with 2-3 key insights about your content consumption habits";
			break;
		case "standard":
			depthInstruction =
				"Provide a comprehensive analysis of your reading patterns and productivity insights";
			break;
		case "detailed":
			depthInstruction =
				"Provide an in-depth analysis with extensive details about content consumption, learning patterns, and productivity recommendations";
			break;
		case "comprehensive":
			depthInstruction =
				"Provide a complete productivity report covering all aspects of your content consumption journey";
			break;
		default:
			depthInstruction =
				"Provide a comprehensive analysis of your reading patterns and productivity insights";
	}

	// Build format instruction
	let formatInstruction = "";
	switch (customization.format) {
		case "structured":
			formatInstruction =
				"Use clear headings, bullet points, and numbered lists for easy reading and actionable insights";
			break;
		case "narrative":
			formatInstruction =
				"Present as a flowing narrative that tells the story of your content consumption journey";
			break;
		case "bullet-points":
			formatInstruction =
				"Use bullet points and short paragraphs throughout for quick scanning and productivity tips";
			break;
		case "executive":
			formatInstruction =
				"Present as an executive summary with key metrics, insights, and actionable recommendations for productivity improvement";
			break;
		default:
			formatInstruction =
				"Use clear headings, bullet points, and numbered lists for easy reading and actionable insights";
	}

	// Build custom instructions
	const customInstructions = customization.customInstructions
		? `\n\nAdditional Instructions: ${customization.customInstructions}`
		: "";

	return `You are analyzing article summaries from DoomDigest, a tool designed to help users consume content more productively and efficiently. Your goal is to provide actionable insights that help users improve their reading habits, knowledge acquisition, and productivity.

${depthInstruction}. ${focusAreasText}

${formatInstruction}.

As a productivity-focused analytics tool, focus on:
- How users can optimize their content consumption
- Patterns in reading habits that indicate productivity levels
- Quality assessment of content sources and topics
- Recommendations for better content discovery and curation
- Insights about knowledge gaps and learning opportunities
- Time management and efficiency suggestions
- Personal growth and development through better content consumption

Article Summaries from DoomDigest:
${summariesText}${customInstructions}

Please provide your productivity-focused analysis:`;
}

// Generate custom analytics using Gemini API
async function generateCustomAnalyticsWithGemini(summaries, customization) {
	try {
		const apiKey = await getGeminiApiKey();
		if (!apiKey) {
			throw new Error("Gemini API key not configured");
		}

		const genAI = new GoogleGenerativeAI(apiKey);
		const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

		const prompt = createCustomAnalyticsPrompt(summaries, customization);
		const result = await model.generateContent(prompt);
		const response = await result.response;
		const analytics = response.text().trim();

		return analytics;
	} catch (error) {
		console.error("Gemini custom analytics failed:", error);
		throw new Error(`Gemini analytics failed: ${error.message}`);
	}
}

// Handle Google Drive sync
async function handleGoogleDriveSync(summaries) {
	const syncStartTime = Date.now();

	try {
		// Set badge to indicate sync is running
		await setSyncBadge(true);

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

		// Calculate sync duration
		const syncEndTime = Date.now();
		const syncDuration = syncEndTime - syncStartTime;

		// Store last sync information
		await chrome.storage.sync.set({
			lastSyncTime: syncEndTime,
			lastSyncDuration: syncDuration,
		});

		// Clear badge on success
		await setSyncBadge(false);

		return {
			success: true,
			message: `Successfully synced digest to Google Drive in ${formatDuration(
				syncDuration
			)}!`,
			duration: syncDuration,
		};
	} catch (error) {
		console.error("Google Drive sync failed:", error);

		// Calculate sync duration even on failure
		const syncEndTime = Date.now();
		const syncDuration = syncEndTime - syncStartTime;

		// Store last sync information (even failed syncs)
		await chrome.storage.sync.set({
			lastSyncTime: syncEndTime,
			lastSyncDuration: syncDuration,
			lastSyncFailed: true,
		});

		// Clear badge on error
		await setSyncBadge(false);

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

		return { success: false, error: errorMessage, duration: syncDuration };
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
	const markdownContent = await createMarkdownContent(summaries);

	try {
		// Step 1: Create or find the DoomDigest folder
		const folderId = await createOrFindDoomDigestFolder(token);

		// Step 2: Create the file metadata with parent folder
		const metadata = {
			name: fileName,
			mimeType: "text/markdown",
			description: "DoomDigest export - AI-powered article summaries",
			parents: [folderId], // Specify the parent folder
		};

		// Step 3: Upload the file using Google Drive API multipart upload
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
		console.log("File created successfully in DoomDigest folder:", result);

		return {
			success: true,
			fileId: result.id,
			fileUrl: `https://drive.google.com/file/d/${result.id}/view`,
			folderId: folderId,
			message: `Successfully uploaded to Google Drive: ${fileName}`,
		};
	} catch (error) {
		console.error("Direct Drive API call failed:", error);
		throw error;
	}
}

// Helper function to create or find DoomDigest folder
async function createOrFindDoomDigestFolder(token) {
	const folderName = "DoomDigest";

	try {
		// First, try to find existing folder
		const searchResponse = await fetch(
			`https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
			{
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`,
				},
			}
		);

		if (!searchResponse.ok) {
			throw new Error(`Search failed: ${searchResponse.status}`);
		}

		const searchResult = await searchResponse.json();

		// If folder exists, return its ID
		if (searchResult.files && searchResult.files.length > 0) {
			console.log(
				"Found existing DoomDigest folder:",
				searchResult.files[0].id
			);
			return searchResult.files[0].id;
		}

		// If folder doesn't exist, create it
		console.log("Creating new DoomDigest folder...");
		const createResponse = await fetch(
			"https://www.googleapis.com/drive/v3/files",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					name: folderName,
					mimeType: "application/vnd.google-apps.folder",
				}),
			}
		);

		if (!createResponse.ok) {
			const errorData = await createResponse.json();
			throw new Error(
				`Folder creation failed: ${createResponse.status} - ${
					errorData.error?.message || "Unknown error"
				}`
			);
		}

		const createResult = await createResponse.json();
		console.log("Created DoomDigest folder:", createResult.id);
		return createResult.id;
	} catch (error) {
		console.error("Error creating/finding DoomDigest folder:", error);
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

async function createMarkdownContent(summaries) {
	let content = `# DoomDigest Export\n\n`;
	content += `*Generated on ${new Date().toLocaleString()}*\n\n`;

	// Add sync information if available
	const syncInfo = await chrome.storage.sync.get([
		"lastSyncTime",
		"lastSyncDuration",
	]);
	if (syncInfo.lastSyncTime) {
		const syncDate = new Date(syncInfo.lastSyncTime).toLocaleString();
		const syncDuration = syncInfo.lastSyncDuration
			? formatDuration(syncInfo.lastSyncDuration)
			: "Unknown";
		content += `*Last synced to Google Drive: ${syncDate} (took ${syncDuration})*\n\n`;
	}

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

// Notification utility functions
async function showToastNotification(title, message) {
	try {
		// Check if notifications are enabled
		const settings = await chrome.storage.sync.get([
			"enableExportNotifications",
			"enableAiNotifications",
		]);
		const exportEnabled = settings.enableExportNotifications !== false;
		const aiEnabled = settings.enableAiNotifications !== false;

		// For now, show toast notifications for export success and snap captured
		// AI notifications will be handled separately
		if (
			(title.includes("Export") && exportEnabled) ||
			title.includes("Snapped")
		) {
			await chrome.notifications.create({
				type: "basic",
				iconUrl: "icon.svg",
				title: title,
				message: message,
				silent: true, // Toast-style notification
			});
		}
	} catch (error) {
		console.error("Failed to show toast notification:", error);
	}
}

async function showExportFailureNotification(format) {
	try {
		// Check if notifications are enabled
		const settings = await chrome.storage.sync.get([
			"enableExportNotifications",
		]);
		if (settings.enableExportNotifications === false) {
			return; // User disabled export notifications
		}

		const notificationId = await chrome.notifications.create({
			type: "basic",
			iconUrl: "icon.svg",
			title: "Export Failed",
			message: `Failed to export digest as ${format.toUpperCase()}. Click to retry.`,
			requireInteraction: true, // Full notification that stays until dismissed
			buttons: [{ title: "Retry Export" }],
		});

		// Store the format for retry
		exportRetryData = { format, notificationId };
	} catch (error) {
		console.error("Failed to show export failure notification:", error);
	}
}

// Show AI insight notification
async function showAiInsightNotification(operation, title) {
	try {
		// Check if AI notifications are enabled
		const settings = await chrome.storage.sync.get([
			"enableAiNotifications",
		]);
		if (settings.enableAiNotifications === false) {
			return; // User disabled AI notifications
		}

		let message;
		switch (operation) {
			case "summarized":
				message = `"${title}" has been summarized and added to your digest`;
				break;
			case "explained":
				message = `"${title}" has been explained and added to your digest`;
				break;
			case "simplified":
				message = `"${title}" has been simplified and added to your digest`;
				break;
			default:
				message = `AI operation completed for "${title}"`;
		}

		await chrome.notifications.create({
			type: "basic",
			iconUrl: "icon.svg",
			title: "AI Insight Ready",
			message: message,
			silent: true, // Toast-style notification
		});
	} catch (error) {
		console.error("Failed to show AI insight notification:", error);
	}
}

// Set sync badge indicator
async function setSyncBadge(isSyncing) {
	try {
		// Check if sync indicators are enabled
		const settings = await chrome.storage.sync.get([
			"enableSyncIndicators",
		]);
		if (settings.enableSyncIndicators === false) {
			// Clear badge if disabled
			await chrome.action.setBadgeText({ text: "" });
			return;
		}

		if (isSyncing) {
			await chrome.action.setBadgeText({ text: "SYNC" });
			await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" }); // Blue color
		} else {
			await chrome.action.setBadgeText({ text: "" });
		}
	} catch (error) {
		console.error("Failed to set sync badge:", error);
	}
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener(
	async (notificationId, buttonIndex) => {
		if (
			exportRetryData &&
			exportRetryData.notificationId === notificationId &&
			buttonIndex === 0
		) {
			// Retry export
			try {
				// Get current summaries
				const response = await chrome.runtime.sendMessage({
					type: "GET_SUMMARIES_FOR_EXPORT",
				});

				if (
					response &&
					response.summaries &&
					response.summaries.length > 0
				) {
					// Send retry request to settings page
					await chrome.runtime.sendMessage({
						type: "RETRY_EXPORT",
						format: exportRetryData.format,
					});
				}
			} catch (error) {
				console.error("Failed to retry export:", error);
			}

			// Clear retry data
			exportRetryData = null;

			// Clear the notification
			chrome.notifications.clear(notificationId);
		}
	}
);

// Global variable to store export retry data
let exportRetryData = null;

// Helper function to format duration in human-readable format
function formatDuration(milliseconds) {
	const seconds = Math.floor(milliseconds / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);

	if (hours > 0) {
		return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
	} else if (minutes > 0) {
		return `${minutes}m ${seconds % 60}s`;
	} else {
		return `${seconds}s`;
	}
}
