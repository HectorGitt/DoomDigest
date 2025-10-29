// Toast notification component for DoomDigest
class Toast {
	constructor() {
		this.container = null;
		this.init();
	}

	init() {
		// Create container if it doesn't exist
		if (!document.getElementById("toast-container")) {
			this.container = document.createElement("div");
			this.container.id = "toast-container";
			this.container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                pointer-events: none;
            `;
			document.body.appendChild(this.container);
		} else {
			this.container = document.getElementById("toast-container");
		}
	}

	show(message, type = "info", duration = 3000) {
		const toast = document.createElement("div");
		toast.className = `toast toast-${type}`;
		toast.style.cssText = `
            background: ${this.getBackgroundColor(type)};
            color: white;
            padding: 12px 16px;
            border-radius: 4px;
            margin-bottom: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 300px;
            word-wrap: break-word;
            pointer-events: auto;
            cursor: pointer;
            transition: all 0.3s ease;
            opacity: 0;
            transform: translateX(100%);
        `;

		// Add icon based on type
		const icon = this.getIcon(type);
		if (icon) {
			toast.innerHTML = `<span class="toast-icon">${icon}</span> ${message}`;
		} else {
			toast.textContent = message;
		}

		// Add close button
		const closeBtn = document.createElement("span");
		closeBtn.innerHTML = "×";
		closeBtn.style.cssText = `
            float: right;
            margin-left: 8px;
            font-weight: bold;
            cursor: pointer;
            opacity: 0.8;
        `;
		closeBtn.onclick = () => this.hide(toast);
		toast.appendChild(closeBtn);

		this.container.appendChild(toast);

		// Animate in
		setTimeout(() => {
			toast.style.opacity = "1";
			toast.style.transform = "translateX(0)";
		}, 10);

		// Auto hide
		if (duration > 0) {
			setTimeout(() => this.hide(toast), duration);
		}

		// Click to dismiss
		toast.onclick = (e) => {
			if (e.target !== closeBtn) {
				this.hide(toast);
			}
		};

		return toast;
	}

	hide(toast) {
		toast.style.opacity = "0";
		toast.style.transform = "translateX(100%)";
		setTimeout(() => {
			if (toast.parentNode) {
				toast.parentNode.removeChild(toast);
			}
		}, 300);
	}

	getBackgroundColor(type) {
		const colors = {
			success: "#34a853",
			error: "#ea4335",
			warning: "#fbbc04",
			info: "#4285f4",
		};
		return colors[type] || colors.info;
	}

	getIcon(type) {
		const icons = {
			success: "✓",
			error: "✕",
			warning: "⚠",
			info: "ℹ",
		};
		return icons[type];
	}

	// Convenience methods
	success(message, duration) {
		return this.show(message, "success", duration);
	}

	error(message, duration) {
		return this.show(message, "error", duration);
	}

	warning(message, duration) {
		return this.show(message, "warning", duration);
	}

	info(message, duration) {
		return this.show(message, "info", duration);
	}
}

// Create global instance
const toast = new Toast();

// Export for use in other scripts
if (typeof module !== "undefined" && module.exports) {
	module.exports = Toast;
}
