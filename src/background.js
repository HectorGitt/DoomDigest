import { GoogleGenerativeAI } from "@google/generative-ai";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Global error handlers for service worker stability
self.addEventListener("unhandledrejection", (event) => {
	console.error(
		"Unhandled promise rejection in background script:",
		event.reason
	);
	// Prevent the service worker from crashing
	event.preventDefault();
});

self.addEventListener("error", (event) => {
	console.error("Unhandled error in background script:", event.error);
	// Prevent the service worker from crashing
	event.preventDefault();
});

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
		console.log("Background: Initializing IndexedDB access");
		const db = await initIndexedDB();
		console.log("Background: IndexedDB initialized successfully");
		const transaction = db.transaction(["summaries"], "readonly");
		const store = transaction.objectStore("summaries");

		return new Promise((resolve, reject) => {
			const request = store.getAll();
			request.onsuccess = () => {
				let summaries = request.result || [];
				console.log(
					"Background: Retrieved summaries from DB:",
					summaries.length,
					"items"
				);

				// Migrate existing digests to add type field if missing
				summaries = migrateDigestTypes(summaries);

				resolve(summaries);
			};
			request.onerror = () => {
				console.error(
					"Background: Failed to retrieve summaries from DB:",
					request.error
				);
				reject(request.error);
			};
		});
	} catch (error) {
		console.error(
			"Background: Error loading summaries from IndexedDB:",
			error
		);
		return [];
	}
}

