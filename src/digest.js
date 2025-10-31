// Digest Page JavaScript
class DigestManager {
	constructor() {
		this.allDigests = [];
		this.filteredDigests = [];
		this.currentFilters = {
			search: "",
			dateRange: "all",
			site: "all",
			type: "all",
			sort: "newest",
			customStart: null,
			customEnd: null,
		};

		this.init();
	}

	async init() {
		await this.loadComponents();
		this.bindEvents();
		await this.loadDigests();
		this.updateStats();
		this.renderDigests();
		this.populateSiteFilter();
	}

	async loadComponents() {
		// Load toast and modal components
		const extensionId = chrome.runtime.id;
		await this.loadScript(`chrome-extension://${extensionId}/toast.js`);
		await this.loadScript(`chrome-extension://${extensionId}/modal.js`);
	}

	loadScript(src) {
		return new Promise((resolve, reject) => {
			const script = document.createElement("script");
			script.src = src;
			script.onload = resolve;
			script.onerror = reject;
			document.head.appendChild(script);
		});
	}

	bindEvents() {
		// Search input
		document
			.getElementById("search-input")
			.addEventListener("input", (e) => {
				this.currentFilters.search = e.target.value.toLowerCase();
				this.applyFilters();
			});

		// Filter selects
		document
			.getElementById("date-filter")
			.addEventListener("change", (e) => {
				this.currentFilters.dateRange = e.target.value;
				this.toggleCustomDateRange();
				this.applyFilters();
			});

		document
			.getElementById("site-filter")
			.addEventListener("change", (e) => {
				this.currentFilters.site = e.target.value;
				this.applyFilters();
			});

		document
			.getElementById("type-filter")
			.addEventListener("change", (e) => {
				this.currentFilters.type = e.target.value;
				this.applyFilters();
			});

		document
			.getElementById("sort-filter")
			.addEventListener("change", (e) => {
				this.currentFilters.sort = e.target.value;
				this.applyFilters();
			});

		// Custom date inputs
		document
			.getElementById("start-date")
			.addEventListener("change", (e) => {
				this.currentFilters.customStart = e.target.value
					? new Date(e.target.value)
					: null;
				this.applyFilters();
			});

		document.getElementById("end-date").addEventListener("change", (e) => {
			this.currentFilters.customEnd = e.target.value
				? new Date(e.target.value)
				: null;
			this.applyFilters();
		});

		// Navigation
		document.getElementById("export-btn").addEventListener("click", () => {
			this.exportDigests();
		});
	}

	toggleCustomDateRange() {
		const customRange = document.getElementById("custom-date-range");
		customRange.style.display =
			this.currentFilters.dateRange === "custom" ? "flex" : "none";
	}

	async loadDigests() {
		try {
			console.log("DigestManager: Starting loadDigests");
			document.getElementById("loading-indicator").style.display =
				"block";

			console.log("DigestManager: About to send GET_ALL_DIGESTS message");
			const result = await new Promise((resolve, reject) => {
				chrome.runtime.sendMessage(
					{ type: "GET_ALL_DIGESTS" },
					(response) => {
						if (chrome.runtime.lastError) {
							console.error(
								"DigestManager: Chrome runtime error:",
								chrome.runtime.lastError
							);
							reject(
								new Error(
									chrome.runtime.lastError.message ||
										"Unknown runtime error"
								)
							);
						} else {
							console.log(
								"DigestManager: Initial response received:",
								response
							);
							resolve(response);
						}
					}
				);
			});

			console.log(
				"DigestManager: Initial response processed, waiting for data..."
			);

			// Now listen for the actual data via a separate message
			const dataPromise = new Promise((resolve, reject) => {
				const messageListener = (message) => {
					if (message.type === "DIGESTS_DATA") {
						console.log(
							"DigestManager: Received DIGESTS_DATA:",
							message.digests?.length || 0,
							"items"
						);
						chrome.runtime.onMessage.removeListener(
							messageListener
						);
						resolve(message);
					} else if (message.type === "DIGESTS_ERROR") {
						console.error(
							"DigestManager: Received DIGESTS_ERROR:",
							message.error
						);
						chrome.runtime.onMessage.removeListener(
							messageListener
						);
						reject(new Error(message.error));
					}
				};

				chrome.runtime.onMessage.addListener(messageListener);

				// Timeout after 10 seconds
				setTimeout(() => {
					chrome.runtime.onMessage.removeListener(messageListener);
					reject(new Error("Timeout waiting for digest data"));
				}, 10000);
			});

			const dataMessage = await dataPromise;
			const digests = dataMessage.digests || [];

			console.log(
				"DigestManager: Successfully loaded digests, count:",
				digests.length
			);
			console.log(
				"DigestManager: First digest sample:",
				digests[0] ? JSON.stringify(digests[0], null, 2) : "No digests"
			);
			this.allDigests = digests;
			this.filteredDigests = [...this.allDigests];
			console.log(
				"DigestManager: Set allDigests and filteredDigests, calling updateStats and renderDigests"
			);
			this.updateStats();
			this.renderDigests();
		} catch (error) {
			console.error("DigestManager: Exception in loadDigests:", error);
			console.error("DigestManager: Error stack:", error.stack);
			toast.error("Error loading digests");
		} finally {
			document.getElementById("loading-indicator").style.display = "none";
		}
	}

