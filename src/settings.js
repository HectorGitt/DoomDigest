// settings.js
import { GoogleGenerativeAI } from "@google/generative-ai";

async function loadComponents() {
	// Load toast and modal components
	const extensionId = chrome.runtime.id;
	await loadScript(`chrome-extension://${extensionId}/toast.js`);
	await loadScript(`chrome-extension://${extensionId}/modal.js`);
}

function loadScript(src) {
	return new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src = src;
		script.onload = resolve;
		script.onerror = reject;
		document.head.appendChild(script);
	});
}

document.addEventListener("DOMContentLoaded", async function () {
	await loadComponents();
	// DOM elements
	const apiProviderSelect = document.getElementById("api-provider");
	const chromeAiIndicator = document.getElementById("chrome-ai-indicator");
	const rewriterApiIndicator = document.getElementById(
		"rewriter-api-indicator"
	);
	const promptApiIndicator = document.getElementById("prompt-api-indicator");
	const geminiSettings = document.getElementById("gemini-settings");
	const geminiApiKey = document.getElementById("gemini-api-key");
	const testGeminiBtn = document.getElementById("test-gemini");
	const geminiTestResult = document.getElementById("gemini-test-result");
	const downloadChromeAiBtn = document.getElementById("download-chrome-ai");
	const defaultSummaryType = document.getElementById("default-summary-type");
	const autoSummarize = document.getElementById("auto-summarize");
	const smartTopics = document.getElementById("smart-topics");
	const autoSnapEnabled = document.getElementById("auto-snap-enabled");
	const autoSnapDuration = document.getElementById("auto-snap-duration");
	const autoSnapDurationGroup = document.getElementById(
		"auto-snap-duration-group"
	);
	const showAdvancedAiStatus = document.getElementById(
		"show-advanced-ai-status"
	);

	// Auto-sync frequency
	const autoSyncFrequency = document.getElementById("auto-sync-frequency");

	// Export buttons
	const exportTxtBtn = document.getElementById("export-txt");
	const exportMdBtn = document.getElementById("export-md");
	const exportJsonBtn = document.getElementById("export-json");

	// Remove key button
	const removeGeminiKeyBtn = document.getElementById("remove-gemini-key");

	// Google Drive buttons
	const connectGoogleDriveBtn = document.getElementById(
		"connect-google-drive"
	);
	const syncGoogleDriveBtn = document.getElementById("sync-google-drive");
	const removeGoogleDriveBtn = document.getElementById("remove-google-drive");
	const googleDriveStatus = document.getElementById("google-drive-status");
	const lastSyncInfo = document.getElementById("last-sync-info");
	const lastSyncText = document.getElementById("last-sync-text");

	// Auto-sync day pickers
	const weeklySyncSettings = document.getElementById("weekly-sync-settings");
	const monthlySyncSettings = document.getElementById(
		"monthly-sync-settings"
	);
	const weeklySyncDay = document.getElementById("weekly-sync-day");
	const monthlySyncDay = document.getElementById("monthly-sync-day");

	// Notification settings
	const enableAiNotifications = document.getElementById(
		"enable-ai-notifications"
	);
	const enableExportNotifications = document.getElementById(
		"enable-export-notifications"
	);
	const enableSyncIndicators = document.getElementById(
		"enable-sync-indicators"
	);

	// Load saved settings
	loadSettings();

	// API Provider selection
	apiProviderSelect.addEventListener("change", function () {
		const provider = this.value;
		toggleApiSettings(provider);
		saveSettings();
	});

	// Test buttons
	testGeminiBtn.addEventListener("click", testGeminiAPI);

	// Download buttons
	downloadChromeAiBtn.addEventListener("click", downloadChromeAIModel);

	// Setting changes
	geminiApiKey.addEventListener("input", saveSettings);
	defaultSummaryType.addEventListener("change", saveSettings);
	autoSummarize.addEventListener("change", saveSettings);
	smartTopics.addEventListener("change", saveSettings);
	autoSnapEnabled.addEventListener("change", function () {
		toggleAutoSnapDuration();
		saveSettings();
	});
	autoSnapDuration.addEventListener("change", saveSettings);
	showAdvancedAiStatus.addEventListener("change", function () {
		toggleApiSettings(apiProviderSelect.value);
		saveSettings();
	});

	// Auto-sync frequency
	autoSyncFrequency.addEventListener("change", function () {
		toggleSyncDayPickers(this.value);
		saveSettings();
		updateAutoSyncSchedule(this.value);
	});

	// Auto-sync day pickers
	weeklySyncDay.addEventListener("change", saveSettings);
	monthlySyncDay.addEventListener("change", saveSettings);

	// Notification settings
	enableAiNotifications.addEventListener("change", saveSettings);
	enableExportNotifications.addEventListener("change", saveSettings);
	enableSyncIndicators.addEventListener("change", saveSettings);

	// Clear Gemini tested status when API key changes
	geminiApiKey.addEventListener("input", () => {
		if (geminiApiKey.value.trim() !== "") {
			chrome.storage.sync.remove(["geminiApiTested"]);
		}
	});

	// Export buttons
	exportTxtBtn.addEventListener("click", () => exportDigest("txt"));
	exportMdBtn.addEventListener("click", () => exportDigest("md"));
	exportJsonBtn.addEventListener("click", () => exportDigest("json"));

	// Remove key button
	removeGeminiKeyBtn.addEventListener("click", removeGeminiKey);

	// Google Drive buttons
	connectGoogleDriveBtn.addEventListener("click", connectGoogleDrive);
	syncGoogleDriveBtn.addEventListener("click", syncToGoogleDrive);
	removeGoogleDriveBtn.addEventListener("click", removeGoogleDrive);

	// Initialize
	checkAllAPIStatuses();

	function toggleSyncDayPickers(frequency) {
		weeklySyncSettings.style.display =
			frequency === "weekly" ? "flex" : "none";
		monthlySyncSettings.style.display =
			frequency === "monthly" ? "flex" : "none";
	}

	function toggleAutoSnapDuration() {
		autoSnapDurationGroup.style.display = autoSnapEnabled.checked
			? "block"
			: "none";
	}

	async function checkAllAPIStatuses() {
		// Check Chrome AI status
		const chromeAIStatus = await checkAPIStatus("summarizer");
		const rewriterAIStatus = await checkAPIStatus("rewriter");
		const promptAIStatus = await checkAPIStatus("prompt");

		// Update indicators
		updateStatusIndicator(
			chromeAiIndicator,
			chromeAIStatus,
			downloadChromeAiBtn
		);
		updateStatusIndicator(rewriterApiIndicator, rewriterAIStatus);
		updateStatusIndicator(promptApiIndicator, promptAIStatus);
	}

	function loadSettings() {
		chrome.storage.sync.get(
			[
				"apiProvider",
				"geminiApiKey",
				"defaultSummaryType",
				"autoSummarize",
				"smartTopics",
				"autoSnapEnabled",
				"autoSnapDuration",
				"showAdvancedAiStatus",
				"geminiApiTested",
				"googleDriveConnected",
				"autoSyncFrequency",
				"weeklySyncDay",
				"monthlySyncDay",
				"enableAiNotifications",
				"enableExportNotifications",
				"enableSyncIndicators",
			],
			function (result) {
				apiProviderSelect.value = result.apiProvider || "chrome-ai";
				geminiApiKey.value = result.geminiApiKey || "";
				defaultSummaryType.value =
					result.defaultSummaryType || "teasers";
				autoSummarize.checked = result.autoSummarize !== false;
				smartTopics.checked = result.smartTopics !== false;
				autoSnapEnabled.checked = result.autoSnapEnabled || false;
				autoSnapDuration.value = result.autoSnapDuration || "15";
				showAdvancedAiStatus.checked =
					result.showAdvancedAiStatus || false;

				// Auto-sync frequency
				autoSyncFrequency.value =
					result.autoSyncFrequency || "disabled";

				// Auto-sync day preferences
				weeklySyncDay.value = result.weeklySyncDay || "1"; // Default to Monday
				monthlySyncDay.value = result.monthlySyncDay || "1"; // Default to 1st

				// Notification settings
				enableAiNotifications.checked =
					result.enableAiNotifications !== false;
				enableExportNotifications.checked =
					result.enableExportNotifications !== false;
				enableSyncIndicators.checked =
					result.enableSyncIndicators !== false;

				// If Gemini API has been tested successfully, prioritize it
				if (result.geminiApiTested && result.geminiApiKey) {
					apiProviderSelect.value = "gemini";
				}

				// Google Drive connection status
				if (result.googleDriveConnected) {
					connectGoogleDriveBtn.style.display = "none";
					syncGoogleDriveBtn.style.display = "inline-block";
					removeGoogleDriveBtn.style.display = "inline-block";
					googleDriveStatus.style.display = "inline-block";
				}

				// Apply settings after loading
				toggleApiSettings(apiProviderSelect.value);
				toggleSyncDayPickers(autoSyncFrequency.value);
				toggleAutoSnapDuration();
			}
		);
	}

	function saveSettings() {
		const settings = {
			apiProvider: apiProviderSelect.value,
			geminiApiKey: geminiApiKey.value,
			defaultSummaryType: defaultSummaryType.value,
			autoSummarize: autoSummarize.checked,
			smartTopics: smartTopics.checked,
			autoSnapEnabled: autoSnapEnabled.checked,
			autoSnapDuration: autoSnapDuration.value,
			showAdvancedAiStatus: showAdvancedAiStatus.checked,
			autoSyncFrequency: autoSyncFrequency.value,
			weeklySyncDay: weeklySyncDay.value,
			monthlySyncDay: monthlySyncDay.value,
			enableAiNotifications: enableAiNotifications.checked,
			enableExportNotifications: enableExportNotifications.checked,
			enableSyncIndicators: enableSyncIndicators.checked,
		};

		chrome.storage.sync.set(settings);
	}

	function toggleApiSettings(provider) {
		// Always show Chrome AI status panels for reference
		document.getElementById("chrome-ai-status").style.display = "block";
		document.getElementById("show-advanced-status").style.display = "none"; // Hide advanced status since we removed experimental APIs

		// Show Gemini settings when Gemini is selected OR when API key exists
		const hasGeminiKey = geminiApiKey.value.trim().length > 0;
		geminiSettings.style.display =
			provider === "gemini" || hasGeminiKey ? "block" : "none";
	}

	async function checkChromeAIStatus() {
		const status = await checkAPIStatus("summarizer");
		updateStatusIndicator(chromeAiIndicator, status, downloadChromeAiBtn);
	}

	// API status checker
	async function checkAPIStatus(apiType) {
		try {
			let apiConstructor;
			if (apiType === "summarizer") {
				apiConstructor = Summarizer;
			} else if (apiType === "rewriter") {
				apiConstructor = Rewriter;
			} else if (apiType === "prompt") {
				apiConstructor = LanguageModel;
			} else {
				return "unavailable";
			}

			return await checkChromeAIAvailability(apiConstructor);
		} catch (e) {
			console.error(`${apiType} API check failed:`, e);
			return "error";
		}
	}

	// Shared Chrome AI availability checker
	async function checkChromeAIAvailability(apiConstructor) {
		try {
			// Try modern surface first, then fallback to global
			if (apiConstructor.name in self) {
				const availability = await self[
					apiConstructor.name
				].availability();
				switch (availability) {
					case "available":
						return "readily";
					case "downloading":
						return "downloading";
					case "downloadable":
						return "after-download";
					default:
						return "no";
				}
			} else if (
				typeof apiConstructor !== "undefined" &&
				typeof apiConstructor.availability === "function"
			) {
				const availability = await apiConstructor.availability();
				switch (availability) {
					case "available":
						return "readily";
					case "downloading":
						return "downloading";
					case "downloadable":
						return "after-download";
					default:
						return "no";
				}
			} else {
				return "unavailable";
			}
		} catch (e) {
			console.error(
				`${apiConstructor.name} availability check failed:`,
				e
			);
			return "error";
		}
	}

	// Unified status indicator updater
	function updateStatusIndicator(indicator, status, downloadBtn) {
		let text, cssClass, showDownload;

		switch (status) {
			case "readily":
				text = "Ready";
				cssClass = "ready";
				showDownload = false;
				break;
			case "after-download":
				text = "Download Available";
				cssClass = "downloadable";
				showDownload = true;
				break;
			case "downloading":
				text = "Downloading Model";
				cssClass = "downloading";
				showDownload = false;
				break;
			case "no":
			case "unavailable":
				text = "Unavailable";
				cssClass = "unavailable";
				showDownload = false;
				break;
			case "error":
			default:
				text = "Error";
				cssClass = "error";
				showDownload = false;
		}

		indicator.className = `status-indicator ${cssClass}`;
		indicator.textContent = text;
		if (downloadBtn) {
			downloadBtn.style.display = showDownload ? "inline-block" : "none";
		}
	}

	async function downloadChromeAIModel() {
		await downloadAPIModel(
			"summarizer",
			downloadChromeAiBtn,
			chromeAiIndicator,
			checkChromeAIStatus
		);
	}

	// API model downloader
	async function downloadAPIModel(
		apiType,
		downloadBtn,
		indicator,
		statusChecker
	) {
		try {
			downloadBtn.disabled = true;
			downloadBtn.textContent = "Downloading...";

			indicator.textContent = "Downloading...";
			indicator.className = "status-indicator downloading";

			if (apiType === "summarizer") {
				const instance = await self.Summarizer.create({
					type: "teasers",
					format: "plain-text",
					length: "medium",
					outputLanguage: "en",
					expectedInputLanguages: ["en", "ja", "es"],
					expectedContextLanguages: ["en"],
					monitor(m) {
						m.addEventListener("downloadprogress", (e) => {
							console.log(
								`Summarizer downloaded ${e.loaded * 100}%`
							);
						});
					},
				});
			}

			// Check status again after a short delay to see if download completed
			setTimeout(() => {
				checkAllAPIStatuses();
			}, 2000);
		} catch (e) {
			console.error(`${apiType} API download failed:`, e);
			toast.error("Download failed: " + e.message);
			// Reset all statuses on error
			checkAllAPIStatuses();
		} finally {
			downloadBtn.disabled = false;
			downloadBtn.textContent = "Download";
		}
	}

	async function testGeminiAPI() {
		const apiKey = geminiApiKey.value.trim();
		if (!apiKey) {
			showTestResult(
				geminiTestResult,
				"Please enter an API key",
				"error"
			);
			return;
		}

		testGeminiBtn.disabled = true;
		testGeminiBtn.textContent = "Testing...";

		try {
			const genAI = new GoogleGenerativeAI(apiKey);
			const model = genAI.getGenerativeModel({
				model: "gemini-2.5-flash",
			});

			const result = await model.generateContent("Hello, test message");
			const response = await result.response;
			const text = response.text();

			if (text) {
				showTestResult(geminiTestResult, "API key is valid", "success");
				// Mark Gemini API as tested successfully and switch to Gemini
				chrome.storage.sync.set({ geminiApiTested: true }, () => {
					// Automatically switch to Gemini provider
					apiProviderSelect.value = "gemini";
					saveSettings();
					toggleApiSettings("gemini");
				});
			} else {
				showTestResult(
					geminiTestResult,
					"Invalid response from API",
					"error"
				);
			}
		} catch (e) {
			showTestResult(
				geminiTestResult,
				`API test failed: ${e.message}`,
				"error"
			);
			// Clear tested status on failure
			chrome.storage.sync.remove(["geminiApiTested"]);
		} finally {
			testGeminiBtn.disabled = false;
			testGeminiBtn.textContent = "Test";
		}
	}

	function showTestResult(element, message, type) {
		element.className = `api-test-result ${type}`;
		element.textContent = message;
	}

	function removeGeminiKey() {
		geminiApiKey.value = "";
		saveSettings();
		// Clear tested status
		chrome.storage.sync.remove(["geminiApiTested"]);
		// Update UI
		toggleApiSettings(apiProviderSelect.value);
	}

	async function exportDigest(format) {
		try {
			// Get current summaries from sidebar
			const response = await chrome.runtime.sendMessage({
				type: "GET_SUMMARIES_FOR_EXPORT",
			});

			if (
				!response ||
				!response.summaries ||
				response.summaries.length === 0
			) {
				toast.error("No summaries to export");
				return;
			}

			const summaries = response.summaries;
			let content, filename, mimeType;

			switch (format) {
				case "txt":
					content = exportAsText(summaries);
					filename = "doomdigest-export.txt";
					mimeType = "text/plain";
					break;
				case "md":
					content = exportAsMarkdown(summaries);
					filename = "doomdigest-export.md";
					mimeType = "text/markdown";
					break;
				case "json":
					content = JSON.stringify(summaries, null, 2);
					filename = "doomdigest-export.json";
					mimeType = "application/json";
					break;
				case "pdf":
					await exportAsPDF(summaries);
					return; // PDF export handles download internally
			}

			// Download the file
			const blob = new Blob([content], { type: mimeType });
			const url = URL.createObjectURL(blob);

			chrome.downloads.download({
				url: url,
				filename: filename,
				saveAs: true,
			});

			URL.revokeObjectURL(url);

			// Show success notification for export
			await chrome.runtime.sendMessage({
				type: "SHOW_TOAST_NOTIFICATION",
				title: "Export Complete",
				message: `Digest exported as ${format.toUpperCase()} file`,
			});
		} catch (e) {
			console.error("Export failed:", e);
			toast.error("Export failed: " + e.message);

			// Show failure notification with retry option
			await chrome.runtime.sendMessage({
				type: "SHOW_EXPORT_FAILURE_NOTIFICATION",
				format: format,
			});
		}
	}

	function exportAsText(summaries) {
		let text = "DoomDigest Export\n";
		text += "=".repeat(50) + "\n\n";

		summaries.forEach((summary, index) => {
			text += `${index + 1}. ${summary.title}\n`;
			text += `URL: ${summary.url}\n`;
			text += `Time: ${new Date(summary.timestamp).toLocaleString()}\n\n`;
			text += `${summary.summary}\n\n`;
			text += "-".repeat(50) + "\n\n";
		});

		return text;
	}

	function exportAsMarkdown(summaries) {
		let md = "# DoomDigest Export\n\n";

		summaries.forEach((summary, index) => {
			md += `## ${index + 1}. ${summary.title}\n\n`;
			md += `**URL:** ${summary.url}\n\n`;
			md += `**Time:** ${new Date(
				summary.timestamp
			).toLocaleString()}\n\n`;
			md += `${summary.summary}\n\n`;
			md += "---\n\n";
		});

		return md;
	}

	async function exportAsPDF(summaries) {
		// For PDF export, we'll use a simple HTML-to-PDF approach
		// In a real implementation, you'd want to use a proper PDF library

		let html = `
            <html>
            <head>
                <title>DoomDigest Export</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    h1 { color: #2563eb; }
                    .summary { margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
                    .title { font-weight: bold; font-size: 16px; }
                    .url { color: #666; font-size: 12px; }
                    .time { color: #666; font-size: 12px; }
                </style>
            </head>
            <body>
                <h1>DoomDigest Export</h1>
        `;

		summaries.forEach((summary, index) => {
			html += `
                <div class="summary">
                    <div class="title">${index + 1}. ${summary.title}</div>
                    <div class="url">URL: ${summary.url}</div>
                    <div class="time">Time: ${new Date(
						summary.timestamp
					).toLocaleString()}</div>
                    <p>${summary.summary}</p>
                </div>
            `;
		});

		html += "</body></html>";

		// Create a blob and download as HTML (since we don't have PDF libraries)
		// In production, you'd use jsPDF or similar
		const blob = new Blob([html], { type: "text/html" });
		const url = URL.createObjectURL(blob);

		chrome.downloads.download({
			url: url,
			filename: "doomdigest-export.html",
			saveAs: true,
		});

		URL.revokeObjectURL(url);

		// Show success notification for PDF export
		await chrome.runtime.sendMessage({
			type: "SHOW_TOAST_NOTIFICATION",
			title: "Export Complete",
			message: "Digest exported as HTML file",
		});
	}

	async function connectGoogleDrive() {
		try {
			connectGoogleDriveBtn.disabled = true;
			connectGoogleDriveBtn.textContent = "Connecting...";

			// Send connect request to background script
			const connectResponse = await chrome.runtime.sendMessage({
				type: "CONNECT_GOOGLE_DRIVE",
			});

			if (connectResponse.success) {
				// Store connection status
				chrome.storage.sync.set({ googleDriveConnected: true });

				// Update UI
				connectGoogleDriveBtn.style.display = "none";
				syncGoogleDriveBtn.style.display = "inline-block";
				removeGoogleDriveBtn.style.display = "inline-block";
				googleDriveStatus.style.display = "inline-block";

				toast.success("Successfully connected to Google Drive!");
			} else {
				toast.error(connectResponse.error);
			}
		} catch (error) {
			console.error("Google Drive connection failed:", error);
			toast.error("Failed to connect to Google Drive: " + error.message);
		} finally {
			connectGoogleDriveBtn.disabled = false;
			connectGoogleDriveBtn.textContent = "Connect";
		}
	}

	async function syncToGoogleDrive() {
		try {
			syncGoogleDriveBtn.disabled = true;
			syncGoogleDriveBtn.textContent = "Syncing...";

			// Get summaries
			const response = await chrome.runtime.sendMessage({
				type: "GET_SUMMARIES_FOR_EXPORT",
			});

			if (
				!response ||
				!response.summaries ||
				response.summaries.length === 0
			) {
				toast.error("No summaries to sync");
				return;
			}

			const summaries = response.summaries;

			// Send sync request to background script
			await chrome.runtime.sendMessage({
				type: "SYNC_TO_GOOGLE_DRIVE",
				summaries: summaries,
			});

			// The result will come via SYNC_COMPLETED message
		} catch (error) {
			console.error("Google Drive sync failed:", error);
			toast.error("Failed to start sync: " + error.message);
			syncGoogleDriveBtn.disabled = false;
			syncGoogleDriveBtn.textContent = "Sync Digest";
		}
	}

	async function removeGoogleDrive() {
		try {
			removeGoogleDriveBtn.disabled = true;
			removeGoogleDriveBtn.textContent = "Removing...";

			// Send remove request to background script
			await chrome.runtime.sendMessage({
				type: "REMOVE_GOOGLE_DRIVE",
			});

			// The result will come via REMOVE_COMPLETED message
		} catch (error) {
			console.error("Google Drive removal failed:", error);
			toast.error("Failed to start removal: " + error.message);
			removeGoogleDriveBtn.disabled = false;
			removeGoogleDriveBtn.textContent = "Remove";
		}
	}

	async function updateAutoSyncSchedule(frequency) {
		try {
			// Clear any existing auto-sync alarm
			await chrome.runtime.sendMessage({
				type: "CLEAR_AUTO_SYNC_ALARM",
			});

			// Set up new alarm if frequency is not disabled
			if (frequency !== "disabled") {
				const alarmInfo = getAlarmInfo(
					frequency,
					weeklySyncDay.value,
					monthlySyncDay.value
				);
				await chrome.runtime.sendMessage({
					type: "SET_AUTO_SYNC_ALARM",
					alarmInfo: alarmInfo,
				});
			}
		} catch (error) {
			console.error("Failed to update auto-sync schedule:", error);
		}
	}

	function getAlarmInfo(frequency, weeklyDay, monthlyDay) {
		const now = new Date();

		switch (frequency) {
			case "minute":
				return {
					name: "autoSync",
					delayInMinutes: 1,
					periodInMinutes: 1,
				};
			case "weekly":
				// Calculate delay until next occurrence of selected day of week
				const targetDayOfWeek = parseInt(weeklyDay);
				const currentDayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
				let daysUntilTarget = targetDayOfWeek - currentDayOfWeek;

				if (daysUntilTarget <= 0) {
					daysUntilTarget += 7; // Next week if today or past
				}

				const nextSyncTime = new Date(now);
				nextSyncTime.setDate(now.getDate() + daysUntilTarget);
				nextSyncTime.setHours(9, 0, 0, 0); // Set to 9:00 AM

				// If the target time has already passed today, move to next week
				if (daysUntilTarget === 0 && now >= nextSyncTime) {
					nextSyncTime.setDate(nextSyncTime.getDate() + 7);
				}

				const delayInMinutes = Math.ceil(
					(nextSyncTime - now) / (1000 * 60)
				);

				return {
					name: "autoSync",
					delayInMinutes: delayInMinutes,
					periodInMinutes: 7 * 24 * 60, // Weekly
				};
			case "monthly":
				// Calculate delay until next occurrence of selected day of month
				const targetDayOfMonth = parseInt(monthlyDay);
				const currentDayOfMonth = now.getDate();
				const currentMonth = now.getMonth();
				const currentYear = now.getFullYear();

				let targetMonth = currentMonth;
				let targetYear = currentYear;

				// If target day has passed this month, move to next month
				if (currentDayOfMonth > targetDayOfMonth) {
					targetMonth++;
					if (targetMonth > 11) {
						targetMonth = 0;
						targetYear++;
					}
				}

				const nextMonthlySyncTime = new Date(
					targetYear,
					targetMonth,
					targetDayOfMonth,
					9,
					0,
					0,
					0
				);

				// Handle invalid dates (e.g., February 31st becomes March 1st or 3rd)
				if (nextMonthlySyncTime.getDate() !== targetDayOfMonth) {
					// Date was invalid, use the last day of the month
					nextMonthlySyncTime.setMonth(targetMonth + 1, 0); // Last day of target month
				}

				const monthlyDelayInMinutes = Math.ceil(
					(nextMonthlySyncTime - now) / (1000 * 60)
				);

				return {
					name: "autoSync",
					delayInMinutes: monthlyDelayInMinutes,
					periodInMinutes: 30 * 24 * 60, // Approximate monthly
				};
			default:
				return null;
		}
	}

	// Handle messages from background script
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (message.type === "RETRY_EXPORT") {
			// Retry the export with the specified format
			exportDigest(message.format);
			return true;
		} else if (message.type === "SYNC_COMPLETED") {
			if (message.result && message.result.success) {
				toast.success(message.result.message);
				// Refresh last sync info
				loadLastSyncInfo();
			} else {
				// Clear connection status on auth errors
				if (
					message.result &&
					message.result.error &&
					(message.result.error.includes("access_denied") ||
						message.result.error.includes("invalid_grant"))
				) {
					chrome.storage.sync.remove(["googleDriveConnected"], () => {
						// Reset UI to show connect button
						connectGoogleDriveBtn.style.display = "inline-block";
						syncGoogleDriveBtn.style.display = "none";
						removeGoogleDriveBtn.style.display = "none";
						googleDriveStatus.style.display = "none";
					});
				}
				toast.error(
					message.result?.error || "Failed to sync to Google Drive"
				);
			}
			// Re-enable button
			syncGoogleDriveBtn.disabled = false;
			syncGoogleDriveBtn.textContent = "Sync Digest";
			return true;
		} else if (message.type === "REMOVE_COMPLETED") {
			if (message.result && message.result.success) {
				// Clear connection status
				chrome.storage.sync.remove(["googleDriveConnected"]);

				// Update UI
				connectGoogleDriveBtn.style.display = "inline-block";
				syncGoogleDriveBtn.style.display = "none";
				removeGoogleDriveBtn.style.display = "none";
				googleDriveStatus.style.display = "none";

				toast.success("Successfully disconnected from Google Drive!");
			} else {
				toast.error(
					message.result?.error ||
						"Failed to disconnect from Google Drive"
				);
			}
			// Re-enable button
			removeGoogleDriveBtn.disabled = false;
			removeGoogleDriveBtn.textContent = "Remove";
			return true;
		}
	});

	// Load and display last sync information
	loadLastSyncInfo();

	async function loadLastSyncInfo() {
		try {
			const result = await chrome.storage.sync.get([
				"lastSyncTime",
				"lastSyncDuration",
				"lastSyncFailed",
			]);
			if (result.lastSyncTime) {
				const syncDate = new Date(result.lastSyncTime).toLocaleString();
				const syncDuration = result.lastSyncDuration
					? formatDuration(result.lastSyncDuration)
					: "Unknown";
				const status = result.lastSyncFailed ? " (Failed)" : "";

				lastSyncText.textContent = `Last sync: ${syncDate} (${syncDuration})${status}`;
				lastSyncInfo.style.display = "block";
			} else {
				lastSyncInfo.style.display = "none";
			}
		} catch (error) {
			console.error("Failed to load last sync info:", error);
			lastSyncInfo.style.display = "none";
		}
	}

	// Helper function to format duration
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
});
