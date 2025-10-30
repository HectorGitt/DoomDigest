import { GoogleGenerativeAI } from "@google/generative-ai";
import { marked } from "marked";
import DOMPurify from "dompurify";

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
	const backToSettingsBtn = document.getElementById("back-to-settings");
	const timePeriodSelect = document.getElementById("time-period");
	const dateRangeDiv = document.getElementById("date-range");
	const startDateInput = document.getElementById("start-date");
	const endDateInput = document.getElementById("end-date");
	const analysisDurationSelect = document.getElementById("analysis-duration");
	const autoRunAnalyticsCheckbox =
		document.getElementById("auto-run-analytics");
	const generateAnalyticsBtn = document.getElementById("generate-analytics");
	const analyticsResults = document.getElementById("analytics-results");
	const analyticsContent = document.getElementById("analytics-content");
	const generatedDateSpan = document.getElementById("generated-date");
	const saveAnalyticsBtn = document.getElementById("save-analytics");
	const exportAnalyticsBtn = document.getElementById("export-analytics");
	const copyAnalyticsBtn = document.getElementById("copy-analytics");
	const syncAnalyticsDriveBtn = document.getElementById(
		"sync-analytics-drive"
	);
	const savedAnalytics = document.getElementById("saved-analytics");
	const savedReportsList = document.getElementById("saved-reports-list");

	// Modal elements
	const reportModal = document.getElementById("report-modal");
	const modalTitle = document.getElementById("modal-title");
	const modalGeneratedDate = document.getElementById("modal-generated-date");
	const modalContent = document.getElementById("modal-content");
	const closeModalBtn = document.getElementById("close-modal");

	// Customization elements
	const analysisDepth = document.getElementById("analysis-depth");
	const focusAreas = document.getElementById("focus-areas");
	const outputFormat = document.getElementById("output-format");
	const customPrompt = document.getElementById("custom-prompt");

	// Navigation
	backToSettingsBtn.addEventListener("click", () => {
		window.location.href = "settings.html";
	});

	// Time period handling
	timePeriodSelect.addEventListener("change", () => {
		if (timePeriodSelect.value === "custom") {
			dateRangeDiv.style.display = "block";
			// Set default date range (last 30 days)
			const today = new Date();
			const thirtyDaysAgo = new Date(today);
			thirtyDaysAgo.setDate(today.getDate() - 30);

			startDateInput.value = thirtyDaysAgo.toISOString().split("T")[0];
			endDateInput.value = today.toISOString().split("T")[0];
		} else {
			dateRangeDiv.style.display = "none";
		}
	});

	// Auto-run analytics handling
	autoRunAnalyticsCheckbox.addEventListener("change", () => {
		saveAutoRunSettings();
		if (autoRunAnalyticsCheckbox.checked) {
			setupAutoRunSchedule();
		} else {
			clearAutoRunSchedule();
		}
	});

	// Analysis duration handling
	analysisDurationSelect.addEventListener("change", () => {
		saveAutoRunSettings();
	});

	// Generate analytics
	generateAnalyticsBtn.addEventListener("click", () => generateAnalytics());

	// Save analytics
	saveAnalyticsBtn.addEventListener("click", () => saveAnalyticsReport());

	// Export analytics
	exportAnalyticsBtn.addEventListener("click", () => exportAnalyticsReport());

	// Copy analytics
	copyAnalyticsBtn.addEventListener("click", () =>
		copyAnalyticsToClipboard()
	);

	// Sync analytics to drive
	syncAnalyticsDriveBtn.addEventListener("click", () =>
		syncAnalyticsToDrive()
	);

	// Modal close functionality
	closeModalBtn.addEventListener("click", () => closeModal());
	reportModal.addEventListener("click", (e) => {
		if (e.target === reportModal) {
			closeModal();
		}
	});

	// Handle messages from background script
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (message.type === "ANALYTICS_SYNC_COMPLETED") {
			if (message.result && message.result.success) {
				toast.success(message.result.message);
			} else {
				toast.error(
					message.result?.error ||
						"Failed to sync analytics to Google Drive"
				);
			}
			// Re-enable button
			syncAnalyticsDriveBtn.disabled = false;
			syncAnalyticsDriveBtn.innerHTML =
				'<span class="material-icons" style="font-size: 18px; vertical-align: middle;">cloud_upload</span> Sync to Drive';
			return true;
		}
	});

	// Load saved reports on page load
	loadSavedReports();

	async function generateAnalytics() {
		try {
			// Show loading overlay
			showLoadingOverlay("Generating analytics...");

			// Get time period filter
			const timeFilter = getTimeFilter();

			// Get customization options
			const customization = {
				duration: analysisDurationSelect.value,
				depth: analysisDepth.value,
				focusAreas: Array.from(
					document.querySelectorAll(
						'input[name="focus-areas"]:checked'
					)
				).map((checkbox) => checkbox.value),
				format: outputFormat.value,
				customInstructions: customPrompt.value.trim(),
			};

			// Get filtered summaries
			const summaries = await getFilteredSummaries(timeFilter);

			if (!summaries || summaries.length === 0) {
				hideLoadingOverlay();
				toast.error(
					`No summaries found for the selected time period (${
						timePeriodSelect.options[timePeriodSelect.selectedIndex]
							.text
					}).`
				);
				return;
			}

			// Generate analytics
			const analyticsResponse = await chrome.runtime.sendMessage({
				type: "GENERATE_CUSTOM_ANALYTICS",
				summaries: summaries,
				customization: customization,
			});

			hideLoadingOverlay();

			if (analyticsResponse.success) {
				// Display results (render markdown to HTML for readability)
				analyticsContent.innerHTML = renderMarkdownToHtml(
					analyticsResponse.analytics
				);
				generatedDateSpan.textContent = new Date().toLocaleString();
				analyticsResults.style.display = "block";

				// Store current analytics for save/copy operations
				window.currentAnalytics = {
					content: analyticsResponse.analytics,
					timeFilter: timeFilter,
					customization: customization,
					generatedAt: new Date().toISOString(),
					summaryCount: summaries.length,
				};

				// Scroll to results
				analyticsResults.scrollIntoView({ behavior: "smooth" });
			} else {
				toast.error(
					`Analytics generation failed: ${analyticsResponse.error}`
				);
			}
		} catch (error) {
			hideLoadingOverlay();
			console.error("Analytics generation error:", error);
			toast.error("Failed to generate analytics: " + error.message);
		}
	}

	function getTimeFilter() {
		const period = timePeriodSelect.value;
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
				const monthStart = new Date(
					now.getFullYear(),
					now.getMonth(),
					1
				);
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
				const startDate = new Date(startDateInput.value + "T00:00:00");
				const endDate = new Date(endDateInput.value + "T23:59:59");
				return { start: startDate.getTime(), end: endDate.getTime() };

			default: // "all"
				return null;
		}
	}

	async function getFilteredSummaries(timeFilter) {
		try {
			const response = await chrome.runtime.sendMessage({
				type: "GET_SUMMARIES_FOR_EXPORT",
			});

			if (!response || !response.summaries) {
				return [];
			}

			let summaries = response.summaries;

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

			return summaries;
		} catch (error) {
			console.error("Error getting filtered summaries:", error);
			return [];
		}
	}

	async function saveAnalyticsReport() {
		if (!window.currentAnalytics) {
			toast.error(
				"No analytics report to save. Generate analytics first."
			);
			return;
		}

		try {
			const reportName = prompt(
				"Enter a name for this analytics report:",
				`Analytics Report - ${new Date().toLocaleDateString()}`
			);

			if (!reportName || reportName.trim() === "") {
				return;
			}

			const report = {
				id: Date.now().toString(),
				name: reportName.trim(),
				content: window.currentAnalytics.content,
				timeFilter: window.currentAnalytics.timeFilter,
				customization: window.currentAnalytics.customization,
				generatedAt: window.currentAnalytics.generatedAt,
				summaryCount: window.currentAnalytics.summaryCount,
				savedAt: new Date().toISOString(),
			};

			// Get existing saved reports
			const result = await chrome.storage.sync.get([
				"savedAnalyticsReports",
			]);
			const savedReports = result.savedAnalyticsReports || [];

			// Add new report
			savedReports.unshift(report); // Add to beginning

			// Keep only last 10 reports
			if (savedReports.length > 10) {
				savedReports.splice(10);
			}

			// Save back to storage
			await chrome.storage.sync.set({
				savedAnalyticsReports: savedReports,
			});

			// Refresh saved reports list
			loadSavedReports();

			toast.success(
				`Analytics report "${reportName}" saved successfully!`
			);
		} catch (error) {
			console.error("Error saving analytics report:", error);
			toast.error("Failed to save analytics report: " + error.message);
		}
	}

	async function loadSavedReports() {
		try {
			const result = await chrome.storage.sync.get([
				"savedAnalyticsReports",
			]);
			const savedReports = result.savedAnalyticsReports || [];

			if (savedReports.length === 0) {
				savedAnalytics.style.display = "none";
				return;
			}

			savedAnalytics.style.display = "block";

			// Build the saved reports list using DOM methods (no inline handlers -> CSP-safe)
			savedReportsList.innerHTML = "";
			savedReports.forEach((report) => {
				const item = document.createElement("div");
				item.className = "saved-item";

				const info = document.createElement("div");
				info.className = "saved-item-info";

				const title = document.createElement("h4");
				title.textContent = report.name;

				const meta = document.createElement("div");
				meta.className = "saved-item-meta";
				meta.textContent = `${
					report.summaryCount
				} summaries • Generated ${new Date(
					report.generatedAt
				).toLocaleDateString()} • Saved ${new Date(
					report.savedAt
				).toLocaleDateString()}`;

				info.appendChild(title);
				info.appendChild(meta);

				const actions = document.createElement("div");
				actions.style.display = "flex";
				actions.style.gap = "8px";

				const viewBtn = document.createElement("button");
				viewBtn.className = "btn-secondary";
				viewBtn.type = "button";
				viewBtn.innerHTML =
					'<span class="material-icons" style="font-size: 16px; vertical-align: middle;">visibility</span> View';
				viewBtn.addEventListener("click", () =>
					loadSavedReport(report.id)
				);

				const deleteBtn = document.createElement("button");
				deleteBtn.className = "btn-secondary";
				deleteBtn.type = "button";
				deleteBtn.innerHTML =
					'<span class="material-icons" style="font-size: 16px; vertical-align: middle;">delete</span> Delete';
				deleteBtn.addEventListener("click", () =>
					deleteSavedReport(report.id)
				);

				actions.appendChild(viewBtn);
				actions.appendChild(deleteBtn);

				item.appendChild(info);
				item.appendChild(actions);

				savedReportsList.appendChild(item);
			});
		} catch (error) {
			console.error("Error loading saved reports:", error);
		}
	}

	// Global functions for saved report actions
	window.loadSavedReport = async function (reportId) {
		try {
			const result = await chrome.storage.sync.get([
				"savedAnalyticsReports",
			]);
			const savedReports = result.savedAnalyticsReports || [];
			const report = savedReports.find((r) => r.id === reportId);

			if (report) {
				// Populate modal with report data
				modalTitle.textContent = report.name;
				modalGeneratedDate.textContent = `Generated: ${new Date(
					report.generatedAt
				).toLocaleString()}`;
				modalContent.innerHTML = renderMarkdownToHtml(report.content);

				// Show modal
				reportModal.style.display = "block";
				document.body.style.overflow = "hidden"; // Prevent background scrolling
			}
		} catch (error) {
			console.error("Error loading saved report:", error);
			toast.error("Failed to load saved report: " + error.message);
		}
	};

	function closeModal() {
		reportModal.style.display = "none";
		document.body.style.overflow = ""; // Restore scrolling
	}

	// Basic markdown -> HTML renderer (escape then replace common markdown constructs)
	function escapeHtml(str) {
		return str
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");
	}

	function renderMarkdownToHtml(md) {
		if (!md) return "";
		// Use marked for full markdown support, then sanitize
		const html = marked.parse(md, { breaks: true, gfm: true });
		return DOMPurify.sanitize(html);
	}

	window.deleteSavedReport = async function (reportId) {
		try {
			const result = await chrome.storage.sync.get([
				"savedAnalyticsReports",
			]);
			const savedReports = result.savedAnalyticsReports || [];

			// Remove the report
			const updatedReports = savedReports.filter(
				(r) => r.id !== reportId
			);

			// Save back to storage
			await chrome.storage.sync.set({
				savedAnalyticsReports: updatedReports,
			});

			// Refresh the list
			loadSavedReports();

			toast.success("Analytics report deleted successfully!");
		} catch (error) {
			console.error("Error deleting saved report:", error);
			toast.error("Failed to delete analytics report: " + error.message);
		}
	};

	async function exportAnalyticsReport() {
		if (!window.currentAnalytics) {
			toast.error(
				"No analytics report to export. Generate analytics first."
			);
			return;
		}

		try {
			const filename = `DoomDigest-Analytics-${
				new Date().toISOString().split("T")[0]
			}.txt`;
			const content = `DoomDigest Analytics Report
Generated: ${new Date(window.currentAnalytics.generatedAt).toLocaleString()}
Summaries Analyzed: ${window.currentAnalytics.summaryCount}
Time Period: ${getTimePeriodDescription(window.currentAnalytics.timeFilter)}

Analysis Customization:
- Duration: ${window.currentAnalytics.customization.duration}
- Depth: ${window.currentAnalytics.customization.depth}
- Focus Areas: ${window.currentAnalytics.customization.focusAreas.join(", ")}
- Format: ${window.currentAnalytics.customization.format}
${
	window.currentAnalytics.customization.customInstructions
		? `- Custom Instructions: ${window.currentAnalytics.customization.customInstructions}`
		: ""
}

================================================================================

${window.currentAnalytics.content}
`;

			const blob = new Blob([content], { type: "text/plain" });
			const url = URL.createObjectURL(blob);

			chrome.downloads.download({
				url: url,
				filename: filename,
				saveAs: true,
			});

			URL.revokeObjectURL(url);
		} catch (error) {
			console.error("Error exporting analytics:", error);
			toast.error("Failed to export analytics: " + error.message);
		}
	}

	async function copyAnalyticsToClipboard() {
		if (!window.currentAnalytics) {
			toast.error(
				"No analytics report to copy. Generate analytics first."
			);
			return;
		}

		try {
			await navigator.clipboard.writeText(
				window.currentAnalytics.content
			);
			// Show brief success message
			const originalText = copyAnalyticsBtn.innerHTML;
			copyAnalyticsBtn.innerHTML =
				'<span class="material-icons" style="font-size: 18px; vertical-align: middle;">check</span> Copied!';
			copyAnalyticsBtn.style.background = "#059669";
			setTimeout(() => {
				copyAnalyticsBtn.innerHTML = originalText;
				copyAnalyticsBtn.style.background = "#3b82f6";
			}, 2000);
		} catch (error) {
			console.error("Failed to copy to clipboard:", error);
			toast.error("Failed to copy to clipboard. Please try again.");
		}
	}

	async function syncAnalyticsToDrive() {
		if (!window.currentAnalytics) {
			toast.error(
				"No analytics report to sync. Generate analytics first."
			);
			return;
		}

		try {
			syncAnalyticsDriveBtn.disabled = true;
			syncAnalyticsDriveBtn.innerHTML =
				'<span class="material-icons" style="font-size: 18px; vertical-align: middle;">cloud_upload</span> Syncing...';

			// Send sync request to background script
			const response = await chrome.runtime.sendMessage({
				type: "SYNC_ANALYTICS_TO_GOOGLE_DRIVE",
				analytics: window.currentAnalytics,
			});

			if (response.success) {
				toast.success(response.message);
			} else {
				toast.error(
					response.error || "Failed to sync analytics to Google Drive"
				);
			}
		} catch (error) {
			console.error("Analytics sync failed:", error);
			toast.error("Failed to sync analytics: " + error.message);
		} finally {
			syncAnalyticsDriveBtn.disabled = false;
			syncAnalyticsDriveBtn.innerHTML =
				'<span class="material-icons" style="font-size: 18px; vertical-align: middle;">cloud_upload</span> Sync to Drive';
		}
	}

	function getTimePeriodDescription(timeFilter) {
		if (!timeFilter) return "All Time";

		const start = new Date(timeFilter.start).toLocaleDateString();
		const end = new Date(timeFilter.end).toLocaleDateString();

		if (start === end) return start;
		return `${start} to ${end}`;
	}

	function showLoadingOverlay(message) {
		const overlay = document.createElement("div");
		overlay.id = "loading-overlay";
		overlay.className = "loading-overlay";
		overlay.innerHTML = `
			<div class="loading-content">
				<div class="spinner"></div>
				<p style="margin: 0; color: #374151; font-size: 16px;">${message}</p>
			</div>
		`;
		document.body.appendChild(overlay);
	}

	function hideLoadingOverlay() {
		const overlay = document.getElementById("loading-overlay");
		if (overlay) {
			overlay.remove();
		}
	}

	// Auto-run analytics functions
	async function saveAutoRunSettings() {
		try {
			const settings = {
				enabled: autoRunAnalyticsCheckbox.checked,
				duration: analysisDurationSelect.value,
				timePeriod: timePeriodSelect.value,
				startDate: startDateInput.value,
				endDate: endDateInput.value,
				depth: analysisDepth.value,
				focusAreas: Array.from(
					document.querySelectorAll(
						'input[name="focus-areas"]:checked'
					)
				).map((checkbox) => checkbox.value),
				format: outputFormat.value,
				customInstructions: customPrompt.value.trim(),
			};

			await chrome.storage.sync.set({
				autoRunAnalyticsSettings: settings,
			});
		} catch (error) {
			console.error("Error saving auto-run settings:", error);
		}
	}

	async function loadAutoRunSettings() {
		try {
			const result = await chrome.storage.sync.get([
				"autoRunAnalyticsSettings",
			]);
			const settings = result.autoRunAnalyticsSettings;

			if (settings) {
				autoRunAnalyticsCheckbox.checked = settings.enabled || false;
				analysisDurationSelect.value = settings.duration || "standard";
				timePeriodSelect.value = settings.timePeriod || "month";
				if (settings.startDate)
					startDateInput.value = settings.startDate;
				if (settings.endDate) endDateInput.value = settings.endDate;
				analysisDepth.value = settings.depth || "standard";
				outputFormat.value = settings.format || "structured";
				customPrompt.value = settings.customInstructions || "";

				// Set focus areas checkboxes
				document
					.querySelectorAll('input[name="focus-areas"]')
					.forEach((checkbox) => {
						checkbox.checked = settings.focusAreas
							? settings.focusAreas.includes(checkbox.value)
							: [
									"reading-habits",
									"content-quality",
									"productivity-insights",
							  ].includes(checkbox.value);
					});

				// Trigger change events to update UI
				timePeriodSelect.dispatchEvent(new Event("change"));
			}
		} catch (error) {
			console.error("Error loading auto-run settings:", error);
		}
	}

	async function setupAutoRunSchedule() {
		try {
			await saveAutoRunSettings();
			const settings = (
				await chrome.storage.sync.get(["autoRunAnalyticsSettings"])
			).autoRunAnalyticsSettings;

			if (!settings || !settings.enabled) return;

			// Calculate next run time based on duration setting
			const nextRunTime = calculateNextRunTime(settings.duration);

			await chrome.runtime.sendMessage({
				type: "SET_AUTO_ANALYTICS_SCHEDULE",
				settings: settings,
				nextRunTime: nextRunTime,
			});

			console.log(
				"Auto-run analytics scheduled for:",
				new Date(nextRunTime)
			);
		} catch (error) {
			console.error("Error setting up auto-run schedule:", error);
		}
	}

	async function clearAutoRunSchedule() {
		try {
			await chrome.runtime.sendMessage({
				type: "CLEAR_AUTO_ANALYTICS_SCHEDULE",
			});
		} catch (error) {
			console.error("Error clearing auto-run schedule:", error);
		}
	}

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

	// Initialize
	timePeriodSelect.dispatchEvent(new Event("change"));
	loadAutoRunSettings();
});
