"use strict";

if (typeof PlatformTools === "undefined") {
	var PlatformTools = {};
}


(function() {
	var publicInterface = {
		openTab,
		closeTab,
		highlightTab
	};

	for (let i in publicInterface) {
		PlatformTools[i] = publicInterface[i];
	}

	return;


	function windowForTab(tab) {
		return tab.ownerDocument.defaultView;
	}


	function browserForTab(tab) {
		return windowForTab(tab).gBrowser.getBrowserForTab(tab);
	}


	function stripHash(url) {
		let m = url.match(/^(.*)#/);
		if (m) {
			return m[1];
		} else {
			return url;
		}
	}


	function searchTabByUrl(url, tabbrowser) {
		for (let i=0; i<tabbrowser.browsers.length; i++) {
			let b = tabbrowser.getBrowserAtIndex(i);
			if (stripHash(b.contentWindow.location.href) === url) {
				return tabbrowser.tabs[i];
			}
		}
	}


	function openTab(options) {
		let openerTab = options.openerTab;

		if (!openerTab) {
			openerTab = Components.classes["@mozilla.org/appshell/window-mediator;1"]
				.getService(Components.interfaces.nsIWindowMediator)
				.getMostRecentWindow("navigator:browser")
				.gBrowser.selectedTab;
		}

		if (options.singleton) {
			let queryUrl = stripHash(options.url);

			// Check if tab is already displayed.
			if (stripHash(browserForTab(openerTab).contentWindow.location.href) === queryUrl) {
				return Promise.resolve(openerTab);
			}

			// Check if we can reuse an existing tab in the same window.
			let tab = searchTabByUrl(queryUrl, windowForTab(openerTab).gBrowser);
			if (tab) {
				if (!options.inBackground) {
					windowForTab(openerTab).gBrowser.selectedTab = tab;
				}
				return Promise.resolve(tab);
			}

			// Check if we can reuse an existing tab in a different browser window.
			if (options.globalSingleton) {
				let enumerator = Components.classes["@mozilla.org/appshell/window-mediator;1"]
					.getService(Components.interfaces.nsIWindowMediator)
					.getEnumerator("navigator:browser");
				while (enumerator.hasMoreElements()) {
					let win = enumerator.getNext();
					tab = searchTabByUrl(queryUrl, win.gBrowser);
					if (tab) {
						if (!options.inBackground) {
							win.focus();
							win.gBrowser.selectedTab = tab;
						}
						return Promise.resolve(tab);
					}
				}
			}
		}

		return Promise.resolve(windowForTab(openerTab).gBrowser.loadOneTab(
			options.url, { inBackground: !!options.inBackground }
		));
	}


	function closeTab(tab) {
		browserForTab(tab).contentWindow.close();
	}


	function highlightTab(tab) {
		let win = windowForTab(tab);
		win.gBrowser.selectedTab = tab;
		win.focus();
	}
}());
