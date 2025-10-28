import { GoogleGenerativeAI } from "@google/generative-ai";

document.addEventListener("DOMContentLoaded", function () {
	// DOM elements
	const backToSettingsBtn = document.getElementById("back-to-settings");
	const timePeriodSelect = document.getElementById("time-period");
	const dateRangeDiv = document.getElementById("date-range");
	const startDateInput = document.getElementById("start-date");
	const endDateInput = document.getElementById("end-date");
	const generateAnalyticsBtn = document.getElementById("generate-analytics");
	const analyticsResults = document.getElementById("analytics-results");
	const analyticsContent = document.getElementById("analytics-content");
	const generatedDateSpan = document.getElementById("generated-date");
	const saveAnalyticsBtn = document.getElementById("save-analytics");
	const exportAnalyticsBtn = document.getElementById("export-analytics");
	const copyAnalyticsBtn = document.getElementById("copy-analytics");
	const savedAnalytics = document.getElementById("saved-analytics");
	const savedReportsList = document.getElementById("saved-reports-list");

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
				depth: analysisDepth.value,
				focusAreas: Array.from(focusAreas.selectedOptions).map(
					(option) => option.value
				),
				format: outputFormat.value,
				customInstructions: customPrompt.value.trim(),
			};

			// Get filtered summaries
			const summaries = await getFilteredSummaries(timeFilter);

			if (!summaries || summaries.length === 0) {
				hideLoadingOverlay();
				alert(
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
				alert(
					`Analytics generation failed: ${analyticsResponse.error}`
				);
			}
		} catch (error) {
			hideLoadingOverlay();
			console.error("Analytics generation error:", error);
			alert("Failed to generate analytics: " + error.message);
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
			alert("No analytics report to save. Generate analytics first.");
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

			alert(`Analytics report "${reportName}" saved successfully!`);
		} catch (error) {
			console.error("Error saving analytics report:", error);
			alert("Failed to save analytics report: " + error.message);
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
				analyticsContent.innerHTML = renderMarkdownToHtml(
					report.content
				);
				generatedDateSpan.textContent = new Date(
					report.generatedAt
				).toLocaleString();
				analyticsResults.style.display = "block";

				// Store current analytics for operations
				window.currentAnalytics = {
					content: report.content,
					timeFilter: report.timeFilter,
					customization: report.customization,
					generatedAt: report.generatedAt,
					summaryCount: report.summaryCount,
				};

				// Scroll to results
				analyticsResults.scrollIntoView({ behavior: "smooth" });
			}
		} catch (error) {
			console.error("Error loading saved report:", error);
			alert("Failed to load saved report: " + error.message);
		}
	};

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
		// Escape first
		let html = escapeHtml(md);

		// Code blocks ```
		html = html.replace(/```([\s\S]*?)```/g, function (m, code) {
			return (
				"<pre><code>" + code.replace(/&/g, "&amp;") + "</code></pre>"
			);
		});

		// Headings
		html = html.replace(/^###### (.*$)/gim, "<h6>$1</h6>");
		html = html.replace(/^##### (.*$)/gim, "<h5>$1</h5>");
		html = html.replace(/^#### (.*$)/gim, "<h4>$1</h4>");
		html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
		html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
		html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");

		// Bold and italics
		html = html.replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>");
		html = html.replace(/\*(.*?)\*/gim, "<em>$1</em>");

		// Links [text](url)
		html = html.replace(
			/\[([^\]]+)\]\(([^)]+)\)/gim,
			'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
		);

		// Unordered lists
		html = html.replace(
			/(^|\n)\s*[-\*+] (.+)/g,
			function (m, prefix, item) {
				return prefix + "<li>" + item + "</li>";
			}
		);
		// Wrap consecutive <li> in <ul>
		html = html.replace(
			/(?:<li>[\s\S]*?<\/li>)(?:\s*<li>[\s\S]*?<\/li>)*/g,
			function (group) {
				if (group.startsWith("<li>")) return "<ul>" + group + "</ul>";
				return group;
			}
		);

		// Paragraphs (replace double newlines with paragraph)
		html = html.replace(/\n{2,}/g, "</p><p>");
		// Single newlines to <br>
		html = html.replace(/\n/g, "<br>");

		// Ensure wrapped in <p> for clean output
		if (!html.trim().startsWith("<")) {
			html = "<p>" + html + "</p>";
		} else {
			html = "<p>" + html + "</p>";
		}

		return html;
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

			alert("Analytics report deleted successfully!");
		} catch (error) {
			console.error("Error deleting saved report:", error);
			alert("Failed to delete analytics report: " + error.message);
		}
	};

	async function exportAnalyticsReport() {
		if (!window.currentAnalytics) {
			alert("No analytics report to export. Generate analytics first.");
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
			alert("Failed to export analytics: " + error.message);
		}
	}

	async function copyAnalyticsToClipboard() {
		if (!window.currentAnalytics) {
			alert("No analytics report to copy. Generate analytics first.");
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
			alert("Failed to copy to clipboard. Please try again.");
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

	// Initialize
	timePeriodSelect.dispatchEvent(new Event("change"));
});
