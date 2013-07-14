Dontprint = (function() {
	var databasePath = null;
	var dontprintThisPageImg = null;
	var dontprintProgressImg = null;
	var dontprintFromZoteroBtn = null;
	var queuedUrls = [];
	var defaultCropParams = {
		builtin:false, remember:true, coverpage:false, m1:0.52, m2:0.2, m3:0.2, m4:0.2
	};
	
	
	// ==== PUBLICLY VISIBLE METHODS ================================
	
	function init() {
		Components.utils.import("resource://gre/modules/FileUtils.jsm");
		Components.utils.import("resource://gre/modules/Sqlite.jsm")
		Components.utils.import("resource://gre/modules/Task.jsm");
		try {
			// Gecko >= 25
			Components.utils.import("resource://gre/modules/Promise.jsm");
		} catch (e) {
			try {
				// Gecko 21 to 24
				Components.utils.import("resource://gre/modules/commonjs/sdk/core/promise.js");
			} catch (e) {
				// Gecko 17 to 20
				Components.utils.import("resource://gre/modules/commonjs/promise/core.js");
			}
		}
		
		dontprintThisPageImg   = document.getElementById("dontprint-status-image");
		dontprintFromZoteroBtn = document.getElementById("dontprint-tbbtn");
		dontprintProgressImg   = document.getElementById("dontprint-progress-image");
		
		prefs = Components.classes["@mozilla.org/preferences-service;1"]
						.getService(Components.interfaces.nsIPrefService)
						.getBranch("extensions.dontprint.");
		
		// Initialize database in file "dontprint/db.sqlite" in the profile directory
		// FileUtils.getFile() creates the directory (but not the file) if necessary
		let dbfile = FileUtils.getFile("ProfD", ["dontprint", "db.sqlite"]);
		databasePath = dbfile.path
		
		Task.spawn(function initDatabase() {
			try {
				// Sqlite.openConnection() creates the file if necessary
				var conn = yield Sqlite.openConnection({path: databasePath});
				let exists = yield conn.tableExists("journals");
				if (!exists) {
					yield conn.execute("CREATE TABLE journals (" +
						"journalname TEXT UNIQUE ON CONFLICT REPLACE COLLATE NOCASE," +
						"builtin INT," +
						"remember INT," +
						"coverpage INT," +
						"m1 TEXT," +				// for some reason, using FLOAT here dosn't work
						"m2 TEXT," +
						"m3 TEXT," +
						"m4 TEXT," +
						"CHECK(journalname <> '')" +
					")");
				}
			} finally {
				yield conn.close();
			}
		});
		
		var that = this;
		
		// Inject some own code into Zotero's updateStatus() function. This function
		// is called to show or hide the "scrape this"-icon in the address bar.
		// We first call the original Zotero implemntation and then add our own icon.
		var oldUpdateStatus = Zotero_Browser.updateStatus;
		
		Zotero_Browser.updateStatus = function() {
			oldUpdateStatus.apply(Zotero_Browser, arguments);
			updateDontprintIconVisibility();
		};
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
	 */
	function dontprintThisPage(translator) {
		var tab = _getTabObject(Zotero_Browser.tabbrowser.selectedBrowser);
		runJob({
			jobType:	'page',
			translator:	translator,
			pageurl:	tab.page.document.location.href
		});
	}
	
	
	/**
	 * Called when the user clicks the dontprint button in the Zotero pane.
	 */
	function dontprintSelectionInZotero() {
		var selectedItems = ZoteroPane.getSelectedItems();
		
		// delete duplicates (e.g., if user selects both an attachment and its parent)
		var entryIds = selectedItems.map(function(i) {
			return i.getSource() || i.id;
		});
		var uniqueEntryIds = entryIds.filter(function(elem, pos, self) {
			return self.indexOf(elem) == pos;
		})
		
		// generate list of all meta data
		var jobs = uniqueEntryIds.map(function(id) {
			var i = Zotero.Items.get(id);
			var attachmentPaths = i.getAttachments(false).map(function(id) {
				var a_item = Zotero.Items.get(id);
				if (a_item.attachmentMIMEType === 'application/pdf') {
					var file = a_item.getFile();
					if (file) {
						return file.path;
					}
				}
				return undefined;
			}).filter(function(elem) {
				return elem !== undefined;
			});

			// Find field names in Zotero's resource/schema/system.sql (grep "INSERT INTO fields" in zotero source code to get a list of field names)
			return {
				jobType:			'zotero',
				zoteroKey:			i.getField('key'),
				title:				i.getField('title'),
				journalLongname:	i.getField('publicationTitle'),
				journalShortname:	i.getField('journalAbbreviation'),
				originalFilePath:	attachmentPaths.length === 0 ? undefined : attachmentPaths[0],
				tmpFiles:			[]
			};
		});
		
		// remove entries without attached PDF files
		var noattach = jobs.filter(function(elem) {
			return elem.originalFilePath === undefined;
		});
		if (noattach.length) {
			alert("The following selected items cannot be sent to your e-reader because they do not have an attached PDF file:\n\n" +
				noattach.map(function(elem) { return elem.title; }).join("\n"));
		}
		
		jobs = jobs.filter(function(elem) {
			return elem.originalFilePath !== undefined;
		});
		if (jobs.length == 0) {
			alert("No documents sent to your e-reader. Select an item with an attached PDF file and try again.");
			return;
		}
		
		jobs.forEach(runJob);
	}
	
	
	function showProgress() {
		//TODO
	}
	
	
	/**
	 * Called when the user right-clicks the dontprint-icon in the address bar.
	 * Show a list of available translators to dontprint the document represented
	 * by the current page.
	 */
	function onStatusPopupShowing(e) {
		var popup = e.target;
		while (popup.hasChildNodes())
			popup.removeChild(popup.lastChild);
		
		var tab = _getTabObject(Zotero_Browser.tabbrowser.selectedBrowser);
		var translators = tab.page.translators;
		for (var i=0, n=translators.length; i<n; i++) {
			let translator = translators[i];
			
			var menuitem = document.createElement("menuitem");
			menuitem.setAttribute("label", "Dontprint document using " + translator.label + (i===0 ? " (recommended)" : ""));
			menuitem.setAttribute("image", (translator.itemType === "multiple"
				? "chrome://zotero/skin/treesource-collection.png"
				: Zotero.ItemTypes.getImageSrc(translator.itemType)));
			menuitem.setAttribute("class", "menuitem-iconic");
			menuitem.addEventListener("command", function(e) {
 				dontprintThisPage(translator);
			}, false);
			popup.appendChild(menuitem);
		}
	}
	
	
	// ==== LIFE CYCLE OF A DONTPRINT JOB ===========================
	
	function runJob(job) {
		var cleanup = function() {
			incrementQueueLength(-1, job.pageurl);
			job.tmpFiles.forEach(deleteFile);
		};
		
		Task.spawn(function() {
			var newtab = null;
			try {
				// show progress indicator
				incrementQueueLength(+1, job.pageurl);
				
				if (job.jobType === 'page')
					yield grabOriginalFileForCurrentTab(job);
				
				yield cropMargins(job);
				yield convertDocument(job);
				newtab = yield authorizeSendmail(job);
				let setProgress = yield connectToSendmailTab(job, newtab.tabBrowser);
				yield sendEmail(job, newtab.tabBrowser, setProgress);
			} catch (e) {
				job.result = {
					error: true,
					errorString: e.toString()
				};
			} finally {
				if (job.result.errorString !== "canceled") {
					yield displayResult(job, newtab);
				}
			}
		}).then(cleanup, cleanup);
	}
	
	
	function grabOriginalFileForCurrentTab(job) {
		var tab = _getTabObject(Zotero_Browser.tabbrowser.selectedBrowser);
		if (!tab || !tab.page.translators || !tab.page.translators.length) {
			throw "No translators available for this web site.";
		}
		
		var pdfFile = FileUtils.getFile("TmpD", ["dontprint-original.pdf"]);
		pdfFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
		
		var translate = new Zotero.Translate.Dontprint();
		translate.setDocument(tab.page.translate.document);
		translate.setDestFile(pdfFile);
		translate.setTranslator(job.translator || tab.page.translators[0]);
		job.translator = undefined;		// avoid memory leak
		translate.clearHandlers("done");
		translate.clearHandlers("itemDone");
		
		// Call runJob() as soon as both the "itemDone" handler was fired and
		// the "attachDone" handler was fired, independently of which one happens first.
		// But make sure to call runJob() no more than once
		var itemDoneDeferred = Promise.defer();
		var attachDoneDeferred = Promise.defer();
		
		translate.setAttachDoneHandler(attachDoneDeferred.resolve);
		
		translate.setHandler("itemDone", function(obj, dbItem, item) {
			// Apparently, this is called when the item meta data is ready but attachments may still be being downloaded
			job.zoteroKey			= checkUndefined(item.id, "noid");
			job.title				= checkUndefined(item.title, "Untitled document");
			job.journalLongname		= checkUndefined(item.publicationTitle);
			job.journalShortname	= checkUndefined(item.journalAbbreviation);
			job.originalFilePath	= pdfFile.path;
			job.tmpFiles			= [pdfFile.path];
			itemDoneDeferred.resolve();
		});
		
		//TODO: test what happens when user clicks "save to zotero" shortly after clicking "dontprint" (or vice versa)
		translate.translate(null);
		
		yield itemDoneDeferred.promise;
		yield attachDoneDeferred.promise;

		// remove event handlers (avoid memory leaks)
		translate.clearHandlers("done");
		translate.clearHandlers("itemDone");
		translate.setAttachDoneHandler(null);
	}
	
	
	function cropMargins(job) {
		try {
			var conn = yield Sqlite.openConnection({path: databasePath});
			var sqlresult = yield conn.executeCached(
				"SELECT * FROM journals WHERE journalname = ? OR journalname = ?",
				[job.journalLongname, job.journalShortname]
			);
		} catch (e) {
			// ignore errors
		} finally {
			yield conn.close();
		}
		
		if (sqlresult.length === 0) {
			job.crop = defaultCropParams;
		} else {
			job.crop = {};
			["journalname", "builtin", "remember", "coverpage", "m1", "m2", "m3", "m4"].forEach(
				function(key) {
					job.crop[key] = sqlresult[0].getResultByName(key);
				}
			);
		}
		
		if (sqlresult.length === 0 || !job.crop.remember) {
			let gBrowser = Components.classes["@mozilla.org/appshell/window-mediator;1"]
				.getService(Components.interfaces.nsIWindowMediator)
				.getMostRecentWindow("navigator:browser").gBrowser;
			let newTabBrowser = gBrowser.getBrowserForTab(
				gBrowser.loadOneTab("chrome://dontprint/content/pdfcrop/pdfcrop.html", {inBackground:false})
			);
			
 			let deferred = Promise.defer();
			let onloadfunction = function () {
				// remove event listener because otherwise refreshing pdfCrop will reload a rejected job
				newTabBrowser.removeEventListener("load", onloadfunction, true);
				
				// Wrap callbacks in a setTimeout to make sure that execution after the
				// next yield operator doesn't block the closing of the PDFCrop tab.
				newTabBrowser.contentWindow.PDFCrop.init(
					job,
					function() {setTimeout(deferred.resolve, 0);},
					function(reason) {setTimeout(function() {deferred.reject(reason);}, 0);}
				);
			};
			newTabBrowser.addEventListener("load", onloadfunction, true);
			yield deferred.promise;
			
			if (!job.crop.builtin) {
				try {
					var conn2 = yield Sqlite.openConnection({path: databasePath});
					if (job.journalLongname !== undefined && job.journalLongname !== "") {
						yield conn2.executeCached("INSERT INTO journals VALUES (?, 0, ?, ?, ?, ?, ?, ?)", [
							job.journalLongname,
							job.crop.remember ? 1 : 0,
							job.crop.coverpage ? 1 : 0,
							""+job.crop.m1,		// explicitly cast margins to strings
							""+job.crop.m2,		// (don't know why this is necessary
							""+job.crop.m3,		// but, whithout this, sqlite would
							""+job.crop.m4		// only store the integer part)
						]);
					}
					if (job.journalShortname !== undefined && job.journalShortname !== "") {
						yield conn2.executeCached("INSERT INTO journals VALUES (?, 0, ?, ?, ?, ?, ?, ?)", [
							job.journalShortname,
							job.crop.remember ? 1 : 0,
							job.crop.coverpage ? 1 : 0,
							""+job.crop.m1,		// explicitly cast margins to strings
							""+job.crop.m2,		// (don't know why this is necessary
							""+job.crop.m3,		// but, whithout this, sqlite would
							""+job.crop.m4		// only store the integer part)
						]);
					}
				} catch (e) {
					alert(e.toString());
					// ignore errors
				} finally {
					yield conn2.close();
				}
			}
		}
	}
	
	
	function convertDocument(job) {
		// TODO: create preferences frontend to set:
		// * extensions.dontprint.k2pdfoptpath
		
		let exec = getK2pdfopt();
		if (!exec.exists()) {
			throw (exec.path + " does not exist");
		}
		
		let proc = Components.classes["@mozilla.org/process/util;1"]
						.createInstance(Components.interfaces.nsIProcess);
		proc.init(exec);
		
		let outFile = FileUtils.getFile("TmpD", ["dontprint-converted.pdf"]);
		outFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
		job.convertedFilePath = outFile.path;
		job.tmpFiles.push(outFile.path);
		
		let args = [
			'-ui-', '-x', '-w', '557', '-h', '721',
			'-ml', job.crop.m1,
			'-mt', job.crop.m2,
			'-mr', job.crop.m3,
			'-mb', job.crop.m4,
			'-p', job.crop.coverpage ? '2-' : '1-',
			job.originalFilePath,
			'-o', job.convertedFilePath
		];
		
		let deferred = Promise.defer();
		proc.runwAsync(args, args.length, {observe: deferred.resolve});
		yield deferred.promise;
	}
	
	
	function authorizeSendmail(documentData, filePath) {
		let url = buildURL(
			"https://script.google.com/macros/s/AKfycbwHzmRW7Ki7BYoPAdsC5o1sPaimzbr7jMW06OWouEQS-AtQMfo/exec",
			{authorize: (new Date()).getTime()}  // circumvent cache
		);
		
		// Open tab in background
		let gBrowser = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator)
			.getMostRecentWindow("navigator:browser").gBrowser;
		let tab = gBrowser.loadOneTab(url, {inBackground:true});
		let tabBrowser = gBrowser.getBrowserForTab(tab);
		
		// set onload-handler for new tab. This cannot be done in Google Apps Script because we need to communicate back to this code.
		let deferred = Promise.defer();
		let onloadFunction = authorizeSendmailOnloadHandler(tabBrowser.contentWindow, deferred.resolve);
		let oncloseFunction = function() {
			deferred.reject("canceled");
		};
		tabBrowser.addEventListener("load", onloadFunction, true);
		tab.addEventListener("TabClose", oncloseFunction, true);
		yield deferred.promise;
		tabBrowser.removeEventListener("load", onloadFunction, true);
		tab.removeEventListener("TabClose", oncloseFunction, true);
		
		// return tabBrowser to parent task (this is better than setting tabBrowser as
		// a member field in task because it makes code that leaks memory easier to spot.)
		throw new Task.Result({gBrowser:gBrowser, tab: tab, tabBrowser: tabBrowser});
	}
	
	
	function authorizeSendmailOnloadHandler(win, resolveFunction) {
		var alreadyAskedForAuth = false;
		
		return function() {
			if (win.location.href.match(/^https\:\/\/accounts\.google\.com\//) ||
				win.document.title.match(/Authorization needed/) ||
				win.document.getElementById("auth-required") !== null
			) {
				// The user either needs to authorize Dontprint or to authenticate himself. In any case, bring tab to front.
				// win.alert() automatically brings corresponding tab to front
				if (!alreadyAskedForAuth) {
					alreadyAskedForAuth = true;
					win.alert("Please sign in to your Google account and allow Dontprint to send e-mails from your Gmail address.");
				}
			} else if (win.document.title.match(/ \(Dontprint\)$/)) {
				// the user is signed in and has authorized Dontprint to send e-mails
				resolveFunction();
			}
		};
	}
	
	
	function connectToSendmailTab(job, tabBrowser) {
		// Set Dontprint favicon
		let favicon = tabBrowser.contentWindow.document.createElement('link');
		favicon.type = 'image/x-icon';
		favicon.rel = 'shortcut icon';
		favicon.href = 'http://robamler.github.io/dontprint/webapp/favicon.png';
		tabBrowser.contentWindow.document.getElementsByTagName('head')[0].appendChild(favicon);
		
		let progressBar = null;
		let setProgress = function(value) {
			if (!progressBar) {
				if (
					tabBrowser.contentWindow.frames.length === 1 &&
					tabBrowser.contentWindow.frames[0].document.getElementsByName("dontprint-state").length === 1 &&
					tabBrowser.contentWindow.frames[0].document.getElementsByName("dontprint-state")[0].value === "loaded"
				) {
					let divs = tabBrowser.contentWindow.frames[0].document.getElementsByTagName("div");
					progressBar = divs[divs.length-1];
				} else {
					return;
				}
			}
			progressBar.style.width = value*400 + "px";
		};
		return setProgress;
	}
	
	
	function sendEmail(job, tabBrowser, setProgress) {
		// TODO: create preferences frontend to set:
		// * extensions.dontprint.recipientEmailPrefix
		// * extensions.dontprint.recipientEmailSuffix
		// * extensions.dontprint.ccEmails
		
		var url = buildURL(
			"https://script.google.com/macros/s/AKfycbwHzmRW7Ki7BYoPAdsC5o1sPaimzbr7jMW06OWouEQS-AtQMfo/exec",
			{
				filename:		job.title.replace(/[^a-zA-Z0-9 .\-_,]+/g, "_") + ".pdf",
				recipientEmail:	prefs.getCharPref("recipientEmailPrefix") + prefs.getCharPref("recipientEmailSuffix"),
				ccEmails:		prefs.getCharPref("ccEmails"),
				itemKey:		job.zoteroKey
			}
		);
		
		// Prepare post data
		var file = Components.classes["@mozilla.org/file/local;1"]
					.createInstance(Components.interfaces.nsILocalFile);
		file.initWithPath(job.convertedFilePath);
		if (!file.exists()) {
			throw filepath + " does not exist";
		}
		var filesize = file.fileSize;
		var stream = Components.classes["@mozilla.org/network/file-input-stream;1"]
					.createInstance(Components.interfaces.nsIFileInputStream);
		stream.init(file, 0x04 | 0x08, 0644, 0x04);
		var postData = Components.classes["@mozilla.org/network/mime-input-stream;1"].
					createInstance(Components.interfaces.nsIMIMEInputStream);
		postData.addHeader("Content-Type", "application/pdf");
		postData.addContentLength = true;
		postData.setData(stream);
		
		// Use XHR to send POST data because sending POST data directly to the new
		// tab will freeze the interface and change the tab's title to "Connecting",
		// which is wrong.
		var req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
							.createInstance(Components.interfaces.nsIXMLHttpRequest);
		
		let deferred = Promise.defer();
		
		req.upload.onprogress = function (e) {
			setProgress(0.9*(e.loaded / e.total));
		};
		req.onload = function () {
			setProgress(1);
			job.result = JSON.parse(req.responseText);
			deferred.resolve();
		};
		req.onerror = function (e) {
			deferred.reject("Sendmail error: " + e.toString());
		};
		req.open('POST', url, true);
		req.send(stream);
		yield deferred.promise;
	}
	
	
	function displayResult(job, newtab) {
		var url = "chrome://dontprint/content/sendmail/" + (job.result.error ? "error" : "success") + ".html";
		deferred = Promise.defer();
		let onloadFunction = function() {
			newtab.tabBrowser.contentWindow.initDisplay(job);
			deferred.resolve();
		}
		
		if (newtab === null) {
			// Open new tab
			let gBrowser = Components.classes["@mozilla.org/appshell/window-mediator;1"]
				.getService(Components.interfaces.nsIWindowMediator)
				.getMostRecentWindow("navigator:browser").gBrowser;
			let tab = gBrowser.loadOneTab(url, {inBackground: !job.result.error});
			let tabBrowser = gBrowser.getBrowserForTab(tab);
			tabBrowser.addEventListener("load", onloadFunction, true);
			newtab = {tabBrowser: tabBrowser};
		} else {
			// reuse existing tab
			newtab.tabBrowser.addEventListener("load", onloadFunction, true);
			newtab.tabBrowser.loadURIWithFlags(url, newtab.tabBrowser.webNavigation.LOAD_FLAGS_REPLACE_HISTORY);
		}
		yield deferred.promise;
		newtab.tabBrowser.removeEventListener("load", onloadFunction, true);
		
		if (job.result.error && newtab.tab !== undefined) {
			newtab.gBrowser.selectedTab = newtab.tab;
		}
	}
	
	
	// ==== HELPER FUNCTIONS ========================================================
	
	function deleteFile(path) {
		let f = Components.classes["@mozilla.org/file/local;1"]
				.createInstance(Components.interfaces.nsILocalFile);
		f.initWithPath(path);
		if (f.exists()) {
			f.remove(false);
		}
	}
	
	
	function getK2pdfopt() {
		var path = prefs.getCharPref("k2pdfoptpath");
		var ret;
		
		if (path[0] === "%") {
			// path is relative to profile directory.
			// Always use "/" file separator when storing relative paths.
			// Use FileUtils to convert to system file separator.
			var ret = FileUtils.getFile("ProfD", path.substring(1).split("/"));
		} else {
			// path is absolute
			ret = Components.classes["@mozilla.org/file/local;1"]
						.createInstance(Components.interfaces.nsILocalFile);
			ret.initWithPath(path);
		}
		return ret;
	}
	
	
	function updateDontprintIconVisibility() {
		var tab = _getTabObject(Zotero_Browser.tabbrowser.selectedBrowser);
		
		var showDontprintIcon = false;
		if (tab && tab.page.translators && tab.page.translators.length) {
			var itemType = tab.page.translators[0].itemType;
			if (itemType !== "multiple")		//TODO: implement itemType === "multiple"
				showDontprintIcon = true;
		}
		
		var alreadyProcessing = showDontprintIcon && queuedUrls.indexOf(tab.page.document.location.href) !== -1;
		dontprintThisPageImg.hidden = !(showDontprintIcon && !alreadyProcessing);
		dontprintProgressImg.hidden = !(showDontprintIcon && alreadyProcessing);
	}
	
	/*
	 * Gets a data object given a browser window object
	 */
	function _getTabObject(browser) {
		if(!browser) return false;
		if(!browser.zoteroBrowserData) {
			browser.zoteroBrowserData = new Zotero_Browser.Tab(browser);
		}
		return browser.zoteroBrowserData;
	}
	
	/**
	 * return value if value isn't undefined; otherwise, return defaultTo or empty string
	 */
	function checkUndefined(value, defaultTo) {
		return value === undefined ? (defaultTo === undefined ? '' : defaultTo) : value;
	}
	
	
	var incrementQueueLength = (function() {
		// local variables
		var queuelength = 0;
		var timer = null;
		var state = 0;
		
		// the actual function "incrementQueueLength(inc, url)"
		return function(inc, url) {
			clearInterval(timer);
			
			if (url !== undefined) {
				if (inc > 0) {
					queuedUrls.push(url);
				} else if (inc < 0) {
					var index = queuedUrls.indexOf(url);
					if (index !== -1) {
						queuedUrls.splice(index, 1);
					}
				}
				updateDontprintIconVisibility();
			}
			
			queuelength = Math.max(0, queuelength+inc);
			
			if (queuelength === 0) {
				dontprintFromZoteroBtn.style.listStyleImage = "url('chrome://dontprint/skin/dontprint-btn/idle.png')";
				dontprintProgressImg.src = "chrome://dontprint/skin/dontprint-btn/idle.png";
			} else {
				var len = Math.min(10, queuelength);
				var timerfunc = function() {
					dontprintFromZoteroBtn.style.listStyleImage = "url('chrome://dontprint/skin/dontprint-btn/"+len+("ab"[state])+".png')";
					dontprintProgressImg.src = "chrome://dontprint/skin/dontprint-btn/"+len+("ab"[state])+".png";
					state = (state+1)%2;
				};
				timerfunc();
				timer = setInterval(timerfunc, 2000);
			}
			
			return queuelength;
		};
	}());
	
	
	function buildURL(main, params) {
		if (main === null)
			main = "";
		var firstsep = (main === "" ? '' : (main.indexOf("?") === -1 ? '?' : '&'));
		var i = 0;
		for (j in params) {
			main += (i++ === 0 ? firstsep : '&') + encodeURIComponent(j) + '=' + encodeURIComponent(params[j]);
		}
		return main;
	}
	
	
	// ==== RETURN PUBLICLY VISIBLE METHODS =========================
	
	return {
		init: init,
		dontprintSelectionInZotero: dontprintSelectionInZotero,
		onStatusPopupShowing: onStatusPopupShowing,
		dontprintThisPage: dontprintThisPage,
		showProgress: showProgress
	};
}());


// Initialize the utility
window.addEventListener('load', function(e) { Dontprint.init(); }, false);
