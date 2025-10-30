// Shared navigation component for DoomDigest pages
class DoomDigestNavigation {
	constructor(currentPage) {
		this.currentPage = currentPage; // 'settings', 'analytics', or 'digest'
		this.init();
	}

	init() {
		this.createNavigation();
		this.attachEventListeners();
	}

	createNavigation() {
		// Create navigation container
		const nav = document.createElement("nav");
		nav.className = "doomdigest-nav";
		nav.innerHTML = `
            <div class="nav-container">
                <div class="nav-brand">
                    <span class="material-icons">description</span>
                    <span>DoomDigest</span>
                </div>
                <div class="nav-links">
                    <a href="#" class="nav-link ${
						this.currentPage === "digest" ? "active" : ""
					}" data-page="digest">
                            <span class="material-icons">article</span>
                            <span>Digest</span>
                        </a>
                    
                    <a href="#" class="nav-link ${
						this.currentPage === "analytics" ? "active" : ""
					}" data-page="analytics">
                        <span class="material-icons">analytics</span>
                        <span>Analytics</span>
                    </a>
                    <a href="#" class="nav-link ${
						this.currentPage === "settings" ? "active" : ""
					}" data-page="settings">
                        <span class="material-icons">settings</span>
                        <span>Settings</span>
                    </a>
                </div>
            </div>
        `;

		// Insert at the top of the body
		document.body.insertBefore(nav, document.body.firstChild);

		// Add navigation styles
		this.addStyles();
	}

	addStyles() {
		const style = document.createElement("style");
		style.textContent = `
            .doomdigest-nav {
                background: #1f2937;
                border-bottom: 1px solid #374151;
                position: sticky;
                top: 0;
                z-index: 1000;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            }

            .nav-container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 0 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                height: 56px;
            }

            .nav-brand {
                display: flex;
                align-items: center;
                gap: 8px;
                color: #f9fafb;
                font-weight: 600;
                font-size: 18px;
                text-decoration: none;
            }

            .nav-brand .material-icons {
                color: #3b82f6;
                font-size: 24px;
            }

            .nav-links {
                display: flex;
                gap: 8px;
            }

            .nav-link {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 8px 16px;
                color: #d1d5db;
                text-decoration: none;
                border-radius: 6px;
                transition: all 0.2s;
                font-size: 14px;
                font-weight: 500;
            }

            .nav-link:hover {
                background: #374151;
                color: #f9fafb;
            }

            .nav-link.active {
                background: #3b82f6;
                color: #ffffff;
            }

            .nav-link .material-icons {
                font-size: 18px;
            }

            @media (max-width: 768px) {
                .nav-container {
                    padding: 0 12px;
                    height: 48px;
                }

                .nav-brand {
                    font-size: 16px;
                }

                .nav-brand .material-icons {
                    font-size: 20px;
                }

                .nav-link {
                    padding: 6px 12px;
                    font-size: 13px;
                }

                .nav-link .material-icons {
                    font-size: 16px;
                }

                .nav-link span:not(.material-icons) {
                    display: none;
                }
            }
        `;
		document.head.appendChild(style);
	}

	attachEventListeners() {
		const navLinks = document.querySelectorAll(".nav-link");
		navLinks.forEach((link) => {
			link.addEventListener("click", (e) => {
				e.preventDefault();
				const page = e.currentTarget.dataset.page;
				this.navigateToPage(page);
			});
		});
	}

	navigateToPage(page) {
		if (page === this.currentPage) {
			return; // Already on this page
		}

		const extensionId = chrome.runtime.id;
		let url;

		switch (page) {
			case "settings":
				url = `chrome-extension://${extensionId}/settings.html`;
				break;
			case "analytics":
				url = `chrome-extension://${extensionId}/analytics.html`;
				break;
			case "digest":
				url = `chrome-extension://${extensionId}/digest.html`;
				break;
			default:
				return;
		}

		// Open in the same tab/window
		window.location.href = url;
	}
}

// Auto-initialize navigation based on current page
document.addEventListener("DOMContentLoaded", () => {
	// Determine current page from the URL or pathname
	const pathname = window.location.pathname;
	let currentPage = "settings"; // default

	if (pathname.includes("analytics")) {
		currentPage = "analytics";
	} else if (pathname.includes("digest")) {
		currentPage = "digest";
	}

	// Initialize navigation
	new DoomDigestNavigation(currentPage);
});
