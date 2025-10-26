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
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId === "snap-page") {
		// Snap the entire page
		chrome.tabs.sendMessage(tab.id, {
			type: "SNAP_PAGE_SUMMARY",
			summaryType: "key-points", // Default to key-points for page snap
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
	}
});

// Listen for tab changes and notify sidebar
chrome.tabs.onActivated.addListener(async (activeInfo) => {
	try {
		// Notify sidebar to update colors
		chrome.runtime.sendMessage({
			type: "TAB_ACTIVATED",
			tabId: activeInfo.tabId,
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
				// Notify sidebar to update colors
				chrome.runtime.sendMessage({
					type: "TAB_UPDATED",
					tabId: tabId,
				});

				// Note: Removed automatic summarization trigger on URL change
				// Users can manually start summarization using the sidebar controls
			}
		});
	}
});