// Migrate existing digests to add type field based on their properties
function migrateDigestTypes(summaries) {
	let migrated = false;

	summaries.forEach((summary) => {
		if (!summary.type) {
			migrated = true;
			// Determine type based on existing properties
			if (summary.isSelectedText) {
				if (summary.mode === "explain") {
					summary.type = "explained";
				} else if (summary.mode === "simplify") {
					summary.type = "simplified";
				} else if (summary.isRawText) {
					summary.type = "raw-text";
				} else {
					summary.type = "selected-text";
				}
			} else {
				summary.type = "article";
			}
		}
	});

	if (migrated) {
		console.log(
			"Background: Migrated existing digests to include type field"
		);
		// Save the migrated data back to IndexedDB
		saveSummariesToIndexedDB(summaries).catch((error) => {
			console.error(
				"Background: Failed to save migrated digests:",
				error
			);
		});
	}

	return summaries;
}

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
		if (info.menuItemId === "snap-page") {
			// Snap the entire page - now works without sidebar
			try {
				const result = await handlePageSnap(
					tab.url,
					tab.title,
					"teaser",
					tab.id
				);

				if (result && result.success) {
					// Show success notification
					await showToastNotification(
						"Page Snapped",
						`"${tab.title}" has been added to your digest`
					);
				} else {
					console.error("Page snap failed:", result?.error);
					await chrome.notifications.create({
						type: "basic",
						iconUrl: chrome.runtime.getURL("icon.png"),
						title: "Page Snap Failed",
						message: result?.error || "Failed to snap page",
						silent: true,
					});
				}
			} catch (error) {
				console.error("Page snap failed:", error.message || error);
				await chrome.notifications.create({
					type: "basic",
					iconUrl: chrome.runtime.getURL("icon.png"),
					title: "Page Snap Failed",
					message: error.message || "Failed to snap page",
					silent: true,
				});
			}
		} else if (info.menuItemId === "add-to-digest") {
			// Add selected text to digest without summarization
			const selectedText = info.selectionText;
			if (selectedText && selectedText.trim().length > 0) {
				try {
					const result = await handleAddSelectedTextRaw(
						selectedText.trim(),
						tab.url,
						tab.title
					);

					if (result && result.success) {
						await chrome.notifications.create({
							type: "basic",
							iconUrl: chrome.runtime.getURL("icon.png"),
							title: "Text Added",
							message:
								"Selected text has been added to your digest",
							silent: true,
						});
					} else {
						console.error("Add text failed:", result?.error);
					}
				} catch (error) {
					console.error("Add text failed:", error.message || error);
					await chrome.notifications.create({
						type: "basic",
						iconUrl: chrome.runtime.getURL("icon.png"),
						title: "Add Text Failed",
						message: error.message || "Failed to add selected text",
						silent: true,
					});
				}
			}
		} else if (info.menuItemId === "summarize-selection") {
			// Summarize selected text before adding to digest
			const selectedText = info.selectionText;
			if (selectedText && selectedText.trim().length > 0) {
				try {
					const result = await handleAddSelectedTextSummarized(
						selectedText.trim(),
						tab.url,
						tab.title
					);

					if (result && result.success) {
						// Notification is handled by the background handler
					} else {
						console.error(
							"Summarize selection failed:",
							result?.error
						);
						await chrome.notifications.create({
							type: "basic",
							iconUrl: chrome.runtime.getURL("icon.png"),
							title: "Summarization Failed",
							message:
								result?.error ||
								"Failed to summarize selected text",
							silent: true,
						});
					}
				} catch (error) {
					console.error(
						"Summarize selection failed:",
						error.message || error
					);
					await chrome.notifications.create({
						type: "basic",
						iconUrl: chrome.runtime.getURL("icon.png"),
						title: "Summarization Failed",
						message:
							error.message ||
							"Failed to summarize selected text",
						silent: true,
					});
				}
			}
		} else if (info.menuItemId === "simplify-selection") {
			// Simplify selected text
			const selectedText = info.selectionText;
			if (selectedText && selectedText.trim().length > 0) {
				try {
					const result = await handleSimplifySelectedText(
						selectedText.trim(),
						tab.url,
						tab.title
					);

					if (result && result.success) {
						// Notification is handled by the background handler
					} else {
						console.error(
							"Simplify selection failed:",
							result?.error
						);
						await chrome.notifications.create({
							type: "basic",
							iconUrl: chrome.runtime.getURL("icon.png"),
							title: "Simplification Failed",
							message:
								result?.error ||
								"Failed to simplify selected text",
							silent: true,
						});
					}
				} catch (error) {
					console.error(
						"Simplify selection failed:",
						error.message || error
					);
					await chrome.notifications.create({
						type: "basic",
						iconUrl: chrome.runtime.getURL("icon.png"),
						title: "Simplification Failed",
						message:
							error.message || "Failed to simplify selected text",
						silent: true,
					});
				}
			}
		}
	} catch (error) {
		console.error("Error handling context menu click:", error);
		await chrome.notifications.create({
			type: "basic",
			iconUrl: chrome.runtime.getURL("icon.png"),
			title: "Operation Failed",
			message: "An error occurred while processing your request",
			silent: true,
		});
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
	} else if (request.type === "EXPLAIN_TEXT") {
		handleExplainText(request.text)
			.then((result) => {
				sendResponse({ success: true, result });
			})
			.catch((error) => {
				console.error("Explain text error:", error);
				sendResponse({ success: false, error: error.message });
			});
		return true; // Keep message channel open for async response
	} else if (request.type === "SNAP_PAGE") {
		handlePageSnap(
			request.url,
			request.title,
			request.summaryType,
			request.tabId
		)
			.then((result) => {
				sendResponse(result);
			})
			.catch((error) => {
				console.error("Page snap error:", error);
				sendResponse({ success: false, error: error.message });
			});
		return true; // Keep message channel open for async response
	} else if (request.type === "ADD_SELECTED_TEXT_RAW") {
		handleAddSelectedTextRaw(
			request.selectedText,
			request.url,
			request.title
		)
			.then((result) => {
				sendResponse(result);
			})
			.catch((error) => {
				console.error("Add selected text raw error:", error);
				sendResponse({ success: false, error: error.message });
			});
		return true; // Keep message channel open for async response
	} else if (request.type === "ADD_SELECTED_TEXT_SUMMARIZED") {
		handleAddSelectedTextSummarized(
			request.selectedText,
			request.url,
			request.title
		)
			.then((result) => {
				sendResponse(result);
			})
			.catch((error) => {
				console.error("Add selected text summarized error:", error);
				sendResponse({ success: false, error: error.message });
			});
		return true; // Keep message channel open for async response
	} else if (request.type === "EXPLAIN_SELECTED_TEXT") {
		handleExplainSelectedText(
			request.selectedText,
			request.url,
			request.title
		)
			.then((result) => {
				sendResponse(result);
			})
			.catch((error) => {
				console.error("Explain selected text error:", error);
				sendResponse({ success: false, error: error.message });
			});
		return true; // Keep message channel open for async response
	} else if (request.type === "SIMPLIFY_SELECTED_TEXT") {
		handleSimplifySelectedText(
			request.selectedText,
			request.url,
			request.title
		)
			.then((result) => {
				sendResponse(result);
			})
			.catch((error) => {
				console.error("Simplify selected text error:", error);
				sendResponse({ success: false, error: error.message });
			});
		return true; // Keep message channel open for async response
	} else if (request.type === "GET_SUMMARIES_FOR_EXPORT") {
		// Handle export request from settings page
		loadSummariesFromIndexedDB()
			.then((summaries) => {
				sendResponse({
					summaries: summaries || [],
				});
			})
			.catch((error) => {
				console.error("Error loading summaries for export:", error);
				sendResponse({
					summaries: [],
				});
			});
		return true; // Keep message channel open for async response
	} else if (request.type === "GET_ALL_DIGESTS") {
		// Handle request for all digests from digest page
		console.log("Background: Received GET_ALL_DIGESTS request");

		// Respond immediately to keep the message port open
		sendResponse({ success: true, loading: true });

		// Then load data asynchronously and send a separate message
		loadSummariesFromIndexedDB()
			.then((summaries) => {
				console.log(
					"Background: Loaded summaries from DB, count:",
					summaries?.length || 0
				);
				// Send the actual data via a separate message
				chrome.runtime
					.sendMessage({
						type: "DIGESTS_DATA",
						digests: summaries || [],
					})
					.catch(() => {
						// Ignore errors if digest page is not listening
					});
			})
			.catch((error) => {
				console.error("Background: Error loading digests:", error);
				// Send error via separate message
				chrome.runtime
					.sendMessage({
						type: "DIGESTS_ERROR",
						error: error.message,
					})
					.catch(() => {
						// Ignore errors if digest page is not listening
					});
			});

		return true; // Keep message channel open for initial response
	} else if (request.type === "DELETE_DIGEST") {
		// Handle delete digest request from digest page
		console.log(
			"Background: Received DELETE_DIGEST request for ID:",
			request.digestId
		);

		// Send immediate response to acknowledge the request
		sendResponse({ success: true, acknowledged: true });

		// Do the async work after acknowledging
		loadSummariesFromIndexedDB()
			.then((summaries) => {
				console.log(
					"Background: Loaded summaries for deletion, count:",
					summaries?.length || 0
				);
				// Filter out the digest to delete
				const filteredSummaries = summaries.filter(
					(summary) => summary.id !== parseInt(request.digestId)
				);
				console.log(
					"Background: After filtering, remaining count:",
					filteredSummaries.length
				);
				return saveSummariesToIndexedDB(filteredSummaries);
			})
			.then(() => {
				console.log("Background: Digest deleted successfully");
				// Try to notify the digest page that deletion is complete
				try {
					chrome.runtime.sendMessage({
						type: "DELETE_DIGEST_COMPLETE",
						digestId: request.digestId,
						success: true,
					});
				} catch (e) {
					// Digest page may not be listening, that's ok
					console.log(
						"Digest page not available for completion notification"
					);
				}
			})
			.catch((error) => {
				console.error("Background: Error deleting digest:", error);
				// Try to notify the digest page of the error
				try {
					chrome.runtime.sendMessage({
						type: "DELETE_DIGEST_COMPLETE",
						digestId: request.digestId,
						success: false,
						error: error.message,
					});
				} catch (e) {
					// Digest page may not be listening, that's ok
					console.log(
						"Digest page not available for error notification"
					);
				}
			});

		return true; // Keep message channel open for initial response
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
		// Send immediate response to acknowledge
		sendResponse({ success: true, acknowledged: true });

		// Do the async remove work
		handleGoogleDriveRemove()
			.then((result) => {
				// Send result via separate message
				chrome.runtime
					.sendMessage({
						type: "REMOVE_COMPLETED",
						result: result,
					})
					.catch(() => {
						// Ignore if settings page is not listening
					});
			})
			.catch((error) => {
				console.error("Google Drive remove error:", error);
				chrome.runtime
					.sendMessage({
						type: "REMOVE_COMPLETED",
						result: { success: false, error: error.message },
					})
					.catch(() => {
						// Ignore if settings page is not listening
					});
			});

		return true;
	} else if (request.type === "SYNC_TO_GOOGLE_DRIVE") {
		// Send immediate response to acknowledge
		sendResponse({ success: true, acknowledged: true });

		// Do the async sync work
		handleGoogleDriveSync(request.summaries)
			.then((result) => {
				// Send result via separate message
				chrome.runtime
					.sendMessage({
						type: "SYNC_COMPLETED",
						result: result,
					})
					.catch(() => {
						// Ignore if settings page is not listening
					});
			})
			.catch((error) => {
				console.error("Google Drive sync error:", error);
				chrome.runtime
					.sendMessage({
						type: "SYNC_COMPLETED",
						result: { success: false, error: error.message },
					})
					.catch(() => {
						// Ignore if settings page is not listening
					});
			});

		return true; // Keep message channel open for initial response
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
	} else if (request.type === "SET_AUTO_ANALYTICS_SCHEDULE") {
		// Handle setting up auto-analytics schedule
		chrome.alarms.create("autoAnalytics", {
			when: request.nextRunTime,
		});
		// Store the settings for the alarm
		chrome.storage.sync.set({ autoAnalyticsSettings: request.settings });
		return true;
	} else if (request.type === "CLEAR_AUTO_ANALYTICS_SCHEDULE") {
		// Handle clearing auto-analytics schedule
		chrome.alarms.clear("autoAnalytics");
		chrome.storage.sync.remove(["autoAnalyticsSettings"]);
		return true;
	} else if (request.type === "SYNC_ANALYTICS_TO_GOOGLE_DRIVE") {
		// Send immediate response to acknowledge
		sendResponse({ success: true, acknowledged: true });

		// Do the async sync work
		handleAnalyticsGoogleDriveSync(request.analytics)
			.then((result) => {
				// Send result via separate message
				chrome.runtime
					.sendMessage({
						type: "ANALYTICS_SYNC_COMPLETED",
						result: result,
					})
					.catch(() => {
						// Ignore if analytics page is not listening
					});
			})
			.catch((error) => {
				console.error("Analytics Google Drive sync error:", error);
				chrome.runtime
					.sendMessage({
						type: "ANALYTICS_SYNC_COMPLETED",
						result: { success: false, error: error.message },
					})
					.catch(() => {
						// Ignore if analytics page is not listening
					});
			});

		return true; // Keep message channel open for initial response
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
	} else if (request.type === "STORE_SUMMARY_LOCALLY") {
		// Handle local summary storage request from content script
		try {
			loadSummariesFromIndexedDB()
				.then((summaries) => {
					summaries.push(request.summaryData);
					return saveSummariesToIndexedDB(summaries);
				})
				.then(() => {
					sendResponse({ success: true });
				})
				.catch((error) => {
					console.error("Store summary locally error:", error);
					sendResponse({ success: false, error: error.message });
				});
		} catch (error) {
			console.error("Store summary locally error:", error);
			sendResponse({ success: false, error: error.message });
		}
		return true; // Keep message channel open for async response
	}
});
chrome.storage.sync.get(["autoSyncFrequency"], (result) => {
	try {
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
	} catch (error) {
		console.error("Error restoring auto-sync alarm:", error);
	}
});

