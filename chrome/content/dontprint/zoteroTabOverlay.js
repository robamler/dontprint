var Dontprint_ZoteroTabOverlay = new function() {
	this.init = function() {
		// Get access to the main browser window.
		// Taken from https://developer.mozilla.org/en-US/Add-ons/Code_snippets/Tabbed_browser
		let mainWindow = window.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
							.getInterface(Components.interfaces.nsIWebNavigation)
							.QueryInterface(Components.interfaces.nsIDocShellTreeItem)
							.rootTreeItem
							.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
							.getInterface(Components.interfaces.nsIDOMWindow);
		Dontprint_ZoteroTabOverlay.DontprintBrowser = mainWindow.DontprintBrowser;
		Dontprint_ZoteroTabOverlay.DontprintBrowser.registerZoteroTab(document);
	};
	
	this.close = function() {
		Dontprint_ZoteroTabOverlay.DontprintBrowser.unregisterZoteroTab(document);
	};
}

window.addEventListener("load", Dontprint_ZoteroTabOverlay.init, false);
window.addEventListener("unload", Dontprint_ZoteroTabOverlay.close, false);