	populateSiteFilter() {
		const siteFilter = document.getElementById("site-filter");
		const sites = new Set();

		this.allDigests.forEach((digest) => {
			if (digest.url) {
				try {
					const url = new URL(digest.url);
					sites.add(url.hostname);
				} catch (e) {
					// Invalid URL, skip
				}
			}
		});

		// Clear existing options except "All Sites"
		while (siteFilter.children.length > 1) {
			siteFilter.removeChild(siteFilter.lastChild);
		}

		// Add site options
		Array.from(sites)
			.sort()
			.forEach((site) => {
				const option = document.createElement("option");
				option.value = site;
				option.textContent = site;
				siteFilter.appendChild(option);
			});
	}

	applyFilters() {
		let filtered = [...this.allDigests];

		// Search filter
		if (this.currentFilters.search) {
			filtered = filtered.filter((digest) => {
				const searchText = this.currentFilters.search;
				return (
					digest.title?.toLowerCase().includes(searchText) ||
					digest.summary?.toLowerCase().includes(searchText) ||
					digest.url?.toLowerCase().includes(searchText) ||
					digest.pageHeading?.toLowerCase().includes(searchText)
				);
			});
		}

		// Date range filter
		if (this.currentFilters.dateRange !== "all") {
			const now = new Date();
			let startDate;

			switch (this.currentFilters.dateRange) {
				case "today":
					startDate = new Date(
						now.getFullYear(),
						now.getMonth(),
						now.getDate()
					);
					break;
				case "week":
					startDate = new Date(
						now.getTime() - 7 * 24 * 60 * 60 * 1000
					);
					break;
				case "month":
					startDate = new Date(now.getFullYear(), now.getMonth(), 1);
					break;
				case "quarter":
					const quarterStart = Math.floor(now.getMonth() / 3) * 3;
					startDate = new Date(now.getFullYear(), quarterStart, 1);
					break;
				case "year":
					startDate = new Date(now.getFullYear(), 0, 1);
					break;
				case "custom":
					startDate = this.currentFilters.customStart;
					break;
			}

			if (startDate) {
				filtered = filtered.filter((digest) => {
					const digestDate = new Date(digest.timestamp);
					if (
						this.currentFilters.dateRange === "custom" &&
						this.currentFilters.customEnd
					) {
						const endDate = new Date(this.currentFilters.customEnd);
						endDate.setHours(23, 59, 59, 999);
						return digestDate >= startDate && digestDate <= endDate;
					}
					return digestDate >= startDate;
				});
			}
		}

		// Site filter
		if (this.currentFilters.site !== "all") {
			filtered = filtered.filter((digest) => {
				if (!digest.url) return false;
				try {
					const url = new URL(digest.url);
					return url.hostname === this.currentFilters.site;
				} catch (e) {
					return false;
				}
			});
		}

		// Type filter
		if (this.currentFilters.type !== "all") {
			filtered = filtered.filter(
				(digest) => digest.type === this.currentFilters.type
			);
		}

		// Sort
		filtered.sort((a, b) => {
			switch (this.currentFilters.sort) {
				case "oldest":
					return new Date(a.timestamp) - new Date(b.timestamp);
				case "site":
					const siteA = a.url ? new URL(a.url).hostname : "";
					const siteB = b.url ? new URL(b.url).hostname : "";
					return siteA.localeCompare(siteB);
				case "title":
					return (a.title || "").localeCompare(b.title || "");
				case "newest":
				default:
					return new Date(b.timestamp) - new Date(a.timestamp);
			}
		});

		this.filteredDigests = filtered;
		this.updateStats();
		this.renderDigests();
	}