// Restore auto-analytics alarm on startup
chrome.storage.sync.get(["autoAnalyticsSettings"], (result) => {
	try {
		const settings = result.autoAnalyticsSettings;
		if (settings && settings.enabled) {
			// Calculate next run time and create alarm
			const nextRunTime = calculateNextRunTime(settings.duration);
			chrome.alarms.create("autoAnalytics", {
				when: nextRunTime,
			});
			console.log("Restored auto-analytics alarm");
		}
	} catch (error) {
		console.error("Error restoring auto-analytics alarm:", error);
	}
});

// Handle alarm triggers for auto-sync
chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name === "autoSync") {
		try {
			console.log("Auto-sync alarm triggered, starting sync...");

			// Get summaries from storage
			const summaries = await loadSummariesFromIndexedDB();

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

// Handle alarm triggers for auto-analytics
chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name === "autoAnalytics") {
		try {
			console.log(
				"Auto-analytics alarm triggered, generating analytics..."
			);

			// Get stored settings
			const result = await chrome.storage.sync.get([
				"autoAnalyticsSettings",
			]);
			const settings = result.autoAnalyticsSettings;

			if (!settings || !settings.enabled) {
				console.log("Auto-analytics disabled, skipping");
				return;
			}

			// Get filtered summaries based on settings
			const timeFilter = getTimeFilterFromSettings(settings);
			const summaries = await loadSummariesFromIndexedDB();

			// Apply time filter if specified
			if (timeFilter) {
				summaries = summaries.filter((summary) => {
					const summaryTime = summary.timestamp;
					return (
						summaryTime >= timeFilter.start &&
						summaryTime <= timeFilter.end
					);
				});
			}

			if (summaries.length === 0) {
				console.log("No summaries found for the selected time period");
				return;
			}

			// Generate analytics using stored customization
			const analyticsResponse = await chrome.runtime.sendMessage({
				type: "GENERATE_CUSTOM_ANALYTICS",
				summaries: summaries,
				customization: {
					duration: settings.duration,
					depth: settings.depth,
					focusAreas: settings.focusAreas,
					format: settings.format,
					customInstructions: settings.customInstructions,
				},
			});

			if (analyticsResponse.success) {
				// Save the analytics report automatically
				const report = {
					id: Date.now().toString(),
					name: `Auto Analytics Report - ${new Date().toLocaleDateString()}`,
					content: analyticsResponse.analytics,
					timeFilter: timeFilter,
					customization: {
						duration: settings.duration,
						depth: settings.depth,
						focusAreas: settings.focusAreas,
						format: settings.format,
						customInstructions: settings.customInstructions,
					},
					generatedAt: new Date().toISOString(),
					summaryCount: summaries.length,
					savedAt: new Date().toISOString(),
					autoGenerated: true,
				};

				// Get existing saved reports
				const savedResult = await chrome.storage.sync.get([
					"savedAnalyticsReports",
				]);
				const savedReports = savedResult.savedAnalyticsReports || [];

				// Add new report
				savedReports.unshift(report); // Add to beginning

				// Keep only last 20 reports (more for auto-generated)
				if (savedReports.length > 20) {
					savedReports.splice(20);
				}

				// Save back to storage
				await chrome.storage.sync.set({
					savedAnalyticsReports: savedReports,
				});

				// Show notification
				await chrome.notifications.create({
					type: "basic",
					iconUrl: chrome.runtime.getURL("icon.png"),
					title: "Auto Analytics Complete",
					message: `Productivity analysis generated for ${summaries.length} summaries`,
					silent: true,
				});

				console.log("Auto-analytics completed successfully");

				// Check if auto-sync to Google Drive is enabled
				const autoSyncSettings = await chrome.storage.sync.get([
					"autoAnalyticsSyncEnabled",
					"googleDriveConnected",
				]);

				if (
					autoSyncSettings.autoAnalyticsSyncEnabled &&
					autoSyncSettings.googleDriveConnected
				) {
					try {
						console.log(
							"Auto-syncing analytics report to Google Drive..."
						);

						// Sync the generated analytics report to Google Drive
						const syncResult = await handleAnalyticsGoogleDriveSync(
							{
								content: analyticsResponse.analytics,
								generatedAt: new Date().toISOString(),
								customization: {
									duration: settings.duration,
									depth: settings.depth,
									focusAreas: settings.focusAreas,
									format: settings.format,
									customInstructions:
										settings.customInstructions,
								},
								summaryCount: summaries.length,
							}
						);

						if (syncResult.success) {
							console.log(
								"Auto-analytics sync completed successfully:",
								syncResult.message
							);

							// Update notification to include sync success
							await chrome.notifications.create({
								type: "basic",
								iconUrl: chrome.runtime.getURL("icon.png"),
								title: "Auto Analytics Complete",
								message: `Productivity analysis generated and synced to Google Drive for ${summaries.length} summaries`,
								silent: true,
							});
						} else {
							console.error(
								"Auto-analytics sync failed:",
								syncResult.error
							);
							// Still show success for generation, but log sync failure
							await chrome.notifications.create({
								type: "basic",
								iconUrl: chrome.runtime.getURL("icon.png"),
								title: "Auto Analytics Complete",
								message: `Productivity analysis generated for ${summaries.length} summaries (sync failed: ${syncResult.error})`,
								silent: true,
							});
						}
					} catch (syncError) {
						console.error("Auto-analytics sync error:", syncError);
						// Don't fail the entire process if sync fails
						await chrome.notifications.create({
							type: "basic",
							iconUrl: chrome.runtime.getURL("icon.png"),
							title: "Auto Analytics Complete",
							message: `Productivity analysis generated for ${summaries.length} summaries (sync failed)`,
							silent: true,
						});
					}
				}

				// Schedule next run
				const nextRunTime = calculateNextRunTime(settings.duration);
				await chrome.runtime.sendMessage({
					type: "SET_AUTO_ANALYTICS_SCHEDULE",
					settings: settings,
					nextRunTime: nextRunTime,
				});
			} else {
				console.error(
					"Auto-analytics generation failed:",
					analyticsResponse.error
				);
			}
		} catch (error) {
			console.error("Auto-analytics error:", error);
		}
	}
});

