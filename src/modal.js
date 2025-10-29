// Modal component for DoomDigest
class Modal {
	constructor() {
		this.modal = null;
		this.overlay = null;
		this.currentResolve = null;
		this.init();
	}

	init() {
		// Create modal elements if they don't exist
		if (!document.getElementById("doomdigest-modal")) {
			this.createModalElements();
		} else {
			this.modal = document.getElementById("doomdigest-modal");
			this.overlay = document.getElementById("doomdigest-modal-overlay");
		}
	}

	createModalElements() {
		// Create overlay
		this.overlay = document.createElement("div");
		this.overlay.id = "doomdigest-modal-overlay";
		this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9999;
            display: none;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

		// Create modal
		this.modal = document.createElement("div");
		this.modal.id = "doomdigest-modal";
		this.modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0.7);
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            display: none;
            opacity: 0;
            transition: all 0.3s ease;
            max-width: 90vw;
            max-height: 90vh;
            overflow: auto;
        `;

		// Create modal content
		const content = document.createElement("div");
		content.className = "modal-content";
		content.style.cssText = `
            padding: 24px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

		// Create modal header
		const header = document.createElement("div");
		header.className = "modal-header";
		header.style.cssText = `
            margin-bottom: 16px;
        `;

		const title = document.createElement("h3");
		title.className = "modal-title";
		title.style.cssText = `
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #202124;
        `;

		const closeBtn = document.createElement("button");
		closeBtn.className = "modal-close";
		closeBtn.innerHTML = "×";
		closeBtn.style.cssText = `
            position: absolute;
            top: 12px;
            right: 12px;
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #5f6368;
            padding: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

		// Create modal body
		const body = document.createElement("div");
		body.className = "modal-body";
		body.style.cssText = `
            margin-bottom: 24px;
            color: #3c4043;
            line-height: 1.5;
        `;

		// Create modal footer
		const footer = document.createElement("div");
		footer.className = "modal-footer";
		footer.style.cssText = `
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        `;

		// Assemble modal
		header.appendChild(title);
		header.appendChild(closeBtn);
		content.appendChild(header);
		content.appendChild(body);
		content.appendChild(footer);
		this.modal.appendChild(content);

		// Add to document
		document.body.appendChild(this.overlay);
		document.body.appendChild(this.modal);

		// Event listeners
		closeBtn.onclick = () => this.hide();
		this.overlay.onclick = () => this.hide();

		// Store references
		this.title = title;
		this.body = body;
		this.footer = footer;
	}

	show(options = {}) {
		return new Promise((resolve) => {
			this.currentResolve = resolve;

			// Set content
			this.title.textContent = options.title || "Confirm Action";
			this.body.innerHTML = options.message || "Are you sure?";

			// Clear footer
			this.footer.innerHTML = "";

			// Add buttons
			const buttons = options.buttons || [
				{
					text: "Cancel",
					type: "secondary",
					action: () => this.hide(false),
				},
				{
					text: "Confirm",
					type: "primary",
					action: () => this.hide(true),
				},
			];

			buttons.forEach((btn) => {
				const button = document.createElement("button");
				button.textContent = btn.text;
				button.className = `modal-btn modal-btn-${
					btn.type || "secondary"
				}`;
				button.style.cssText = this.getButtonStyle(btn.type);
				button.onclick = () => {
					if (btn.action) {
						btn.action();
					} else {
						this.hide(btn.value !== undefined ? btn.value : true);
					}
				};
				this.footer.appendChild(button);
			});

			// Show modal
			this.overlay.style.display = "block";
			this.modal.style.display = "block";

			// Animate in
			setTimeout(() => {
				this.overlay.style.opacity = "1";
				this.modal.style.opacity = "1";
				this.modal.style.transform = "translate(-50%, -50%) scale(1)";
			}, 10);

			// Focus management
			this.modal.focus();
		});
	}

	hide(result = false) {
		this.overlay.style.opacity = "0";
		this.modal.style.opacity = "0";
		this.modal.style.transform = "translate(-50%, -50%) scale(0.7)";

		setTimeout(() => {
			this.overlay.style.display = "none";
			this.modal.style.display = "none";
			if (this.currentResolve) {
				this.currentResolve(result);
				this.currentResolve = null;
			}
		}, 300);
	}

	getButtonStyle(type) {
		const styles = {
			primary: `
                background: #1a73e8;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: background 0.2s ease;
            `,
			secondary: `
                background: white;
                color: #3c4043;
                border: 1px solid #dadce0;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: background 0.2s ease;
            `,
			danger: `
                background: #ea4335;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: background 0.2s ease;
            `,
		};

		const baseStyle = styles[type] || styles.secondary;

		// Add hover effects
		return (
			baseStyle +
			`
            &:hover {
                background: ${
					type === "primary"
						? "#1557b0"
						: type === "danger"
						? "#d93025"
						: "#f8f9fa"
				};
                border-color: ${type === "secondary" ? "#bdc1c6" : "initial"};
            }
        `
		);
	}

	// Convenience methods
	confirm(message, title = "Confirm Action") {
		return this.show({
			title,
			message,
			buttons: [
				{
					text: "Cancel",
					type: "secondary",
					action: () => this.hide(false),
				},
				{
					text: "Confirm",
					type: "primary",
					action: () => this.hide(true),
				},
			],
		});
	}

	alert(message, title = "Alert") {
		return this.show({
			title,
			message,
			buttons: [
				{ text: "OK", type: "primary", action: () => this.hide(true) },
			],
		});
	}

	custom(options) {
		return this.show(options);
	}
}

// Create global instance
const modal = new Modal();

// Export for use in other scripts
if (typeof module !== "undefined" && module.exports) {
	module.exports = Modal;
}