	updateStats() {
		const totalCount = document.getElementById("total-count");
		const sitesCount = document.getElementById("sites-count");
		const daysCount = document.getElementById("days-count");
		const avgDaily = document.getElementById("avg-daily");

		// Total digests
		totalCount.textContent = this.filteredDigests.length;

		// Unique sites
		const sites = new Set();
		this.filteredDigests.forEach((digest) => {
			if (digest.url) {
				try {
					const url = new URL(digest.url);
					sites.add(url.hostname);
				} catch (e) {}
			}
		});
		sitesCount.textContent = sites.size;

		// Days active
		if (this.filteredDigests.length > 0) {
			const dates = this.filteredDigests.map((d) =>
				new Date(d.timestamp).toDateString()
			);
			const uniqueDays = new Set(dates);
			daysCount.textContent = uniqueDays.size;

			// Average per day
			const avg =
				Math.round(
					(this.filteredDigests.length / uniqueDays.size) * 10
				) / 10;
			avgDaily.textContent = avg;
		} else {
			daysCount.textContent = "0";
			avgDaily.textContent = "0";
		}
	}

	renderDigests() {
		console.log(
			"DigestManager: renderDigests called with filteredDigests length:",
			this.filteredDigests.length
		);
		const container = document.getElementById("digests-container");
		const noResults = document.getElementById("no-results");

		if (this.filteredDigests.length === 0) {
			console.log(
				"DigestManager: No digests to render, showing no-results"
			);
			container.innerHTML = "";
			noResults.style.display = "block";
			return;
		}

		console.log("DigestManager: Rendering digests, hiding no-results");
		noResults.style.display = "none";

		// Group by day
		const groupedByDay = {};
		this.filteredDigests.forEach((digest) => {
			const date = new Date(digest.timestamp);
			const dayKey = date.toDateString();

			if (!groupedByDay[dayKey]) {
				groupedByDay[dayKey] = {
					date: date,
					digests: [],
				};
			}
			groupedByDay[dayKey].digests.push(digest);
		});

		console.log(
			"DigestManager: Grouped digests by day:",
			Object.keys(groupedByDay).length,
			"days"
		);

		// Sort days (newest first)
		const sortedDays = Object.keys(groupedByDay).sort(
			(a, b) => new Date(b) - new Date(a)
		);

		container.innerHTML = sortedDays
			.map((dayKey) => {
				const dayData = groupedByDay[dayKey];
				const dayDigests = dayData.digests;

				const dayHtml = `
				<div class="day-group">
					<div class="day-header">
						<span class="material-icons">today</span>
						<h2 class="day-date">${this.formatDate(dayData.date)}</h2>
						<span class="day-count">${dayDigests.length} digest${
					dayDigests.length !== 1 ? "s" : ""
				}</span>
					</div>
					${dayDigests.map((digest) => this.renderDigestCard(digest)).join("")}
				</div>
			`;

				return dayHtml;
			})
			.join("");

		console.log("DigestManager: Rendered HTML to container");

		// Add event listeners to buttons
		this.addButtonEventListeners(container);
	}

	addButtonEventListeners(container) {
		// Add event listeners for copy buttons
		container.querySelectorAll(".btn-copy").forEach((button) => {
			button.addEventListener("click", (e) => {
				const digestId = e.currentTarget.getAttribute("data-digest-id");
				this.copyDigest(digestId);
			});
		});

		// Add event listeners for open buttons
		container.querySelectorAll(".btn-open").forEach((button) => {
			button.addEventListener("click", (e) => {
				const digestId = e.currentTarget.getAttribute("data-digest-id");
				this.openDigest(digestId);
			});
		});

		// Add event listeners for delete buttons
		container.querySelectorAll(".btn-delete").forEach((button) => {
			button.addEventListener("click", (e) => {
				const digestId = e.currentTarget.getAttribute("data-digest-id");
				this.deleteDigest(digestId);
			});
		});
	}