// Helper function to get time filter from settings
function getTimeFilterFromSettings(settings) {
	const period = settings.timePeriod;
	const now = new Date();

	switch (period) {
		case "today":
			const today = new Date(now);
			today.setHours(0, 0, 0, 0);
			return { start: today.getTime(), end: now.getTime() };

		case "week":
			const weekStart = new Date(now);
			weekStart.setDate(now.getDate() - now.getDay());
			weekStart.setHours(0, 0, 0, 0);
			return { start: weekStart.getTime(), end: now.getTime() };

		case "month":
			const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
			return { start: monthStart.getTime(), end: now.getTime() };

		case "quarter":
			const quarterStart = new Date(
				now.getFullYear(),
				Math.floor(now.getMonth() / 3) * 3,
				1
			);
			return { start: quarterStart.getTime(), end: now.getTime() };

		case "year":
			const yearStart = new Date(now.getFullYear(), 0, 1);
			return { start: yearStart.getTime(), end: now.getTime() };

		case "custom":
			if (settings.startDate && settings.endDate) {
				const startDate = new Date(settings.startDate + "T00:00:00");
				const endDate = new Date(settings.endDate + "T23:59:59");
				return { start: startDate.getTime(), end: endDate.getTime() };
			}
			break;

		default: // "all"
			return null;
	}
}

// Helper function to calculate next run time
function calculateNextRunTime(duration) {
	const now = new Date();
	const nextRun = new Date(now);

	switch (duration) {
		case "quick":
			nextRun.setHours(now.getHours() + 24); // Daily
			break;
		case "standard":
			nextRun.setDate(now.getDate() + 7); // Weekly
			break;
		case "detailed":
			nextRun.setDate(now.getDate() + 14); // Bi-weekly
			break;
		case "comprehensive":
			nextRun.setMonth(now.getMonth() + 1); // Monthly
			break;
		default:
			nextRun.setDate(now.getDate() + 7); // Default to weekly
	}

	return nextRun.getTime();
}

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

