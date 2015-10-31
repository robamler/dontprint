window.DontprintBrowser = (function() {
	var tabObjects = new WeakMap();
	var dontprintThisPageImg = null;
	var dontprintProgressImg = null;
	var dontprintFromZoteroBtn = null;
	var Dontprint = null;
	var idleAnimationTimer = null;
	var showDontprintIcon = false;
	var alreadyProcessing = false;
	var isInPrivateBrowsingMode = false;
	var registeredZoteroButtons = [];
	var zoteroInstalled = undefined;
	var oldZoteroBrowserTab;
	
	const itemTypeBlacklist = ["multiple", "blogPost", "forumPost", "presentation", "webpage"];
	
	// PUBLIC FUNCTIONS ===========================================	
	
	function init() {
		Dontprint = Components.classes['@robamler.github.com/dontprint;1']
					.getService().wrappedJSObject;

		try {
			// Firefox 20+
			Components.utils.import("resource://gre/modules/PrivateBrowsingUtils.jsm");
			isInPrivateBrowsingMode = PrivateBrowsingUtils.isContentWindowPrivate(gBrowser.selectedBrowser.contentWindow);
		} catch(e) { }

		dontprintThisPageImg = document.getElementById("dontprint-status-image");
		dontprintProgressImg = document.getElementById("dontprint-progress-image");

		gBrowser.addEventListener("DontprintMessageEvent", function(e) {
			if (
				e.originalTarget instanceof HTMLDocument &&
				(e.originalTarget.location.hostname === "dontprint.net" ||
				e.originalTarget.location.hostname === "www.dontprint.net")
			) {
				if (e.detail.call === "closeCallingTab") {
					e.originalTarget.defaultView.close();
				} else {
					Dontprint.onMessageExternal(e.detail, undefined, function(response) {
						if (typeof response !== undefined) {
							// Apparently, when dispatching an event on a non-
							// priviliged web page from priviliged code, we can
							// set the event detail only to a scalar value.
							// Therefore, we have to JSONify the response.
							// Oddly, in the reverse direction, the event
							// detail can be any JSONifyable value.
							e.originalTarget.dispatchEvent(
								new e.originalTarget.defaultView.CustomEvent(
									"DontprintResponseEvent",
									{
										detail: JSON.stringify({
											returningFrom: e.detail.call,
											response: response
										})
									}
								)
							);
						}
					});
				}
			}
		}, false, true);

		Dontprint.initOnPlatform();

		// Test whether Zotero is installed
		Dontprint.isZoteroInstalled.then(function(haszotero) {
			zoteroInstalled = haszotero;
			if (zoteroInstalled) {
				// Programmatically insert a "Dontprint" button into the Zotero pane
				dontprintFromZoteroBtn = document.createElement("toolbarbutton");
				dontprintFromZoteroBtn.setAttribute("id", "dontprint-zotero-tbbtn");
				dontprintFromZoteroBtn.setAttribute("class", "zotero-tb-button dontprint-icon");
				dontprintFromZoteroBtn.setAttribute("tooltiptext", "Dontprint attached PDF (send to e-reader); right-click for more options");
				dontprintFromZoteroBtn.setAttribute("context", "dontprint-zotero-btn-context");
				dontprintFromZoteroBtn.addEventListener("command", dontprintZoteroSelection);
				
				let toolbar = document.getElementById("zotero-items-toolbar");
				let searchBtn = document.getElementById("zotero-tb-advanced-search");
				toolbar.insertBefore(dontprintFromZoteroBtn, searchBtn);
				toolbar.insertBefore(document.createElement("toolbarseparator"), searchBtn);
				
				// Inject some own code into Zotero's updateStatus() function. This function
				// is called to show or hide the "scrape this"-icon in the address bar.
				// We first call the original Zotero implemntation and then add our own icon.
				// TODO: How can we be sure that this is called *after* Zotero_Browser is initialized?
				// (Seems to work, though.)
				let oldUpdateStatus = Zotero_Browser.updateStatus;
				Zotero_Browser.updateStatus = function() {
					oldUpdateStatus.apply(Zotero_Browser, arguments);
					updateDontprintIconVisibility();
				};
			} else {
				window.Zotero = Components.classes["@robamler.github.com/minimal-zotero;1"]
						.getService(Components.interfaces.nsISupports).wrappedJSObject;
				const loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
								.getService(Components.interfaces.mozIJSSubScriptLoader);
				loader.loadSubScript("chrome://dontprint/content/adapted-from-zotero/browser.js");

				// Register a listener to changes in the visibility of the "Dontprint this page" icon
				Zotero_Browser.updateStatusCallback = updateDontprintIconVisibility;
			}

			// Replace Zotero_Browser.Tab with a wrapper class that keeps
			// a WeakMap of all active tab objects. This allows us to access
			// the tab objects from Dontprint.
			if (!Zotero_Browser.Tab.prototype.isDontprintReplacement) {
				oldZoteroBrowserTab = Zotero_Browser.Tab;
				DontprintTab.prototype = Object.create(Zotero_Browser.Tab.prototype);
				DontprintTab.prototype.constructor = DontprintTab;
				DontprintTab.prototype.isDontprintReplacement = true;
				Zotero_Browser.Tab = DontprintTab;
			}

			updateDontprintIconVisibility();
		});
	}
	

	function DontprintTab(browser) {
		oldZoteroBrowserTab.call(this, browser);
		tabObjects.set(browser, this);
	}

	
	/**
	 * Dontprint the PDFs attached to the selected items in the zotero pane.
	 * @param forceCropWindow Set to true if the page where the user can set custom
	 *   crop margins and page ranges should always be shown even if Dontprint
	 *   thinks to know how to handle articles from this journal.
	 */
	function dontprintZoteroSelection(event, forceCropWindow) {
		Dontprint.dontprintZoteroItems(ZoteroPane.getSelectedItems(), !!forceCropWindow);
	}
	
	
	/**
	 * Dontprint the document represented by the current page. Use functionality
	 * originally developed for Zotero to get the original PDF file and its meta
	 * data. Use the specified translator, or the translator that fits best for the
	 * current page if translator === undefined.
	 * This function is called with translator===undefined when the user clicks the
	 * dontprint icon in the address bar and with translator!==undefined when the
	 * user right-clicks the dontprint icon in the address bar and picks a custom
	 * translator.
	 * @param forceCropWindow Set to true if the page where the user can set custom
	 *   crop margins and page ranges should always be shown even if Dontprint
	 *   thinks to know how to handle articles from this journal.
	 */
	function dontprintThisPage(translator, forceCropWindow) {
		let url = gBrowser.selectedBrowser.contentDocument.location.href.split("#")[0];
		
		if (gBrowser.selectedBrowser.contentDocument.contentType.toLowerCase() === "application/pdf") {
			Dontprint.runJob({
				jobType:			"pdfurl",
				title:				"Unknown title",
				forceCropWindow:	!!forceCropWindow,
				pdfurl:				url,
				pageurl:			url,
				tabId:              Zotero_Browser.tabbrowser.selectedTab
			});
		} else {		
			let tab = _getTabObject(Zotero_Browser.tabbrowser.selectedBrowser);
			Dontprint.runJob({
				jobType:			"page",
				title:				"Retrieving article meta data...",
				translator:			translator,
				forceCropWindow:	!!forceCropWindow,
				pageurl:			url,
				tab:				tab,
				tabId:              Zotero_Browser.tabbrowser.selectedTab
			});
		}

		Dontprint.platformTools.getPrefs({
			autoShowProgress: true
		}).then(function(prefs) {
			if (prefs.autoShowProgress) {
				Dontprint.showProgress(Zotero_Browser.tabbrowser.selectedTab);
			}
		});
	}
	
	
	function cancelJobForThisPage() {
		let pageurl = gBrowser.selectedBrowser.contentDocument.location.href;
		let jobs = Dontprint.getAllRunningJobs();
		for (let jobid in jobs) {
			if (jobs[jobid].pageurl === pageurl) {
				Dontprint.abortJob(jobid);
			}
		}
	}
	
	
	/**
	 * Called when the user right-clicks the dontprint-icon in the address bar.
	 * Show a list of available translators to dontprint the document represented
	 * by the current page.
	 */
	function onStatusPopupShowing(e) {
		let popup = document.getElementById("dontprint-status-image-context-custom-translator-submenu");
		while (popup.hasChildNodes())
			popup.removeChild(popup.lastChild);
		
		let numtranslators = 0;
		try {
			let tab = _getTabObject(Zotero_Browser.tabbrowser.selectedBrowser);
			let translators = tab.page.translators;
			for (let i=0, n=translators.length; i<n; i++) {
				let translator = translators[i];
				
				let menuitem = document.createElement("menuitem");
				menuitem.setAttribute("label", translator.label + (i===0 ? " (recommended)" : ""));
				menuitem.setAttribute("class", "menuitem-iconic");
				menuitem.addEventListener("command", function(e) {
					dontprintThisPage(translator);
				}, false);
				popup.appendChild(menuitem);
				numtranslators++;
			}
		} finally {
			document.getElementById("dontprint-status-image-context-custom-translator").disabled = numtranslators===0;
		}
	}
	
	
	/**
	 * Called when any of the various menus that contains a "Dontprint
	 * this page" button which may have to be disabled is shown.
	 */
	function onDontprintMenuShow(event) {
		event.target.getElementsByClassName("dontprintThisPage")[0].disabled = !(showDontprintIcon && !alreadyProcessing);
	}
	
	
	function registerZoteroTab(doc) {
		let btn = doc.getElementById("dontprint-zotero-tab-tbbtn");
		if (registeredZoteroButtons.indexOf(btn) === -1) {
			registeredZoteroButtons.push(btn);
		}
		updateQueueLength();
	}
	
	
	function unregisterZoteroTab(doc) {
		let btn = doc.getElementById("dontprint-zotero-tab-tbbtn");
		let index = registeredZoteroButtons.indexOf(btn);
		if (index >= 0) {
			registeredZoteroButtons.splice(index, 1);
		}
	}
	
	
	function updateQueueLength() {
		clearInterval(idleAnimationTimer);
		queuelength = Dontprint.getNumberOfRunningJobs();

		if (queuelength === 0) {
			if (zoteroInstalled) {
				dontprintFromZoteroBtn.style.MozImageRegion = "rect(0px 16px 16px 0px)";
			}
			dontprintProgressImg.style.MozImageRegion = "rect(0px 16px 16px 0px)";
			registeredZoteroButtons.forEach(function(el, i) {
				try {
					el.style.MozImageRegion = "rect(0px 16px 16px 0px)";
				} catch (e) {
					// Corresponding tab was apparently closed. Remove from registered buttons.
					registeredZoteroButtons.splice(i, 1);
				}
			});
		} else {
			let len = Math.min(10, queuelength);
			let cliprect = [
				"rect(0px " + (len*16+16) + "px 16px " + (len*16) + "px)",
				"rect(16px " + (len*16+16) + "px 32px " + (len*16) + "px)"
			];
			let animationState = 0;
			let timerfunc = function() {
				if (zoteroInstalled) {
					dontprintFromZoteroBtn.style.MozImageRegion = cliprect[animationState];
				}
				dontprintProgressImg.style.MozImageRegion = cliprect[animationState];
				registeredZoteroButtons.forEach(function(el, i) {
					try {
						el.style.MozImageRegion = cliprect[animationState];
					} catch (e) {
						// Corresponding tab was apparently closed. Remove from registered buttons.
						registeredZoteroButtons.splice(i, 1);
					}
				});
				animationState = (animationState+1)%2;
			};
			timerfunc();
			idleAnimationTimer = setInterval(timerfunc, 2000);
		}
		
		updateDontprintIconVisibility();
	}	
	
	// PRIVATE FUNCTIONS ===========================================	
	
	function updateDontprintIconVisibility() {
		showDontprintIcon = false;
		
		if (isInPrivateBrowsingMode) {
			return;
		}
		
		// First detect if a PDF document is displayed.
		try {
			if (gBrowser.selectedBrowser.contentDocument.contentType.toLowerCase() === "application/pdf") {
				showDontprintIcon = true;
			}
		} catch (e) { } // ignore
		
		// If no PDF document is displayed, try Zotero's translators.
		if (!showDontprintIcon) {
			try {
				let tab = _getTabObject(Zotero_Browser.tabbrowser.selectedBrowser);
				if (tab && tab.page.translators && tab.page.translators.length) {
					let itemType = tab.page.translators[0].itemType;
					if (itemType && itemTypeBlacklist.indexOf(itemType) === -1) {
						showDontprintIcon = true;
					}
				}
			} catch (e) { } // ignore
		}
		
		// update the status icons
		alreadyProcessing = showDontprintIcon && Dontprint.isQueuedUrl(gBrowser.selectedBrowser.contentDocument.location.href);
		dontprintThisPageImg.hidden = !(showDontprintIcon && !alreadyProcessing);
		dontprintProgressImg.hidden = !(showDontprintIcon && alreadyProcessing);
	}
	
	
	/*
	 * Gets a data object given a browser window object (copied from Zotero_Browser)
	 */
	function _getTabObject(browser) {
		if (!browser) {
			return false;
		}
		let ret = tabObjects.get(browser);
		if (ret) {
			return ret;
		} else {
			return new Zotero_Browser.Tab(browser);
		}
	}


	return {
		init,
		registerZoteroTab,
		unregisterZoteroTab,
		dontprintZoteroSelection,
		dontprintThisPage,
		cancelJobForThisPage,
		onStatusPopupShowing,
		onDontprintMenuShow,
		updateQueueLength,
		getDontprint: function() { return Dontprint; }
	};
}());


// Set the onload handler for this gBrowser window
window.addEventListener('load', function(e) { DontprintBrowser.init(); }, false);
