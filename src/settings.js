// settings.js

document.addEventListener("DOMContentLoaded", function () {
	// DOM elements
	const apiProviderSelect = document.getElementById("api-provider");
	const chromeAiIndicator = document.getElementById("chrome-ai-indicator");
	const geminiSettings = document.getElementById("gemini-settings");
	const promptapiSettings = document.getElementById("promptapi-settings");
	const geminiApiKey = document.getElementById("gemini-api-key");
	const promptapiKey = document.getElementById("promptapi-key");
	const testGeminiBtn = document.getElementById("test-gemini");
	const testPromptapiBtn = document.getElementById("test-promptapi");
	const geminiTestResult = document.getElementById("gemini-test-result");
	const promptapiTestResult = document.getElementById(
		"promptapi-test-result"
	);
	const rewriterapiTestResult = document.getElementById(
		"rewriterapi-test-result"
	);
	const rewriterApiIndicator = document.getElementById(
		"rewriter-api-indicator"
	);
	const promptApiIndicator = document.getElementById("prompt-api-indicator");
	const downloadChromeAiBtn = document.getElementById("download-chrome-ai");
	const downloadRewriterApiBtn = document.getElementById(
		"download-rewriter-api"
	);
	const downloadPromptApiBtn = document.getElementById("download-prompt-api");
	const defaultSummaryType = document.getElementById("default-summary-type");
	const autoSummarize = document.getElementById("auto-summarize");
	const smartTopics = document.getElementById("smart-topics");
	const showAdvancedAiStatus = document.getElementById(
		"show-advanced-ai-status"
	);

	// Export buttons
	const exportTxtBtn = document.getElementById("export-txt");
	const exportMdBtn = document.getElementById("export-md");
	const exportJsonBtn = document.getElementById("export-json");
	const exportPdfBtn = document.getElementById("export-pdf");

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
	downloadRewriterApiBtn.addEventListener("click", downloadRewriterAPIModel);
	downloadPromptApiBtn.addEventListener("click", downloadPromptAPIModel);

	// Setting changes
	geminiApiKey.addEventListener("input", saveSettings);
	defaultSummaryType.addEventListener("change", saveSettings);
	autoSummarize.addEventListener("change", saveSettings);
	smartTopics.addEventListener("change", saveSettings);
	showAdvancedAiStatus.addEventListener("change", function () {
		toggleApiSettings(apiProviderSelect.value);
		saveSettings();
	});

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
	exportPdfBtn.addEventListener("click", () => exportDigest("pdf"));

	// Initialize
	checkAllAPIStatuses();

	async function checkAllAPIStatuses() {
		// Check all API statuses concurrently
		const [chromeAIStatus, rewriterStatus, promptStatus] =
			await Promise.all([
				checkAPIStatus("summarizer"),
				checkAPIStatus("rewriter"),
				checkAPIStatus("prompt"),
			]);

		// Update all indicators at once
		updateStatusIndicator(
			chromeAiIndicator,
			chromeAIStatus,
			downloadChromeAiBtn
		);
		updateStatusIndicator(
			rewriterApiIndicator,
			rewriterStatus,
			downloadRewriterApiBtn
		);
		updateStatusIndicator(
			promptApiIndicator,
			promptStatus,
			downloadPromptApiBtn
		);
	}

	function loadSettings() {
		chrome.storage.sync.get(
			[
				"apiProvider",
				"geminiApiKey",
				"defaultSummaryType",
				"autoSummarize",
				"smartTopics",
				"showAdvancedAiStatus",
				"geminiApiTested",
			],
			function (result) {
				apiProviderSelect.value = result.apiProvider || "chrome-ai";
				geminiApiKey.value = result.geminiApiKey || "";
				defaultSummaryType.value =
					result.defaultSummaryType || "key-points";
				autoSummarize.checked = result.autoSummarize !== false;
				smartTopics.checked = result.smartTopics !== false;
				showAdvancedAiStatus.checked =
					result.showAdvancedAiStatus || false;

				// If Gemini API has been tested successfully, prioritize it
				if (result.geminiApiTested && result.geminiApiKey) {
					apiProviderSelect.value = "gemini";
				}

				// Apply settings after loading
				toggleApiSettings(apiProviderSelect.value);
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
			showAdvancedAiStatus: showAdvancedAiStatus.checked,
		};

		chrome.storage.sync.set(settings);
	}

	function toggleApiSettings(provider) {
		// Always show Chrome AI status panels for reference
		document.getElementById("chrome-ai-status").style.display = "block";
		document.getElementById("show-advanced-status").style.display = "block";

		// Show advanced AI status panels when toggle is checked (regardless of provider)
		const showAdvanced = showAdvancedAiStatus.checked;
		document.getElementById("rewriter-api-status").style.display =
			showAdvanced ? "block" : "none";
		document.getElementById("prompt-api-status").style.display =
			showAdvanced ? "block" : "none";

		// Show Gemini settings when Gemini is selected OR when API key exists
		const hasGeminiKey = geminiApiKey.value.trim().length > 0;
		geminiSettings.style.display =
			provider === "gemini" || hasGeminiKey ? "block" : "none";
	}

	async function checkChromeAIStatus() {
		const status = await checkAPIStatus("summarizer");
		updateStatusIndicator(chromeAiIndicator, status, downloadChromeAiBtn);
	}

	async function checkRewriterAPIStatus() {
		const status = await checkAPIStatus("rewriter");
		updateStatusIndicator(
			rewriterApiIndicator,
			status,
			downloadRewriterApiBtn
		);
	}

	async function checkPromptAPIStatus() {
		const status = await checkAPIStatus("prompt");
		updateStatusIndicator(promptApiIndicator, status, downloadPromptApiBtn);
	}

	// Unified API status checker
	async function checkAPIStatus(apiType) {
		try {
			let availability;

			switch (apiType) {
				case "summarizer":
					// Try modern surface first, then fallback to global Summarizer
					if ("Summarizer" in self) {
						availability = await self.Summarizer.availability();
					} else if (
						typeof Summarizer !== "undefined" &&
						typeof Summarizer.availability === "function"
					) {
						availability = await Summarizer.availability();
					} else {
						return "unavailable";
					}
					break;
				// Normalize: available -> readily, downloadable -> after-download
				case "rewriter":
					// Prefer modern surface: self.ai.writer, but fall back to global Rewriter if present
					if (
						"ai" in self &&
						self.ai &&
						"writer" in self.ai &&
						typeof self.ai.writer.availability === "function"
					) {
						availability = await self.ai.writer.availability();
					} else if (
						typeof Rewriter !== "undefined" &&
						typeof Rewriter.availability === "function"
					) {
						availability = await Rewriter.availability();
					} else {
						return "unavailable";
					}
					break;
				case "prompt":
					// Prefer modern surface: self.ai.languageModel, but fall back to global LanguageModel if present
					if (
						"ai" in self &&
						self.ai &&
						"languageModel" in self.ai &&
						typeof self.ai.languageModel.availability === "function"
					) {
						availability =
							await self.ai.languageModel.availability();
					} else if (
						typeof LanguageModel !== "undefined" &&
						typeof LanguageModel.availability === "function"
					) {
						availability = await LanguageModel.availability();
					} else {
						return "unavailable";
					}
					break;
				default:
					return "unavailable";
			}

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
		} catch (e) {
			console.error(`${apiType} API check failed:`, e);
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

	async function downloadRewriterAPIModel() {
		await downloadAPIModel(
			"rewriter",
			downloadRewriterApiBtn,
			rewriterApiIndicator,
			checkRewriterAPIStatus
		);
	}

	async function downloadPromptAPIModel() {
		await downloadAPIModel(
			"prompt",
			downloadPromptApiBtn,
			promptApiIndicator,
			checkPromptAPIStatus
		);
	}

	// Unified API model downloader
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

			let instance;

			switch (apiType) {
				case "summarizer":
					instance = await self.Summarizer.create({
						type: "key-points",
						format: "plain-text",
						length: "medium",
						monitor(m) {
							m.addEventListener("downloadprogress", (e) => {
								console.log(
									`Summarizer downloaded ${e.loaded * 100}%`
								);
							});
						},
					});
					break;

				case "rewriter":
					instance = await self.ai.writer.create({
						monitor(m) {
							m.addEventListener("downloadprogress", (e) => {
								console.log(
									`Rewriter downloaded ${e.loaded * 100}%`
								);
							});
						},
					});
					break;

				case "prompt":
					instance = await self.ai.languageModel.create({
						monitor(m) {
							m.addEventListener("downloadprogress", (e) => {
								console.log(
									`Language Model downloaded ${
										e.loaded * 100
									}%`
								);
							});
						},
					});
					break;
			}

			// Check status again after a short delay to see if download completed
			setTimeout(() => {
				checkAllAPIStatuses();
			}, 2000);
		} catch (e) {
			console.error(`${apiType} API download failed:`, e);
			alert("Download failed: " + e.message);
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
			const { GoogleGenerativeAI } = await import(
				"@google/generative-ai"
			);

			const genAI = new GoogleGenerativeAI(apiKey);
			const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

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
				alert("No summaries to export");
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
		} catch (e) {
			console.error("Export failed:", e);
			alert("Export failed: " + e.message);
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
	}
});