// Explain text using external API
async function handleExplainText(text) {
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

					const prompt = `Please explain the following text in simple terms, making it easy to understand. Break down complex concepts and provide context where needed:

${text}

Explanation:`;

					const result = await session.prompt(prompt);
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
			return await explainWithGemini(text);
		}

		if (provider === "gemini" && settings.geminiApiKey) {
			return await explainWithGemini(text);
		}

		// If no API is available, return original text with note
		return `${text}\n\n(Note: Text explanation requires Chrome AI or Gemini API configuration.)`;
	} catch (error) {
		console.error("Error in handleExplainText:", error);
		throw error;
	}
}

// Handle page snap - summarize the entire page
async function handlePageSnap(
	url,
	title,
	summaryType = "teaser",
	tabId = null
) {
	try {
		// Send loading start message to sidebar
		chrome.runtime.sendMessage({
			type: "SHOW_LOADING",
			message: "Snapping page...",
		});

		// Get page content from the specified tab
		let pageContent = null;
		if (tabId) {
			try {
				// Inject content extraction script into the tab
				const results = await chrome.scripting.executeScript({
					target: { tabId: tabId },
					function: extractPageContent,
				});
				if (results && results[0] && results[0].result) {
					pageContent = results[0].result;
				}
			} catch (error) {
				console.warn("Failed to extract content from tab:", error);
			}
		}

		if (!pageContent || pageContent.length === 0) {
			throw new Error("No content found for page snap");
		}

		// Use the first (most relevant) content block
		const mainContent = pageContent[0];
		const normalizedText = normalizeText(mainContent.text);

		// Check if content is substantial enough
		if (normalizedText.length < 100) {
			throw new Error("Content too short for page snap");
		}

		// Create content hash to avoid duplicates
		const contentHash = hashString(normalizedText);

		// Check if already processed
		const existingSummaries = await loadSummariesFromIndexedDB();
		const existingSummary = existingSummaries.find(
			(s) => s.contentHash === contentHash
		);
		if (existingSummary) {
			console.log("Page already snapped");
			return { success: true, message: "Page already snapped" };
		}

		// Extract title and link
		const pageTitle =
			title || mainContent.title || document.title || "Page Summary";
		const elementLink = mainContent.elementLink || url;

		// Summarize the content
		const text = normalizedText.slice(0, 2000); // Limit for API
		const summary = await summarizeText(text, summaryType);

		if (summary) {
			// Create summary data - truncate content aggressively to fit storage limits
			const summaryData = {
				summary:
					summary.length > 2000
						? summary.slice(0, 2000) + "..."
						: summary,
				url: url.slice(0, 500), // Truncate URL to 500 chars
				title:
					pageTitle.length > 100
						? pageTitle.slice(0, 100) + "..."
						: pageTitle,
				elementLink: elementLink.slice(0, 500), // Truncate elementLink to 500 chars
				timestamp: Date.now(),
				contentHash: contentHash,
				type: "article", // Page snap creates article-type digest
			}; // Add to storage
			const updatedSummaries = [...existingSummaries, summaryData];
			await saveSummariesToIndexedDB(updatedSummaries);

			// Try to notify sidebar if open
			try {
				await chrome.runtime.sendMessage({
					type: "NEW_SUMMARY",
					...summaryData,
				});
			} catch (e) {
				// Sidebar not open - that's fine, data is stored
				console.log("Sidebar not available, summary stored locally");
			}

			// Also try to send REFRESH_SIDEBAR message as fallback
			try {
				await chrome.runtime.sendMessage({
					type: "REFRESH_SIDEBAR",
				});
			} catch (e) {
				// Ignore if no listeners
			}

			// Show notification
			await showToastNotification(
				"Page Snapped",
				`"${pageTitle}" has been added to your digest`
			);

			return { success: true, message: "Page snapped successfully" };
		} else {
			throw new Error("Failed to generate summary");
		}
	} catch (error) {
		console.error("Error in handlePageSnap:", error);
		throw error;
	} finally {
		// Always hide loading when done
		chrome.runtime.sendMessage({ type: "HIDE_LOADING" });
	}
}

// Handle adding selected text directly to digest
async function handleAddSelectedTextRaw(selectedText, url, title) {
	try {
		// Create a unique hash for the selected text
		const contentHash = hashString(selectedText + url + Date.now());

		// Get existing summaries
		const existingSummaries = await loadSummariesFromIndexedDB();

		// Create a title for the selected text
		const summaryTitle =
			title ||
			(selectedText.length > 50
				? selectedText.slice(0, 50) + "..."
				: selectedText);

		// Create summary data - truncate content aggressively to fit storage limits
		const summaryData = {
			summary:
				selectedText.length > 2000
					? selectedText.slice(0, 2000) + "..."
					: selectedText,
			url: url.slice(0, 500), // Truncate URL to 500 chars
			title:
				`Selected Text: ${summaryTitle}`.length > 100
					? `Selected Text: ${summaryTitle.slice(0, 80)}...`
					: `Selected Text: ${summaryTitle}`,
			elementLink: url.slice(0, 500), // Truncate elementLink to 500 chars
			timestamp: Date.now(),
			contentHash: contentHash,
			isSelectedText: true,
			isRawText: true, // Flag to indicate this is raw text
			type: "raw-text", // Raw selected text type
		};

		// Add to storage
		const updatedSummaries = [...existingSummaries, summaryData];
		await saveSummariesToIndexedDB(updatedSummaries);

		// Try to notify sidebar if open
		try {
			await chrome.runtime.sendMessage({
				type: "NEW_SUMMARY",
				...summaryData,
			});
		} catch (e) {
			// Sidebar not open - that's fine, data is stored
			console.log("Sidebar not available, text stored locally");
		}

		return { success: true, message: "Selected text added to digest" };
	} catch (error) {
		console.error("Error in handleAddSelectedTextRaw:", error);
		throw error;
	}
}

