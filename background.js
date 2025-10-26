chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

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
