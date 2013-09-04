DontprintBrowser = (function() {
	var dontprintThisPageMenuItem = null;
	var dontprintThisPageImg = null;
	var dontprintProgressImg = null;
	var dontprintFromZoteroBtn = null;
	var Dontprint = null;
	var idleAnimationTimer = null;
	var idleAnimationState = 0;
	
	
	// PUBLIC FUNCTIONS ===========================================	
	
	function init() {
		Dontprint = Components.classes['@robamler.github.com/dontprint;1']
					.getService().wrappedJSObject;
		
		dontprintThisPageMenuItem = document.getElementById("dontprint-this-page-menu-item");
		dontprintThisPageImg = document.getElementById("dontprint-status-image");
		dontprintProgressImg = document.getElementById("dontprint-progress-image");
		
		if (Dontprint.isZoteroInstalled()) {
			// Programmatically insert a "Dontprint" button into the Zotero pane
			dontprintFromZoteroBtn = document.createElement("toolbarbutton");
			dontprintFromZoteroBtn.setAttribute("id", "dontprint-tbbtn");
			dontprintFromZoteroBtn.setAttribute("class", "zotero-tb-button");
			dontprintFromZoteroBtn.setAttribute("tooltiptext", "Dontprint selected item(s) (send to e-reader); right-click for progress information");
			dontprintFromZoteroBtn.addEventListener("click", function(event) {
				if (event.button === 2) {
					Dontprint.showProgress();
				}
			}, true);
			dontprintFromZoteroBtn.addEventListener("command", function() {
				Dontprint.dontprintZoteroItems(ZoteroPane.getSelectedItems());
			}, true);
			
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
		let tab = _getTabObject(Zotero_Browser.tabbrowser.selectedBrowser);
		Dontprint.runJob({
			title:		'Unknown title',
			jobType:	'page',
			translator:	translator,
			forceCropWindow: forceCropWindow,
			pageurl:	tab.page.document.location.href,
			tab:		tab
		});
	}
	
	
	function cancelJobForThisPage() {
		let tab = _getTabObject(Zotero_Browser.tabbrowser.selectedBrowser);
		let pageurl = tab.page.document.location.href;
		let jobs = Dontprint.getRunningJobs();
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
		let popup = e.target;
		while (popup.hasChildNodes())
			popup.removeChild(popup.lastChild);
		
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
		}
	}
	
	
	function updateQueueLength(queuelength) {
		clearInterval(idleAnimationTimer);
		
		if (queuelength === 0) {
			if (Dontprint.isZoteroInstalled()) {
				dontprintFromZoteroBtn.style.listStyleImage = "url('chrome://dontprint/skin/dontprint-btn/idle.png')";
			}
			dontprintProgressImg.src = "chrome://dontprint/skin/dontprint-btn/idle.png";
		} else {
			let len = Math.min(10, queuelength);
			let timerfunc = function() {
				if (Dontprint.isZoteroInstalled()) {
					dontprintFromZoteroBtn.style.listStyleImage = "url('chrome://dontprint/skin/dontprint-btn/"+len+("ab"[idleAnimationState])+".png')";
				}
				dontprintProgressImg.src = "chrome://dontprint/skin/dontprint-btn/"+len+("ab"[idleAnimationState])+".png";
				idleAnimationState = (idleAnimationState+1)%2;
			};
			timerfunc();
			idleAnimationTimer = setInterval(timerfunc, 2000);
		}
		
		updateDontprintIconVisibility();
	}	
	
	// PRIVATE FUNCTIONS ===========================================	
	
	function updateDontprintIconVisibility() {
		let tab = _getTabObject(Zotero_Browser.tabbrowser.selectedBrowser);
		
		let showDontprintIcon = false;
		if (tab && tab.page.translators && tab.page.translators.length) {
			let itemType = tab.page.translators[0].itemType;
			if (itemType !== "multiple") {		//TODO: implement itemType === "multiple"
				showDontprintIcon = true;
			}
		}
		
		let alreadyProcessing = showDontprintIcon && Dontprint.isQueuedUrl(tab.page.document.location.href);
		
		dontprintThisPageMenuItem.disabled = !(showDontprintIcon && !alreadyProcessing);
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
		dontprintThisPage: dontprintThisPage,
		cancelJobForThisPage: cancelJobForThisPage,
		updateQueueLength: updateQueueLength,
		onStatusPopupShowing: onStatusPopupShowing,
		configureDontprint: configureDontprint,
		getDontprint: function() { return Dontprint; }
	};
}());


// Set the onload handler for this gBrowser window
window.addEventListener('load', function(e) { DontprintBrowser.init(); }, false);