// Handle adding selected text with summarization to digest
async function handleAddSelectedTextSummarized(selectedText, url, title) {
	try {
		// Send loading start message to sidebar
		chrome.runtime.sendMessage({
			type: "SHOW_LOADING",
			message: "Summarizing text...",
		});

		// Create a unique hash for the selected text
		const contentHash = hashString(selectedText + url + Date.now());

		// Get existing summaries
		const existingSummaries = await loadSummariesFromIndexedDB();

		// Create a title for the selected text
		const summaryTitle =
			title ||
			(selectedText.length > 50
				? selectedText.slice(0, 50) + "..."
				: selectedText);

		// Summarize the selected text
		const summary = await summarizeText(
			selectedText.slice(0, 2000),
			"teaser"
		);

		if (summary) {
			// Create summary data - truncate content aggressively to fit storage limits
			const summaryData = {
				summary:
					summary.length > 2000
						? summary.slice(0, 2000) + "..."
						: summary,
				url: url.slice(0, 500), // Truncate URL to 500 chars
				title:
					`Selected Text: ${summaryTitle}`.length > 100
						? `Selected Text: ${summaryTitle.slice(0, 80)}...`
						: `Selected Text: ${summaryTitle}`,
				elementLink: url.slice(0, 500), // Truncate elementLink to 500 chars
				timestamp: Date.now(),
				contentHash: contentHash,
				isSelectedText: true,
				originalText:
					selectedText.length > 1000
						? selectedText.slice(0, 1000) + "..."
						: selectedText, // Keep original text for reference (truncated to 1KB)
				type: "selected-text", // Summarized selected text type
			};

			// Add to storage
			const updatedSummaries = [...existingSummaries, summaryData];
			await saveSummariesToIndexedDB(updatedSummaries);

			// Try to notify sidebar if open - send to all listeners
			try {
				await chrome.runtime.sendMessage({
					type: "NEW_SUMMARY",
					...summaryData,
				});
			} catch (e) {
				// Sidebar not open or not listening - that's fine, data is stored
				console.log(
					"Sidebar not available for NEW_SUMMARY message, summary stored locally"
				);
			}

			// Also try to send REFRESH_SIDEBAR message as fallback
			try {
				await chrome.runtime.sendMessage({
					type: "REFRESH_SIDEBAR",
				});
			} catch (e) {
				// Ignore if no listeners
			}

			// Show notification
			await showAiInsightNotification("summarized", summaryTitle);

			return {
				success: true,
				message: "Selected text summarized and added to digest",
			};
		} else {
			throw new Error("Failed to summarize selected text");
		}
	} catch (error) {
		console.error("Error in handleAddSelectedTextSummarized:", error);
		throw error;
	} finally {
		// Always hide loading when done
		chrome.runtime.sendMessage({ type: "HIDE_LOADING" });
	}
}

// Handle explaining selected text
async function handleExplainSelectedText(selectedText, url, title) {
	try {
		// Send loading start message to sidebar
		chrome.runtime.sendMessage({
			type: "SHOW_LOADING",
			message: "Explaining text...",
		});

		// Create a unique hash for the selected text
		const contentHash = hashString(
			selectedText + url + "explain" + Date.now()
		);

		// Get existing summaries
		const existingSummaries = await loadSummariesFromIndexedDB();

		// Create a title for the selected text
		const summaryTitle =
			title ||
			(selectedText.length > 50
				? selectedText.slice(0, 50) + "..."
				: selectedText);

		// Explain the selected text
		const explanation = await handleExplainText(
			selectedText.slice(0, 2000)
		);

		if (explanation) {
			// Create summary data - truncate content aggressively to fit storage limits
			const summaryData = {
				summary:
					explanation.length > 2000
						? explanation.slice(0, 2000) + "..."
						: explanation,
				url: url.slice(0, 500), // Truncate URL to 500 chars
				title:
					`Explanation: ${summaryTitle}`.length > 100
						? `Explanation: ${summaryTitle.slice(0, 80)}...`
						: `Explanation: ${summaryTitle}`,
				elementLink: url.slice(0, 500), // Truncate elementLink to 500 chars
				timestamp: Date.now(),
				contentHash: contentHash,
				isSelectedText: true,
				originalText:
					selectedText.length > 1000
						? selectedText.slice(0, 1000) + "..."
						: selectedText, // Keep original text for reference (truncated to 1KB)
				mode: "explain",
				type: "explained", // Explained text type
			};

			// Add to storage
			const updatedSummaries = [...existingSummaries, summaryData];
			await saveSummariesToIndexedDB(updatedSummaries);

			// Try to notify sidebar if open
			try {
				await chrome.runtime.sendMessage({
					type: "NEW_SUMMARY",
					...summaryData,
				});
			} catch (e) {
				// Sidebar not open - that's fine, data is stored
				console.log(
					"Sidebar not available, explanation stored locally"
				);
			}

			// Also try to send REFRESH_SIDEBAR message as fallback
			try {
				await chrome.runtime.sendMessage({
					type: "REFRESH_SIDEBAR",
				});
			} catch (e) {
				// Ignore if no listeners
			}

			// Show notification
			await showAiInsightNotification("explained", summaryTitle);

			return {
				success: true,
				message: "Selected text explained and added to digest",
			};
		} else {
			throw new Error("Failed to explain selected text");
		}
	} catch (error) {
		console.error("Error in handleExplainSelectedText:", error);
		throw error;
	} finally {
		// Always hide loading when done
		chrome.runtime.sendMessage({ type: "HIDE_LOADING" });
	}
}