	renderDigestCard(digest) {
		const date = new Date(digest.timestamp);
		const timeString = date.toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});

		let siteName = "Unknown";
		if (digest.url) {
			try {
				const url = new URL(digest.url);
				siteName = url.hostname;
			} catch (e) {}
		}

		const typeClass = digest.type || "article";
		const typeLabel = this.getTypeLabel(digest.type);

		return `
			<div class="digest-card" data-id="${digest.id}">
				<div class="card-header">
					<h3 class="card-title">${this.escapeHtml(
						digest.title || "Untitled Digest"
					)}</h3>
					<div class="card-meta">
						<div class="card-time">
							<span class="material-icons">schedule</span>
							${timeString}
						</div>
						<div class="card-site">
							<span class="material-icons">web</span>
							${siteName}
						</div>
					</div>
				</div>
				<div class="card-content">
					${this.formatContent(digest.summary)}
				</div>
				<div class="card-actions">
					<a href="${digest.url || "#"}" class="card-url" target="_blank" rel="noopener">
						<span class="material-icons">open_in_new</span>
						${this.truncateUrl(digest.url)}
					</a>
					<div class="card-buttons">
						<button class="btn-secondary btn-copy" data-digest-id="${digest.id}">
							<span class="material-icons">content_copy</span>
							Copy
						</button>
						<button class="btn-secondary btn-open" data-digest-id="${digest.id}">
							<span class="material-icons">launch</span>
							Open
						</button>
						<button class="btn-danger btn-delete" data-digest-id="${digest.id}">
							<span class="material-icons">delete</span>
							Delete
						</button>
					</div>
				</div>
			</div>
		`;
	}

	formatDate(date) {
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		if (date.toDateString() === today.toDateString()) {
			return "Today";
		} else if (date.toDateString() === yesterday.toDateString()) {
			return "Yesterday";
		} else {
			return date.toLocaleDateString([], {
				weekday: "long",
				year: "numeric",
				month: "long",
				day: "numeric",
			});
		}
	}

	getTypeLabel(type) {
		const labels = {
			article: "Article",
			email: "Email",
			post: "Post",
			chunk: "Chunk",
			"raw-text": "Raw Text",
			explained: "Explained",
			simplified: "Simplified",
		};
		return labels[type] || "Article";
	}

	formatContent(content) {
		if (!content) return "<p>No content available</p>";

		// Basic HTML sanitization and formatting
		return content
			.replace(/\n\n/g, "</p><p>")
			.replace(/\n/g, "<br>")
			.replace(/^/, "<p>")
			.replace(/$/, "</p>");
	}

	truncateUrl(url) {
		if (!url) return "No URL";
		try {
			const urlObj = new URL(url);
			const path = urlObj.pathname + urlObj.search;
			if (path.length > 40) {
				return urlObj.hostname + path.substring(0, 37) + "...";
			}
			return urlObj.hostname + path;
		} catch (e) {
			return url.length > 40 ? url.substring(0, 37) + "..." : url;
		}
	}

	escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}

	openDigestInTab(url) {
		if (url && url !== "#") {
			chrome.tabs.create({ url });
		}
	}

	openDigest(digestId) {
		const digest = this.allDigests.find((d) => d.id === parseInt(digestId));
		if (digest && digest.url) {
			this.openDigestInTab(digest.url);
		}
	}

	copyDigest(digestId) {
		const digest = this.allDigests.find((d) => d.id === parseInt(digestId));
		if (digest && digest.summary) {
			navigator.clipboard
				.writeText(digest.summary)
				.then(() => {
					toast.success("Digest copied to clipboard");
				})
				.catch((err) => {
					console.error("Failed to copy digest:", err);
					// Fallback for older browsers
					const textArea = document.createElement("textarea");
					textArea.value = digest.summary;
					document.body.appendChild(textArea);
					textArea.select();
					document.execCommand("copy");
					document.body.removeChild(textArea);
					toast.success("Digest copied to clipboard");
				});
		}
	}

	async deleteDigest(digestId) {
		const confirmed = await modal.confirm(
			"Are you sure you want to delete this digest? This action cannot be undone.",
			"Delete Digest"
		);

		if (!confirmed) return;

		try {
			console.log("DigestManager: Deleting digest with ID:", digestId);

			// Send delete request to background script
			const result = await new Promise((resolve, reject) => {
				chrome.runtime.sendMessage(
					{
						type: "DELETE_DIGEST",
						digestId: digestId,
					},
					(response) => {
						if (chrome.runtime.lastError) {
							console.error(
								"DigestManager: Chrome runtime error:",
								chrome.runtime.lastError
							);
							reject(
								new Error(
									chrome.runtime.lastError.message ||
										"Unknown runtime error"
								)
							);
						} else {
							console.log(
								"DigestManager: Delete request acknowledged:",
								response
							);
							resolve(response);
						}
					}
				);
			});

			if (result && result.acknowledged) {
				console.log(
					"DigestManager: Delete request acknowledged, waiting for completion..."
				);

				// Listen for completion message
				const completionPromise = new Promise((resolve, reject) => {
					const messageListener = (message) => {
						if (
							message.type === "DELETE_DIGEST_COMPLETE" &&
							message.digestId === digestId
						) {
							console.log(
								"DigestManager: Received delete completion:",
								message
							);
							chrome.runtime.onMessage.removeListener(
								messageListener
							);
							if (message.success) {
								resolve(message);
							} else {
								reject(
									new Error(message.error || "Delete failed")
								);
							}
						}
					};

					chrome.runtime.onMessage.addListener(messageListener);

					// Timeout after 10 seconds
					setTimeout(() => {
						chrome.runtime.onMessage.removeListener(
							messageListener
						);
						reject(
							new Error("Timeout waiting for delete completion")
						);
					}, 10000);
				});

				const completionMessage = await completionPromise;

				console.log("DigestManager: Digest deleted successfully");
				// Remove from local arrays
				this.allDigests = this.allDigests.filter(
					(digest) => digest.id !== parseInt(digestId)
				);
				this.filteredDigests = this.filteredDigests.filter(
					(digest) => digest.id !== parseInt(digestId)
				);

				// Update UI
				this.updateStats();
				this.renderDigests();

				// Show success message
				toast.success("Digest deleted successfully");
			} else {
				console.error(
					"DigestManager: Failed to acknowledge delete request:",
					result?.error
				);
				toast.error("Failed to delete digest");
			}
		} catch (error) {
			console.error("DigestManager: Error deleting digest:", error);
			toast.error("Error deleting digest");
		}
	}

	exportDigests() {
		if (this.filteredDigests.length === 0) {
			modal.alert("No digests to export");
			return;
		}

		let exportText = `DoomDigest Export - ${new Date().toLocaleString()}\n`;
		exportText += `Total Digests: ${this.filteredDigests.length}\n\n`;

		this.filteredDigests.forEach((digest, index) => {
			exportText += `${index + 1}. ${digest.title || "Untitled"}\n`;
			exportText += `   Date: ${new Date(
				digest.timestamp
			).toLocaleString()}\n`;
			exportText += `   URL: ${digest.url || "N/A"}\n`;
			exportText += `   Content:\n   ${
				digest.summary || "No content"
			}\n\n`;
		});

		const blob = new Blob([exportText], { type: "text/plain" });
		const url = URL.createObjectURL(blob);

		const a = document.createElement("a");
		a.href = url;
		a.download = `doomdigest-export-${
			new Date().toISOString().split("T")[0]
		}.txt`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);

		URL.revokeObjectURL(url);
	}

	showError(message) {
		// Simple error display - could be enhanced with a proper error UI
		const container = document.getElementById("digests-container");
		container.innerHTML = `
			<div style="text-align: center; padding: 40px; color: #d93025;">
				<span class="material-icons" style="font-size: 48px; display: block; margin-bottom: 16px;">error</span>
				<h3>Error</h3>
				<p>${message}</p>
			</div>
		`;
	}

	showSuccess(message) {
		// Simple success notification
		const notification = document.createElement("div");
		notification.style.cssText = `
			position: fixed;
			top: 20px;
			right: 20px;
			background: #34a853;
			color: white;
			padding: 12px 16px;
			border-radius: 4px;
			box-shadow: 0 2px 8px rgba(0,0,0,0.3);
			z-index: 10000;
			font-size: 14px;
		`;
		notification.textContent = message;
		document.body.appendChild(notification);

		setTimeout(() => {
			document.body.removeChild(notification);
		}, 3000);
	}
}

// Global reference for onclick handlers
let digestManager;

// Initialize the digest manager when the page loads
document.addEventListener("DOMContentLoaded", () => {
	digestManager = new DigestManager();
});
