DontprintBrowser = (function() {
	var dontprintThisPageImg = null;
	var dontprintProgressImg = null;
	var dontprintFromZoteroBtn = null;
	var Dontprint = null;
	var idleAnimationTimer = null;
	var showDontprintIcon = false;
	var alreadyProcessing = false;
	var isInPrivateBrowsingMode = false;
	
	
	// PUBLIC FUNCTIONS ===========================================	
	
	function init() {
		Dontprint = Components.classes['@robamler.github.com/dontprint;1']
					.getService().wrappedJSObject;
		
		try {
			// Firefox 20+
			Components.utils.import("resource://gre/modules/PrivateBrowsingUtils.jsm");
			isInPrivateBrowsingMode = PrivateBrowsingUtils.isWindowPrivate(gBrowser.selectedBrowser.contentWindow);
		} catch(e) { }
		
		dontprintThisPageImg = document.getElementById("dontprint-status-image");
		dontprintProgressImg = document.getElementById("dontprint-progress-image");
		
		if (Dontprint.isZoteroInstalled()) {
			// Programmatically insert a "Dontprint" button into the Zotero pane
			dontprintFromZoteroBtn = document.createElement("toolbarbutton");
			dontprintFromZoteroBtn.setAttribute("id", "dontprint-zotero-tbbtn");
			dontprintFromZoteroBtn.setAttribute("class", "zotero-tb-button");
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
			let oldUpdateStatus = Zotero_Browser.updateStatus;
			Zotero_Browser.updateStatus = function() {
				oldUpdateStatus.apply(Zotero_Browser, arguments);
				updateDontprintIconVisibility();
			};
		} else {
			// Initialize the included Zotero xpcom module
			Zotero = Components.classes["@robamler.github.com/minimal-zotero;1"]
				.getService(Components.interfaces.nsISupports).wrappedJSObject;
			const loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
							.getService(Components.interfaces.mozIJSSubScriptLoader);
			loader.loadSubScript("chrome://dontprint/content/adapted-from-zotero/browser.js");
			
			// Register a listener to changes in the visibility of the "Dontprint this page" icon
			Zotero_Browser.updateStatusCallback = updateDontprintIconVisibility;
		}
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
		let url = gBrowser.selectedBrowser.contentDocument.location.href;
		
		if (gBrowser.selectedBrowser.contentDocument.contentType.toLowerCase() === "application/pdf") {
			let title = decodeURIComponent(url.match(/([^/]*?)(\.pdf)?([?#].*)?$/i)[1]);
			if (!title) {
				title = "Untitled document";
			}
			Dontprint.runJob({
				jobType:			"pdfurl",
				title:				title,
				forceCropWindow:	!!forceCropWindow,
				pdfurl:				url,
				identifierurl:		url,
				journalLongname:	"",
				journalShortname:	"",
				tmpFiles:			[]
			});
		} else {		
			let tab = _getTabObject(Zotero_Browser.tabbrowser.selectedBrowser);
			Dontprint.runJob({
				title:				'Unknown title',
				jobType:			'page',
				translator:			translator,
				forceCropWindow:	!!forceCropWindow,
				pageurl:			url,
				identifierurl:		url,
				tab:				tab
			});
		}
	}
	
	
	function cancelJobForThisPage() {
		let identifierurl = gBrowser.selectedBrowser.contentDocument.location.href;
		let jobs = Dontprint.getRunningJobs();
		for (let jobid in jobs) {
			if (jobs[jobid].identifierurl === identifierurl) {
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
	
	
	function updateQueueLength(queuelength) {
		clearInterval(idleAnimationTimer);
		if (queuelength === 0) {
			if (Dontprint.isZoteroInstalled()) {
				dontprintFromZoteroBtn.style.MozImageRegion = "rect(0px 16px 16px 0px)";
			}
			dontprintProgressImg.style.MozImageRegion = "rect(0px 16px 16px 0px)";
			try {
				document.getElementById("dontprint-toolbar-button").style.MozImageRegion = "rect(0px 16px 16px 0px)";
			} catch (e) {} // button not displayed
		} else {
			let len = Math.min(10, queuelength);
			let cliprect = [
				"rect(0px " + (len*16+16) + "px 16px " + (len*16) + "px)",
				"rect(16px " + (len*16+16) + "px 32px " + (len*16) + "px)"
			];
			let animationState = 0;
			let timerfunc = function() {
				if (Dontprint.isZoteroInstalled()) {
					dontprintFromZoteroBtn.style.MozImageRegion = cliprect[animationState];
				}
				dontprintProgressImg.style.MozImageRegion = cliprect[animationState];
				try {
					document.getElementById("dontprint-toolbar-button").style.MozImageRegion = cliprect[animationState];
				} catch (e) {} // button not displayed
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
					if (itemType !== "multiple") {
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
	
	
	function configureDontprint() {
		window.openDialog(
			'chrome://dontprint/content/options/options.xul',
			'dontprint-prefs',
			'chrome,titlebar,toolbar,dialog=yes'
		).focus();  // focus the window if it was already open
	}
	
	
	/*
	 * Gets a data object given a browser window object (copied from Zotero_Browser)
	 */
	function _getTabObject(browser) {
		if(!browser) return false;
		if(!browser.zoteroBrowserData) {
			browser.zoteroBrowserData = new Zotero_Browser.Tab(browser);
		}
		return browser.zoteroBrowserData;
	}
	
	
	return {
		init: init,
		dontprintZoteroSelection: dontprintZoteroSelection,
		dontprintThisPage: dontprintThisPage,
		cancelJobForThisPage: cancelJobForThisPage,
		updateQueueLength: updateQueueLength,
		onStatusPopupShowing: onStatusPopupShowing,
		onDontprintMenuShow: onDontprintMenuShow,
		configureDontprint: configureDontprint,
		getDontprint: function() { return Dontprint; }
	};
}());


// Set the onload handler for this gBrowser window
window.addEventListener('load', function(e) { DontprintBrowser.init(); }, false);