// Handle simplifying selected text
async function handleSimplifySelectedText(selectedText, url, title) {
	try {
		// Send loading start message to sidebar
		chrome.runtime.sendMessage({
			type: "SHOW_LOADING",
			message: "Simplifying text...",
		});

		// Create a unique hash for the selected text
		const contentHash = hashString(
			selectedText + url + "simplify" + Date.now()
		);

		// Get existing summaries
		const existingSummaries = await loadSummariesFromIndexedDB();

		// Create a title for the selected text
		const summaryTitle =
			title ||
			(selectedText.length > 50
				? selectedText.slice(0, 50) + "..."
				: selectedText);

		// Simplify the selected text
		const simplified = await handleSimplifyText(
			selectedText.slice(0, 2000)
		);

		if (simplified) {
			// Create summary data - truncate content aggressively to fit storage limits
			const summaryData = {
				summary:
					simplified.length > 2000
						? simplified.slice(0, 2000) + "..."
						: simplified,
				url: url.slice(0, 500), // Truncate URL to 500 chars
				title:
					`Simplified: ${summaryTitle}`.length > 100
						? `Simplified: ${summaryTitle.slice(0, 80)}...`
						: `Simplified: ${summaryTitle}`,
				elementLink: url.slice(0, 500), // Truncate elementLink to 500 chars
				timestamp: Date.now(),
				contentHash: contentHash,
				isSelectedText: true,
				originalText:
					selectedText.length > 1000
						? selectedText.slice(0, 1000) + "..."
						: selectedText, // Keep original text for reference (truncated to 1KB)
				mode: "simplify",
				type: "simplified", // Simplified text type
			};

			// Add to storage
			const updatedSummaries = [...existingSummaries, summaryData];
			await saveSummariesToIndexedDB(updatedSummaries);

			// Try to notify sidebar if open
			try {
				await chrome.runtime.sendMessage({
					type: "NEW_SUMMARY",
					...summaryData,
				});
			} catch (e) {
				// Sidebar not open - that's fine, data is stored
				console.log(
					"Sidebar not available, simplified text stored locally"
				);
			}

			// Also try to send REFRESH_SIDEBAR message as fallback
			try {
				await chrome.runtime.sendMessage({
					type: "REFRESH_SIDEBAR",
				});
			} catch (e) {
				// Ignore if no listeners
			}

			// Show notification
			await showAiInsightNotification("simplified", summaryTitle);

			return {
				success: true,
				message: "Selected text simplified and added to digest",
			};
		} else {
			throw new Error("Failed to simplify selected text");
		}
	} catch (error) {
		console.error("Error in handleSimplifySelectedText:", error);
		throw error;
	} finally {
		// Always hide loading when done
		chrome.runtime.sendMessage({ type: "HIDE_LOADING" });
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

	return `You are analyzing page summaries(i.e articles, emails, blogs and documentations) and social media post summaries(i.e tweets, Facebook posts, LinkedIn articles) from DoomDigest, a tool designed to help users consume content more productively and efficiently. Your goal is to provide actionable insights that help users improve their reading habits, knowledge acquisition, and productivity.

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

Summaries from DoomDigest:
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
					reject(
						new Error(
							chrome.runtime.lastError.message ||
								"Unknown runtime error"
						)
					);
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

// Handle Analytics Google Drive sync
async function handleAnalyticsGoogleDriveSync(analytics) {
	const syncStartTime = Date.now();

	try {
		// Set badge to indicate sync is running
		await setSyncBadge(true);

		// Get auth token - use interactive mode to prompt for auth if needed
		const token = await new Promise((resolve, reject) => {
			chrome.identity.getAuthToken({ interactive: true }, (token) => {
				if (chrome.runtime.lastError) {
					reject(
						new Error(
							chrome.runtime.lastError.message ||
								"Unknown runtime error"
						)
					);
				} else {
					resolve(token);
				}
			});
		});

		// Sync analytics to Google Drive
		await syncAnalyticsToDrive(token, analytics);

		// Calculate sync duration
		const syncEndTime = Date.now();
		const syncDuration = syncEndTime - syncStartTime;

		// Clear badge on success
		await setSyncBadge(false);

		return {
			success: true,
			message: `Successfully synced analytics to Google Drive in ${formatDuration(
				syncDuration
			)}!`,
			duration: syncDuration,
		};
	} catch (error) {
		console.error("Analytics Google Drive sync failed:", error);

		// Calculate sync duration even on failure
		const syncEndTime = Date.now();
		const syncDuration = syncEndTime - syncStartTime;

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
					reject(
						new Error(
							chrome.runtime.lastError.message ||
								"Unknown runtime error"
						)
					);
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
						reject(
							new Error(
								chrome.runtime.lastError.message ||
									"Unknown runtime error"
							)
						);
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

// Handle syncing analytics to Google Drive
async function syncAnalyticsToDrive(token, analytics) {
	const fileName = `DoomDigest-Analytics-${
		new Date().toISOString().split("T")[0]
	}.md`;
	const markdownContent = await createAnalyticsMarkdownContent(analytics);

	try {
		// Step 1: Create or find the DoomDigest folder
		const folderId = await createOrFindDoomDigestFolder(token);

		// Step 2: Create the file metadata with parent folder
		const metadata = {
			name: fileName,
			mimeType: "text/markdown",
			description: "DoomDigest Analytics Report - Productivity analysis",
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
		console.log(
			"Analytics file created successfully in DoomDigest folder:",
			result
		);

		return {
			success: true,
			fileId: result.id,
			fileUrl: `https://drive.google.com/file/d/${result.id}/view`,
			folderId: folderId,
			message: `Successfully uploaded analytics to Google Drive: ${fileName}`,
		};
	} catch (error) {
		console.error("Analytics Drive API call failed:", error);
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

// Create analytics markdown content for Google Drive
async function createAnalyticsMarkdownContent(analytics) {
	let content = `# DoomDigest Analytics Report\n\n`;
	content += `*Generated on ${new Date(
		analytics.generatedAt
	).toLocaleString()}*\n\n`;

	// Add analytics metadata
	content += `## Report Details\n\n`;
	content += `**Analysis Period:** ${analytics.customization.duration}\n\n`;
	content += `**Analysis Depth:** ${analytics.customization.depth}\n\n`;
	content += `**Focus Areas:** ${analytics.customization.focusAreas.join(
		", "
	)}\n\n`;
	content += `**Output Format:** ${analytics.customization.format}\n\n`;
	content += `**Summaries Analyzed:** ${analytics.summaryCount}\n\n`;

	if (analytics.customization.customInstructions) {
		content += `**Custom Instructions:** ${analytics.customization.customInstructions}\n\n`;
	}

	content += `---\n\n`;

	// Add the analytics content
	content += `## Productivity Analysis\n\n`;
	content += `${analytics.content}\n\n`;

	content += `---\n\n`;
	content += `*Report generated by DoomDigest - AI-powered productivity analytics*\n`;

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
				iconUrl: chrome.runtime.getURL("icon.png"),
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
			iconUrl: chrome.runtime.getURL("icon.png"),
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
			iconUrl: chrome.runtime.getURL("icon.png"),
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
					// Send retry request to settings page (ignore if not listening)
					try {
						await chrome.runtime.sendMessage({
							type: "RETRY_EXPORT",
							format: exportRetryData.format,
						});
					} catch (retryError) {
						// Settings page not available for retry - ignoring
						console.log(
							"Settings page not available for retry - ignoring"
						);
					}
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

// Helper function to save summaries with quota management
async function saveSummariesWithQuotaManagement(summaries) {
	try {
		await chrome.storage.sync.set({ summaries: summaries });
	} catch (error) {
		if (error.message && error.message.includes("QUOTA_BYTES_PER_ITEM")) {
			console.warn(
				"Storage quota exceeded, attempting aggressive cleanup..."
			);

			// More aggressive cleanup: keep only the most recent 20 summaries
			const trimmedSummaries = summaries
				.sort((a, b) => b.timestamp - a.timestamp) // Sort by newest first
				.slice(0, 20) // Keep only 20 most recent
				.map((summary) => ({
					...summary,
					summary: summary.summary
						? summary.summary.slice(0, 2000)
						: "", // Truncate summary to 2KB max
					title: summary.title ? summary.title.slice(0, 100) : "", // Truncate title to 100 chars
					url: summary.url ? summary.url.slice(0, 500) : "", // Truncate URL to 500 chars
					originalText: summary.originalText
						? summary.originalText.slice(0, 1000)
						: undefined, // Truncate original text
				}));

			try {
				await chrome.storage.sync.set({ summaries: trimmedSummaries });
				console.log(
					"Successfully saved summaries after aggressive cleanup (kept 20 most recent, truncated content)"
				);
			} catch (retryError) {
				console.error(
					"Failed to save even after aggressive cleanup:",
					retryError
				);
				throw new Error(
					"Storage quota exceeded. Please clear some old summaries from your digest."
				);
			}
		} else {
			throw error;
		}
	}
}

function hashString(str) {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return hash.toString();
}

function normalizeText(text) {
	return text.replace(/\s+/g, " ").trim();
}

// Function to extract page content (injected into tabs)
function extractPageContent() {
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
					title: extractTitle(element),
					elementLink: extractElementLink(element),
				},
			];
		}
	}

	// Fallback: find largest text block
	const textBlocks = Array.from(document.querySelectorAll("p, div, section"))
		.map((el) => ({
			text: el.innerText.trim(),
			element: el,
			title: extractTitle(el),
			elementLink: extractElementLink(el),
		}))
		.filter((block) => {
			const wordCount = block.text.split(/\s+/).length;
			return wordCount > 50 && wordCount < 2000;
		})
		.sort((a, b) => b.text.length - a.text.length);

	return textBlocks.slice(0, 3); // Return top 3 largest blocks

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
		const dataUrl =
			el.getAttribute("data-url") || el.getAttribute("data-href");
		if (dataUrl) {
			return dataUrl;
		}

		// Fallback to current page URL
		return location.href;
	}
}

// Summarize text using available APIs
async function summarizeText(text, summaryType = "teaser") {
	try {
		// Get API provider settings
		const settings = await chrome.storage.sync.get([
			"apiProvider",
			"geminiApiKey",
			"geminiApiTested",
		]);

		const provider = settings.apiProvider || "chrome-ai";

		// Try Chrome AI Summarizer first if Chrome AI is selected
		if (provider === "chrome-ai") {
			try {
				if ("Summarizer" in self) {
					const session = await Summarizer.create({
						type: summaryType,
						format: "plain-text",
						length: "medium",
						outputLanguage: "en",
					});

					const summary = await session.summarize(text);
					await session.destroy();
					return summary;
				}
			} catch (error) {
				console.warn(
					"Chrome AI Summarizer failed, falling back to Gemini:",
					error
				);
			}
		}

		// Fallback to Gemini if available
		if (settings.geminiApiTested && settings.geminiApiKey) {
			return await summarizeWithGemini(text, summaryType);
		}

		if (provider === "gemini" && settings.geminiApiKey) {
			return await summarizeWithGemini(text, summaryType);
		}

		// If no API is available, return error
		throw new Error(
			"Summarization requires Chrome AI or Gemini API configuration."
		);
	} catch (error) {
		console.error("Error in summarizeText:", error);
		throw error;
	}
}

// Summarize text using Gemini API
async function summarizeWithGemini(text, summaryType = "teaser") {
	try {
		const apiKey = await getGeminiApiKey();
		if (!apiKey) {
			throw new Error("Gemini API key not configured");
		}

		const genAI = new GoogleGenerativeAI(apiKey);
		const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

		let prompt = "";
		switch (summaryType) {
			case "key-points":
				prompt = `Please summarize the following text by extracting the key points and main ideas. Present them as a bulleted list:

${text}

Key Points:`;
				break;
			case "headline":
				prompt = `Please create a concise headline that captures the main idea of the following text:

${text}

Headline:`;
				break;
			case "teaser":
			default:
				prompt = `Please create a brief teaser summary (2-3 sentences) that captures the essence of the following text:

${text}

Teaser Summary:`;
				break;
		}

		const result = await model.generateContent(prompt);
		const response = await result.response;
		const summary = response.text().trim();

		return summary;
	} catch (error) {
		console.error("Gemini summarize failed:", error);
		throw new Error(`Gemini summarize failed: ${error.message}`);
	}
}

// Explain text using Gemini API
async function explainWithGemini(text) {
	try {
		const apiKey = await getGeminiApiKey();
		if (!apiKey) {
			throw new Error("Gemini API key not configured");
		}

		const genAI = new GoogleGenerativeAI(apiKey);
		const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

		const prompt = `Please explain the following text in simple terms, making it easy to understand. Break down complex concepts and provide context where needed:

${text}

Explanation:`;

		const result = await model.generateContent(prompt);
		const response = await result.response;
		const explanation = response.text().trim();

		return explanation;
	} catch (error) {
		console.error("Gemini explain failed:", error);
		throw new Error(`Gemini explain failed: ${error.message}`);
	}
}
