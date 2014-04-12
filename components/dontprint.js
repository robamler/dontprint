function Dontprint() {
	const DATABASE_VERSION = 20140216;
	var k2pdfoptTestTimeout;
	var databasePath = null;
	var zoteroInstalled = false;
	var queuedUrls = [];
	var runningJobs = {};
	var progressListeners = {};
	var queuelength = 0;
	var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
					.getService(Components.interfaces.nsIPromptService);
	
	const EREADER_MODEL_DEFAULTS = {
		'paperwhite':		{w: 708,  h: 935,  ppi: 212},
		'touch':			{w: 557,  h: 721,  ppi: 167},
		'generation4':		{w: 557,  h: 721,  ppi: 167},
		'keyboard':			{w: 557,  h: 721,  ppi: 167},
		'dx':				{w: 790,  h: 1110, ppi: 150},
		'generation2':		{w: 557,  h: 721,  ppi: 167},
		'generation1':		{w: 557,  h: 721,  ppi: 167},
		'fire-1or2':		{w: 557,  h: 940,  ppi: 169},
		'fire-hd-7inch':	{w: 750,  h: 1180, ppi: 216},
		'fire-hd-8p9inch':	{w: 1136, h: 1800, ppi: 254},
		'other':			{w: 600,  h: 800,  ppi: 170}
	};
	
	
	// ==== PUBLICLY VISIBLE METHODS ================================
	
	function init() {
		Components.utils.import("resource://gre/modules/FileUtils.jsm");
		Components.utils.import("resource://gre/modules/Sqlite.jsm")
		Components.utils.import("resource://gre/modules/Task.jsm");
		Components.utils.import("resource://EXTENSION/subprocess.jsm");
		Components.utils.import("resource://gre/modules/AddonManager.jsm");
		Components.utils.import("resource://gre/modules/Timer.jsm");
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
		
		prefs = Components.classes["@mozilla.org/preferences-service;1"]
						.getService(Components.interfaces.nsIPrefService)
						.getBranch("extensions.dontprint.");
		
		// Initialize database in file "dontprint/db3.sqlite" in the profile directory
		// FileUtils.getFile() creates the directory (but not the file) if necessary
		let dbfile = FileUtils.getFile("ProfD", ["dontprint", "db3.sqlite"]);
		databasePath = dbfile.path
		
		Task.spawn(function() {
			try {
				// Sqlite.openConnection() creates the file if necessary
				var conn = yield Sqlite.openConnection({path: databasePath});
				if (!(yield conn.tableExists("settings"))) {
					yield conn.executeTransaction(updateDatabase);
				} else {
					let sqlresult = yield conn.execute("SELECT value FROM settings WHERE key='dbversion'");
					if (sqlresult.length === 0 || sqlresult[0].getResultByName("value") < DATABASE_VERSION) {
						yield conn.executeTransaction(updateDatabase);
					}
				}
			} finally {
				yield conn.close();
			}
		});
		
		const loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
						.getService(Components.interfaces.mozIJSSubScriptLoader);
		loader.loadSubScript("chrome://dontprint/content/post-translation.js");
		
		// Detect whether Zotero is installed and finish inialization based on that
		AddonManager.getAddonByID("zotero@chnm.gmu.edu", function(addon) {
			if (addon && addon.isActive) {
				initWithZotero();
			} else {
				initWithoutZotero();
			}
		});
	}
	
	
	function updateDatabase(conn) {
		let context = {}
		const loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
						.getService(Components.interfaces.mozIJSSubScriptLoader);
		loader.loadSubScript("chrome://dontprint/content/updateDatabase.js", context, "UTF-8");
		yield context.updateDatabase(conn, DATABASE_VERSION);
	}
	
	
	function initWithZotero() {
		zoteroInstalled = true;
		// Register this extension as an extension to Zotero
		const loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
						.getService(Components.interfaces.mozIJSSubScriptLoader);
		// Load Zotero's main extension logic (this is from Zotero's
		// documentation on how to write a Zotero extension).
		loader.loadSubScript("chrome://zotero/content/include.js");
		// Load some code that was adapted from Zotero's source code and may
		// only be loaded *after* loading Zotero's main extension logic.
		loader.loadSubScript("chrome://dontprint/content/adapted-from-zotero/translate-dontprint.js");
	}
	
	
	function initWithoutZotero() {
		// Register URI alias "resource://zotero/...". The Zotero xpcom module expects this.
		Components.utils.import("resource://gre/modules/Services.jsm");
		var resProt = Services.io.getProtocolHandler("resource")
						.QueryInterface(Components.interfaces.nsIResProtocolHandler);
		var aliasURI = Components.classes["@mozilla.org/network/io-service;1"]
						.getService(Components.interfaces.nsIIOService)
						.newURI("chrome://dontprint/content/zotero-resource/", null, null);
		resProt.setSubstitution("zotero", aliasURI);
		
		// Initialize the included Zotero xpcom module
		Zotero = Components.classes["@robamler.github.com/minimal-zotero;1"]
			.getService(Components.interfaces.nsISupports).wrappedJSObject;
		
		// Load some code that was adapted from Zotero's code and that can
		// only be loaded *after* the the Zotero xpcom module was initialized.
		const loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
						.getService(Components.interfaces.mozIJSSubScriptLoader);
		loader.loadSubScript("chrome://dontprint/content/adapted-from-zotero/translate-dontprint.js");
	}
	
	
	function validatePreferences() {
		let platform = prefs.getCharPref("k2pdfoptPlatform");
		let transferMethod = prefs.getCharPref("transferMethod");
		if (
			platform==="unknown" || !prefs.getCharPref("kindleModel") || !transferMethod
			|| (transferMethod==="directory" && !prefs.getCharPref("destDir"))
		) {
			let gBrowser = Components.classes["@mozilla.org/appshell/window-mediator;1"]
				.getService(Components.interfaces.nsIWindowMediator)
				.getMostRecentWindow("navigator:browser").gBrowser;
			this.welcomeScreenId = Date.now();
			gBrowser.loadOneTab(
				"chrome://dontprint/content/welcome/dontprint-welcome.html#" + this.welcomeScreenId,
				{ inBackground: false }
			);
		} else if (platform.substr(0,7)!=="unknown" && prefs.getCharPref("k2pdfoptPath") === "") {
			// Platform has been detected but download of k2pdfopt was interrupted. Resume download silently.
			downloadK2pdfopt();
		}
	}
	
	
	function getScreenDimensions() {
		let ret = {
			w:		prefs.getIntPref("screenWidth"),
			h:		prefs.getIntPref("screenHeight"),
			ppi:	prefs.getIntPref("screenPpi")
		};
		let defaultSettings = EREADER_MODEL_DEFAULTS[prefs.getCharPref("kindleModel")];
		if (!defaultSettings) {
			defaultSettings = EREADER_MODEL_DEFAULTS["other"];
		}
		for (let key in ret) {
			if (ret[key] < 0) {
				ret[key] = defaultSettings[key];
			}
		}
		return ret;
	}
	
	
	function reportScreenSettings() {
		let dims = getScreenDimensions();
		let url = buildURL(
			'https://docs.google.com/forms/d/1YCclhAjI9iDOf9tQybcJuW4QYM8Ayr1K6HB8894GfrI/formResponse?draftResponse=[]%0D%0A&pageHistory=0',
			{
				'entry.1501323902':	prefs.getCharPref("kindleModel"),
				'entry.1922726083':	dims.w,
				'entry.651002044':	dims.h,
				'entry.2016260998':	dims.ppi
			}
		);
		let req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
							.createInstance(Components.interfaces.nsIXMLHttpRequest);
		req.open("GET", url, true);
		req.send();
		// don't set onload handler because we don't really care about the response
	}
	
	/**
	 * Called when the user clicks the dontprint button in the Zotero pane.
	 */
	function dontprintZoteroItems(items, forceCropWindow) {
		// delete duplicates (e.g., if user selects both an attachment and its parent)
		var entryIds = items.map(function(i) {
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
				pageurl:			i.getField('url'),
				doi:				i.getField('DOI'),
				articleDate:		i.getField('date'),
				articleVolume:		i.getField('volume'),
				articleIssue:		i.getField('issue'),
				articlePages:		i.getField('pages'),
				articleCreators:	i.getCreators(),	//TODO: test
				forceCropWindow:	forceCropWindow,
				originalFilePath:	attachmentPaths.length === 0 ? undefined : attachmentPaths[0],
				tmpFiles:			[]
			};
		});
		
		// remove entries without attached PDF files
		var noattach = jobs.filter(function(elem) {
			return elem.originalFilePath === undefined;
		});
		if (noattach.length) {
			prompts.alert(null, "Dontprint", "The following selected items cannot be sent to your e-reader because they do not have an attached PDF file:\n\n" +
				noattach.map(function(elem) { return elem.title; }).join("\n"));
		}
		
		jobs = jobs.filter(function(elem) {
			return elem.originalFilePath !== undefined;
		});
		if (jobs.length == 0) {
			prompts.alert(null, "Dontprint", "No documents sent to your e-reader. Select an item with an attached PDF file and try again.");
			return;
		}
		
		let that = this;
		jobs.forEach(function(job) {
			runJob.call(that, job);
		});
	}
	
	
	function dontprintLocalFile() {
		let Dontprint = Components.classes['@robamler.github.com/dontprint;1']
						.getService().wrappedJSObject;
		let win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator)
			.getMostRecentWindow("navigator:browser");
		
		let nsIFilePicker = Components.interfaces.nsIFilePicker;
		let fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
		fp.addToRecentDocs = true;
		fp.init(win, "Pick a PDF document to send to your e-reader", nsIFilePicker.modeOpenMultiple);
		fp.appendFilter("PDF documents", "*.pdf");
		fp.appendFilters(nsIFilePicker.filterAll);
		
		if (fp.show() === nsIFilePicker.returnOK) {
			let files = fp.files;
			while (files.hasMoreElements())  {
				let file = files.getNext().QueryInterface(Components.interfaces.nsILocalFile);
				let m = file.leafName.match(/^(.*)\.pdf$/i);
				let title = m ? m[1] : file.leafName;
				Dontprint.runJob({
					jobType:			"localfile",
					title:				title,
					journalLongname:	"",
					journalShortname:	"",
					originalFilePath:	file.path,
					tmpFiles:			[]
				});
			}
		}
	}
	
	
	function abortJob(jobid) {
		let job = runningJobs[jobid];
		try {
			if (job !== undefined) {
				updateJobState(job, "canceled");
				if (job.abortCurrentTask !== undefined) {
					job.abortCurrentTask();
				}
			}
		} catch (e) {
			// ignore errors (e.g. if job was already canceled)
		} finally {
			try {
				job.cleanup();
			} catch (e) {
				//ignore
			}
		}
	}
	
	
	function showProgress() {
		let win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator)
			.getMostRecentWindow("navigator:browser");
		
		// check if progress tab is already displayed
		if (win.content.location.href === "chrome://dontprint/content/progress/progress.html") {
			return;
		}
		
		// check if we can reuse an existing progress tab
		for (let i=0; i<win.gBrowser.browsers.length; i++) {
			let b = win.gBrowser.getBrowserAtIndex(i);
			if (b.currentURI.spec === "chrome://dontprint/content/progress/progress.html") {
				win.gBrowser.selectedTab = win.gBrowser.tabs[i];
				return;
			}
		}
		
		// open a new progress tab
		win.gBrowser.loadOneTab(
			"chrome://dontprint/content/progress/progress.html",
			{ inBackground: false }
		);
	}
	
	
	/**
	 * Registeres a listener function that will be called whenever the state
	 * of any job changes.
	 * @param listener The listener function. It will be called with the
	 *                 job whose state changed as an argument.
	 * @return A unique id representing this progress listener. Use this id
	 *         as an argument to unregisterProgressListener() when you want
	 *         to stop receiving notifications.
	 */
	function registerProgressListener(listener) {
		let listenerId = Date.now();
		while (listenerId in progressListeners) {
			listenerId++;
		}
		progressListeners[listenerId] = listener;
		return listenerId;
	}
	
	
	/**
	 * Removes a listener previously registered with registerProgressListener().
	 */
	function unregisterProgressListener(listenerId) {
		delete progressListeners[listenerId];
	}
	
	
	/**
	 * Called either from the welcome page or on startup if the download
	 * has not yet been successfull.
	 */
	function downloadK2pdfopt(onProgress, onSuccess) {
		let platform = prefs.getCharPref("k2pdfoptPlatform");
		let leafFilename = platform.substr(0,4)==="win_" ? "k2pdfopt.exe" : "k2pdfopt";
		let destFile = FileUtils.getFile("ProfD", ["dontprint", leafFilename]);
		// create *executable* file (if on unix)
		destFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0775); // octal value --> don't remove leading zero!
		let k2pdfoptPath = destFile.path;
		
		const nsIWBP = Components.interfaces.nsIWebBrowserPersist;
		let wbp = Components
			.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"]
			.createInstance(nsIWBP);
		wbp.persistFlags = nsIWBP.PERSIST_FLAGS_AUTODETECT_APPLY_CONVERSION;
		
		let progressListener = {
			onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) {
				if (aStateFlags & Components.interfaces.nsIWebProgressListener.STATE_STOP) {
					detectK2pdfoptVersion(
						k2pdfoptPath,
						function onDownloadSuccess() {
							prefs.setCharPref("k2pdfoptPath", k2pdfoptPath);
							if (onSuccess) {
								onSuccess();
							}
						},
						function onOutdated() { }, //TODO error handling
						function onNotFound() { }, //TODO liston on connection restore
						function onError(errstr) { } //TODO error handling
					);
				}
			}
		};
		
		if (onProgress) {
			let lastProgress = 0;
			progressListener.onProgressChange = function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) {
				if (aMaxTotalProgress!=0 && aCurTotalProgress>lastProgress) {	// no typo, we really want to use != instead of !==
					lastProgress = aCurTotalProgress;
					onProgress(aCurTotalProgress/aMaxTotalProgress);
				}
			};
		}
		
		wbp.progressListener = progressListener;
		
		let nsIURL = Components.classes["@mozilla.org/network/standard-url;1"]
					.createInstance(Components.interfaces.nsIURL);
		nsIURL.spec = "http://robamler.github.com/dontprint/k2pdfopt/" + platform + "/" + leafFilename;
		try {
			wbp.saveURI(nsIURL, null, null, null, null, destFile);
		} catch(e if e.name === "NS_ERROR_XPC_NOT_ENOUGH_ARGS") {
			// https://bugzilla.mozilla.org/show_bug.cgi?id=794602
			//TODO: Always use when we no longer support Firefox < 18
			wbp.saveURI(nsIURL, null, null, null, null, destFile, null);
		}
	}
	
	
	function sendTestEmail(callback) {
		runJob({
			title:		'Dontprint test document',
			jobType:	'test',
			pdfurl:		"http://robamler.github.com/dontprint/test-documents/" + prefs.getCharPref("kindleModel") + ".pdf",
			tmpFiles:	[],
			callback:	callback
		});
	}
	
	
	function getRecipientEmail() {
		let suffix = prefs.getCharPref("recipientEmailSuffix");
		if (suffix === "other") {
			return prefs.getCharPref("recipientEmailOther");
		} else {
			let prefix = prefs.getCharPref("recipientEmailPrefix");
			return prefix ? prefix+suffix : "";
		}
	}
	
	
	function sendVerificationCode(onSuccess, onError, onFailure) {
		let email = getRecipientEmail();
		let req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
							.createInstance(Components.interfaces.nsIXMLHttpRequest);
		req.onload = function() {
			let resp = JSON.parse(req.responseText);
			if (resp.success) {
				onSuccess(email, resp.returncode, resp.message);
			} else {
				onError(email, resp.errno, resp.message);
			}
		};
		req.onerror = function() {
			onFailure(email, req);
		};
		req.open("POST", "http://dontprint.net/cgi-bin/send-verification-mail.pl", true);
		req.setRequestHeader("Content-type","application/x-www-form-urlencoded");
		req.send(buildURL("", {email:email}));
	}
	
	
	function verifyEmailAddress(code, onSuccess, onError, onFailure) {
		let email = getRecipientEmail();
		let req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
							.createInstance(Components.interfaces.nsIXMLHttpRequest);
		req.onload = function() {
			let resp = JSON.parse(req.responseText);
			if (resp.success) {
				onSuccess(email, resp.returncode, resp.message);
			} else {
				onError(email, resp.errno, resp.message);
			}
		};
		req.onerror = function() {
			onFailure(email, req);
		};
		req.open("POST", "http://dontprint.net/cgi-bin/verify-email.pl", true);
		req.setRequestHeader("Content-type","application/x-www-form-urlencoded");
		req.send(buildURL("", {email:email, code:code}));
	}
	
	
	function rememberVerifiedEmail(email) {
		let verifiedEmails = JSON.parse(prefs.getCharPref("verifiedEmails"));
		verifiedEmails.unshift(email.toLocaleLowerCase());
		// Remember only up to 10 e-mail addresses.
		prefs.setCharPref("verifiedEmails", JSON.stringify(verifiedEmails.slice(0, 10)));
	}
	
	
	
	// ==== LIFE CYCLE OF A DONTPRINT JOB ===========================
	
	function runJob(job) {
		job.id = Date.now();
		while (job.id in runningJobs) {
			job.id++;
		}
		runningJobs[job.id] = job;
		
		job.cleanup = function() {
			if (!job.cleaned) {
				job.cleaned = true;
				delete runningJobs[job.id];
				incrementQueueLength(-1, job.identifierurl);
				if (job.tmpFiles) {
					job.tmpFiles.forEach(deleteFile);
				}
			}
		};
		
		// show progress indicator
		incrementQueueLength(+1, job.identifierurl);
		job.downloadProgress = 0;
		job.convertProgress = 0;
		job.uploadProgress = 0;
		updateJobState(job, "queued");
		
		if (prefs.getBoolPref("autoShowProgress")) {
			showProgress();
		}
		
		let that = this;
		
		Task.spawn(function() {
			try {
				switch (job.jobType) {
					case "page":
						yield grabOriginalFileForCurrentTab(job);
						break;
					
					case "pdfurl":
					case "test":
						yield downloadPdfUrl(job);
						break;
				}
				
				if (job.jobType === 'test') {
					job.convertedFilePath = job.originalFilePath;
				} else {
					yield cropMargins.call(that, job);
					yield convertDocument(job);
				}
				
				switch (prefs.getCharPref("transferMethod")) {
					case "email":
						yield sendEmail(job);
						break;
					
					case "directory":
						yield moveFileToDestDir(job);
						yield callPostTransferCommand(job);
						break;
					
					default:
						throw 'The settings for Dontprint are inconsistent. Please choose "Tools --> Dontprint --> Configure Dontprint" from the menu and review the settings on the "Transfer" tab.';
				}
			} catch (e) {
				job.result = {
					success: false,
					message: e.toString()
				};
			} finally {
				let newtab = null;
				if ((!job.result.success && job.result.message === "canceled") || job.state === "canceled") {
					try {
						updateJobState(job, "canceled");
					} catch (e) {
						// job.state is already "canceled". That's OK.
					}
				} else {
					newtab = yield displayResult(job);
				}
				if (job.jobType === 'test') {
					job.callback(newtab);
				}
			}
		}).then(job.cleanup, job.cleanup);
	}
	
	
	function grabOriginalFileForCurrentTab(job) {
		updateJobState(job, "downloading");
		
		if (!job.tab || !job.tab.page.translators || !job.tab.page.translators.length) {
			throw "No translators available for this web site.";
		}
		
		var pdfFile = FileUtils.getFile("TmpD", ["dontprint-original.pdf"]);
		pdfFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
		job.tmpFiles = [pdfFile.path];
		
		var translate = new Zotero.Translate.Dontprint();
		job.document = job.tab.page.translate.document;
		translate.setDocument(job.tab.page.translate.document);
		translate.setDestFile(pdfFile);
		translate.setTranslator(job.translator || job.tab.page.translators[0]);
		delete job.translator;		// avoid memory leak
		delete job.tab;
		translate.clearHandlers("done");
		translate.clearHandlers("itemDone");
		
		// Call runJob() as soon as both the "itemDone" handler was fired and
		// the "attachDone" handler was fired, independently of which one happens first.
		// But make sure to call runJob() no more than once
		var itemDoneDeferred = Promise.defer();
		var attachDoneDeferred = Promise.defer();
		var timeoutDeferred = Promise.defer();
		
		translate.setAttachDoneHandler(function() {
			attachDoneDeferred.resolve();
			timeoutDeferred.resolve();
		});
		
		translate.setHandler("itemDone", function(obj, dbItem, item) {
			// Apparently, this is called when the item meta data is ready but attachments may still be being downloaded
			job.zoteroKey			= checkUndefined(item.id, "noid");
			job.title				= checkUndefined(item.title, "Untitled document");
			job.articleCreators		= item.creators;
			job.journalLongname		= checkUndefined(item.publicationTitle);
			job.journalShortname	= checkUndefined(item.journalAbbreviation);
			job.doi					= checkUndefined(item.DOI);
			job.articleVolume		= item.volume;
			job.articleIssue		= item.issue;
			job.articlePages		= item.pages;
			job.articleDate			= checkUndefined(item.date);
			job.originalFilePath	= pdfFile.path;
			itemDoneDeferred.resolve();
			timeoutDeferred.resolve();
		});
		
		translate.setHandler("error", function(obj, error) {
			// Note: So far, I haven't been able to observe this handler in action.
			// But it should be the correct error handler according to Zotero's documentation.
			let errstr = "Unable to download article. Maybe it is behind a captcha or you need to sign in with the publisher's web site. Original error message: " + error.toString();
			itemDoneDeferred.reject(errstr);
			attachDoneDeferred.reject(errstr);
		});
		
		var lastProgress = 0;
		translate.setProgressHandler(function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) {
			if (aMaxTotalProgress!=0 && aCurTotalProgress>lastProgress) {	// no typo, we really want to use != instead of !==
				lastProgress = aCurTotalProgress;
				job.downloadProgress = aCurTotalProgress/aMaxTotalProgress;
				updateJobState(job);
			}
		});
		
		translate.setErrorHandler(function(e) {
			timeoutDeferred.reject(e)
			itemDoneDeferred.reject(e);
			attachDoneDeferred.reject(e)
		});
		
		//TODO: test what happens when user clicks "save to zotero" shortly after clicking "dontprint" (or vice versa)
		translate.translate(null);
		
		job.abortCurrentTask = function() {
			translate.abort();
		};
		
		setTimeout(function() {
			timeoutDeferred.reject("Timeout when trying to download the article. Are you connected to the internet?");
		}, 180000); // 3 minutes
		
		try {
			try {
				yield timeoutDeferred.promise;
				yield itemDoneDeferred.promise;
				yield attachDoneDeferred.promise;
			} catch (e) {
				try {
					job.abortCurrentTask();
				} catch (e2) {} //ignore
				throw e;
			}
		} finally {
			// remove event handlers (avoid memory leaks)
			translate.clearHandlers("done");
			translate.clearHandlers("error");
			translate.setErrorHandler(null);
			translate.clearHandlers("itemDone");
			translate.setAttachDoneHandler(null);
		}
		delete job.abortCurrentTask;
		
		job.downloadProgress = 1;
		updateJobState(job);
		
		if (!pdfFile.exists() || pdfFile.fileSize === 0) {
			throw "Unable to download article. Maybe it is behind a captcha or you need to sign in with the publisher's web site.";
		}
	}
	
	
	function downloadPdfUrl(job) {
		updateJobState(job, "downloading");
		
		let destFile = FileUtils.getFile("TmpD", ["dontprint-original.pdf"]);
		destFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
		job.originalFilePath = destFile.path;
		job.tmpFiles.push(destFile.path);
		
		let deferred = Promise.defer();
		
		const nsIWBP = Components.interfaces.nsIWebBrowserPersist;
		let wbp = Components
			.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"]
			.createInstance(nsIWBP);
		wbp.persistFlags = nsIWBP.PERSIST_FLAGS_AUTODETECT_APPLY_CONVERSION;
		
		let lastProgress = 0;
		wbp.progressListener = {
			onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) {
				if (aStateFlags & Components.interfaces.nsIWebProgressListener.STATE_STOP) {
					deferred.resolve();
				}
			},
			onProgressChange: function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) {
				if (aMaxTotalProgress!=0 && aCurTotalProgress>lastProgress) {	// no typo, we really want to use != instead of !==
					lastProgress = aCurTotalProgress;
					job.downloadProgress = aCurTotalProgress/aMaxTotalProgress;
					updateJobState(job);
				}
			}
		};
		
		let nsIURL = Components.classes["@mozilla.org/network/standard-url;1"]
					.createInstance(Components.interfaces.nsIURL);
		nsIURL.spec = job.pdfurl;
		
		try {
			wbp.saveURI(nsIURL, null, null, null, null, destFile);
		} catch(e if e.name === "NS_ERROR_XPC_NOT_ENOUGH_ARGS") {
			// https://bugzilla.mozilla.org/show_bug.cgi?id=794602
			//TODO: Always use when we no longer support Firefox < 18
			wbp.saveURI(nsIURL, null, null, null, null, destFile, null);
		}
		
		yield deferred.promise;
	}
	
	
	function cropMargins(job) {
		updateJobState(job, "cropping");
		
		// sanitize journal names
		if (!job.journalLongname) {
			job.journalLongname = "";
		}
		if (!job.journalShortname) {
			job.journalShortname = "";
		}
		
		yield this.postTranslate(job);
		
		job.dates = parseDateString(job.articleDate);
		
		try {
			var conn = yield Sqlite.openConnection({path: databasePath});
			var longnameresult = yield conn.executeCached(
				"SELECT * FROM journals WHERE :longname!='' AND longname=:longname AND ((minDate=0 AND maxDate=0) OR (:smalldate!=0 AND minDate!=0 AND minDate<=:smalldate AND (maxDate=0 OR maxDate>=:largedate)) OR (:smalldate!=0 AND maxDate!=0 AND maxDate>=:largedate AND minDate=0)) ORDER BY priority DESC, lastModified DESC LIMIT 1",
				{ longname: job.journalLongname, smalldate: job.dates.small, largedate: job.dates.large }
			);
			var shortnameresult = yield conn.executeCached(
				"SELECT * FROM journals WHERE :shortname!='' AND shortname=:shortname AND ((minDate=0 AND maxDate=0) OR (:smalldate!=0 AND minDate!=0 AND minDate<=:smalldate AND (maxDate=0 OR maxDate>=:largedate)) OR (:smalldate!=0 AND maxDate!=0 AND maxDate>=:largedate AND minDate=0)) ORDER BY priority DESC, lastModified DESC LIMIT 1",
				{ shortname: job.journalShortname, smalldate: job.dates.small, largedate: job.dates.large }
			);
		} catch (e) {
			// ignore errors
		} finally {
			yield conn.close();
		}
		
		// augment sqlresults with priority based on matching shortname and/or longname
		let sqlresult = null;
		if (longnameresult.length === 0) {
			if (shortnameresult.length === 1) {
				sqlresult = shortnameresult;
			}
		} else if (shortnameresult.length === 0) {
			sqlresult = longnameresult;
		} else {
			// found match for both longname and shortname
			let spriority = parseFloat(shortnameresult[0].getResultByName("priority")) + 01000;
			let lpriority = parseFloat(longnameresult[0].getResultByName("priority")) + 010000;
			sqlresult = spriority > lpriority ? shortnameresult : longnameresult;
		}
		
		if (sqlresult) {
			job.crop = { rememberPreset:false }; // if crop window needs to be shown, then by default don't remember settings
			["id", "enabled", "longname", "shortname", "minDate", "maxDate", "m1", "m2", "m3", "m4", "coverpage", "k2pdfoptParams"].forEach(
				function(key) {
					job.crop[key] = sqlresult[0].getResultByName(key);
				}
			);
		} else {
			job.crop = {
				rememberPreset:true, id:0, enabled:false,
				minDate:0, maxDate:0,
				m1:5, m2:5, m3:5, m4:5,
				coverpage:false, k2pdfoptParams: ""
			};
		}
		if (!job.crop.longname) {
			job.crop.longname = job.journalLongname;
		}
		if (!job.crop.shortname) {
			job.crop.shortname = job.journalShortname;
		}
		
		if (job.adjustCropDefaults) {
			job.adjustCropDefaults();
			delete job.adjustCropDefaults;
		}
		delete job.document;
		
		if (job.forceCropWindow) {
			// Make sure the crop window is displayed and also uncheck the "remember"
			// box by default. If the user still decides to check the "remember"
			// box then existing journal settings will be overwritten if applicable.
			// This is the correct behaviour: It allows to correct a mistake in
			// a journal filter by running Dontprint on an article from that
			// journal again with the new (corrected) settings.
			job.crop.enabled = false;
			job.crop.rememberPreset = false;
		}
		
		if (!job.crop.enabled) {
			job.cropPageDeferred = Promise.defer();
			
			let gBrowser = Components.classes["@mozilla.org/appshell/window-mediator;1"]
				.getService(Components.interfaces.nsIWindowMediator)
				.getMostRecentWindow("navigator:browser").gBrowser;
			let newTabBrowser = gBrowser.getBrowserForTab(gBrowser.loadOneTab(
				"chrome://dontprint/content/pdfcrop/pdfcrop.html#" + job.id,
				{ inBackground: false }
			));
			
			job.abortCurrentTask = function() {
				newTabBrowser.contentWindow.close();
				job.cropPageDeferred.reject("canceled");
			};
			
			try {
				yield job.cropPageDeferred.promise;
			} finally {
				delete job.abortCurrentTask;
				delete job.cropPageDeferred;
			}
			
			if (!job.prohibitSaveJournalSettings && (job.crop.shortname !== "" || job.crop.longname !== "")) {
				try {
					var conn = yield Sqlite.openConnection({path: databasePath});
					yield saveJournalSettings(conn, job.crop);
				} catch (e) {
					// ignore errors
				} finally {
					yield conn.close();
				}
				if (job.crop.sendsettings) {
					yield reportJournalSettings(job);
				}
			}
		}
	}
	
	
	/**
	 * Returns a promise. Call either from within a transaction with
	 *   yield deleteJournalSettings(conn, crop.id, true);
	 * or outside of a transaction but within a task:
	 *   yield deleteJournalSettings(conn, crop.id, false);
	 * or run asynchroneously outside of a transaction and outside of a task:
	 *   deleteJournalSettings(conn, crop.id, false).then(onResolve, onReject);
	 */
	function deleteJournalSettings(conn, id, inTransaction) {
		function run() {
			yield conn.executeCached(
				"UPDATE journals set enabled=0, priority=priority & ~2097152 WHERE id=?",
				[id]
			);
			if (id < 0) {
				// builtin filter
				yield conn.executeCached(
					"INSERT INTO deletedBuiltinJournals VALUES (?)",
					[id]
				);
			}
		}
		
		if (inTransaction) {
			return run();
		} else {
			return conn.executeTransaction(run);
		}
	}
	
	
	/**
	 * Asynchroneous function. Returns a promise.
	 * Saves the data in job.crop to the database. Automatically
	 * calculates the priority and decides whether to overwrite
	 * an existing setting or to add a new entry. If crop.id < 0, then
	 * the builtin filter is marked as disabled, a new filter is
	 * inserted and crop.id will be set to the new (positive) id.
	 */
	function saveJournalSettings(conn, crop) {
		return conn.executeTransaction(function() {
			if (crop.id < 0) {
				// builtin filter; mark as deleted and then insert new filter
				yield deleteJournalSettings(conn, crop.id, true);
			}
			
			// determine priority (octal values --> don't remove leading zero!)
			crop.priority = (
				// If enabled===false, then the filter should be regarded as deleted.
				// It will only be used as a suggestion and only if no other filter matches.
				(crop.enabled					?  010000000 : 0)
				// Setting minDate and/or maxDate increases the specificity of the filter
				+ (crop.minDate !== 0			?   01000000 : 0)
				+ (crop.maxDate !== 0			?   01000000 : 0)
				// If two filters are equally specific, then custom filters have priority over builtin ones; this function only inserts custom filters
				+ 								     0100000
				// longname matches:                  010000 (set in cropMargins())
				// shortname matches:                  01000 (set in cropMargins())
				// If there's still a tie, then use the more cautious filter.
				+ (!crop.coverpage				?       0100 : 0)
				+ (crop.k2pdfoptParams !== ""	?        010 : 0)
			);
			
			// Synthesize sql query (this is necessary because conn.execute() fails if
			// if given more parameters than used in bound parameters.
			let sqlfields = ["priority", "enabled", "longname", "shortname", "minDate", "maxDate", "m1", "m2", "m3", "m4", "coverpage", "k2pdfoptParams"];
			if (crop.id >= 0) {
				// don't overwrite builtin entries (id<0) or new entries (id===undefined)
				sqlfields.push("id");
			}
			let sqlcommand = "INSERT INTO journals (" + sqlfields.join(",") + ") VALUES (" + sqlfields.map(function() {return "?";}).join(",") + ")";
			let sqlparams = sqlfields.map(function(key) {
				return crop[key];
			});
			
			yield conn.executeCached(sqlcommand, sqlparams);
			if (crop.id < 0 || crop.id===undefined) {
				// TODO: this is ugly. Find something that is thread save
				// NOTE: using conn.lastInsertRowID doesn't work. It returns undefined.
				let sqlresult = yield conn.executeCached("SELECT id FROM journals ORDER BY id DESC LIMIT 1");
				if (sqlresult.length === 1) {
					crop.id = sqlresult[0].getResultByName("id");
				}
			}
		});
	}
	
	
	function reportJournalSettings(job) {
		var url = buildURL(
			'https://docs.google.com/forms/d/1ePI5BsGPuaRygb4fxtPx7MV7juxMZTsukbtEMUuJNHE/formResponse?draftResponse=[]%0D%0A&pageHistory=0',
			{
				'entry.1139786361':	job.crop.longname,
				'entry.693936814':	job.crop.shortname,
				'entry.548590896':	getHostFromUrl(job.pageurl),
				'entry.598769892':	job.articleDate,
				'entry.383333407':	job.crop.m1.toFixed(1),
				'entry.1576852656':	job.crop.m2.toFixed(1),
				'entry.349466349':	job.crop.m3.toFixed(1),
				'entry.646272568':	job.crop.m4.toFixed(1),
				'entry.1378832419':	job.crop.coverpage,
				'entry.937121035':	job.crop.k2pdfoptParams,
				'entry.536903634':	job.doi,
				'entry.1375537145':	job.title
			}
		);
		var req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
							.createInstance(Components.interfaces.nsIXMLHttpRequest);
		req.open("GET", url, true);
		req.send();
		// don't set onload handler because we don't really care about the response
	}
	
	
	function getHostFromUrl(url) {
		var m = url.match(/^([^#/?:]+:[^#/?:]*\/+)?([^#/?]+\.[^#/?]+)([#/?].*)?$/);
		return m ? m[2] : "unknown";
	}
	
	
	function getToolsMenuLabel() {
		try {
			let win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
				.getService(Components.interfaces.nsIWindowMediator)
				.getMostRecentWindow("navigator:browser");
			
			// Is the minified menu visible? (usually on Windows)
			let titlebar = win.document.getElementById("titlebar");
			if (titlebar && !titlebar.hidden) {
				let appmenubtn = win.document.getElementById("appmenu-button");
				if (appmenubtn && !appmenubtn.hidden) {
					return appmenubtn.label;
				}
			}
			
			// Is the traditional tools menu visible?
			let tm = win.document.getElementById("tools-menu");
			if (!tm.hidden) {
				return tm.label;
			}
		} catch (e) {}
		
		// Fallback
		return "Tools";
	}
	
	
	function convertDocument(job) {
		updateJobState(job, "converting");
		
		let exec = getK2pdfopt();
		let outFile = FileUtils.getFile("TmpD", ["dontprint-converted.pdf"]);
		outFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
		job.convertedFilePath = outFile.path;
		job.tmpFiles.push(outFile.path);
		
		// Put more specific command line arguments to the beginning. It seems
		// like earlier command line arguments overwrite later arguments.
		let args = [];
		if (job.crop.k2pdfoptParams) {
			args = job.crop.k2pdfoptParams.split(/\s+/);
		}
		let globalArgs = prefs.getCharPref("k2pdfoptAdditionalParams").trim();
		if (globalArgs) {
			args = args.concat(globalArgs.split(/\s+/));
		}
		let dims = getScreenDimensions();
		args = args.concat([
			'-ui-', '-x', '-a-', '-om', '0',
			'-w',  '' + dims.w,
			'-h',  '' + dims.h,
			'-odpi', '' + dims.ppi,
			'-ml', '' + parseFloat(job.crop.m1)/25.4,
			'-mt', '' + parseFloat(job.crop.m2)/25.4,
			'-mr', '' + parseFloat(job.crop.m3)/25.4,
			'-mb', '' + parseFloat(job.crop.m4)/25.4,
			'-p', job.crop.pagerange ? job.crop.pagerange : (job.crop.coverpage ? '2-' : '1-'),
			job.originalFilePath,
			'-o', job.convertedFilePath
		]);
		
		var k2pdfoptError = "";
		var currentLine = "";
		let deferred = Promise.defer();
		
		let p = subprocess.call({
			command: exec,
			arguments: args,
			stdout: function(data) {
				let lines = data.split(/[\n\r]+/);
				lines[0] = currentLine + lines[0];
				currentLine = lines.pop();
				lines.forEach(function(line) {
					let m = line.match(/^SOURCE PAGE \d+ \((\d+) of (\d+)\)/);
					if (m !== null && m[2]!=0) { // no typo: we want to use != instead of !== in second condition
						job.convertProgress = m[1]/m[2];
						updateJobState(job);
					}
				});
			},
			stderr: function(data) {
				if (k2pdfoptError.length < 500) {
					k2pdfoptError += data;
				}
			},
			done: function(result) {
				if (result.exitCode) {
					if (job.jobType === 'page') {
						deferred.reject("Conversion failed. This may mean that Dontprint was unable to download the article. Maybe it is behind a captcha or you need to sign in with the publisher's web site. Original error message: " + k2pdfoptError);
					} else {
						deferred.reject("Conversion failed with error message: " + k2pdfoptError);
					}
				}
				job.convertProgress = 1;
				updateJobState(job);
				deferred.resolve();
			},
			mergeStderr: false
		});
		
		job.abortCurrentTask = p.kill;
		yield deferred.promise;
		delete job.abortCurrentTask;
	}
	
	
	function sendEmail(job) {
		updateJobState(job, "sending");
		
		job.emailedFilename = job.title.replace(/[^a-zA-Z0-9 .\-_,]+/g, "_") + ".pdf";
		job.recipientEmail = getRecipientEmail();
		var url = buildURL(
			"http://dontprint.net/cgi-bin/send-document.pl",
			{
				filename:	job.emailedFilename,
				email:		job.recipientEmail,
				itemKey:	job.zoteroKey
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
		
		// Use XHR to send POST data because sending POST data directly to a new
		// tab will freeze the interface and change the tab's title to "Connecting",
		// which is wrong.
		var req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
							.createInstance(Components.interfaces.nsIXMLHttpRequest);
		
		let deferred = Promise.defer();
		
		req.upload.addEventListener("progress", function uploadProgressListener(e) {
			job.uploadProgress = e.loaded / e.total;
			updateJobState(job);
		}, false);
		req.onload = function() {
			try {
				job.result = JSON.parse(req.responseText);
				if (job.result.success) {
					deferred.resolve();
				} else if (job.result.errno === 3) {
					deferred.reject('The e-mail address of your e-reader is not verified yet. Please choose "Tools --> Dontprint --> Configure Dontprint" and verify your e-mail address.');
				} else {
					deferred.reject(job.result.message);
				}
			} catch (err) {
				deferred.reject("Error sending e-mail: " + err);
			}
		};
		req.onerror = function(e) {
			deferred.reject("Error sending e-mail: " + e.toString());
		};
		req.onabort = function() {
			deferred.reject("Error sending e-mail: operation canceled.");
		};
		req.open('POST', url, true);
		req.send(stream);

		job.abortCurrentTask = function() {
			// Setting job.abortCurrentTask = req.abort won't work.
			// With this function wrapper, it works.
			req.abort();
		};
		yield deferred.promise;
		delete job.abortCurrentTask;
	}
	
	
	function moveFileToDestDir(job) {
		updateJobState(job, "moving");
		let origFile = Components.classes["@mozilla.org/file/local;1"]
					.createInstance(Components.interfaces.nsIFile);
		origFile.initWithPath(job.convertedFilePath);
		
		if (!origFile.exists()) {
			throw origFile.path + " does not exist";
		}
		
		let destFile = Components.classes["@mozilla.org/file/local;1"]
					.createInstance(Components.interfaces.nsILocalFile);
		try {
			destFile.initWithPath(prefs.getCharPref("destDir"));
		} catch (e) {
			throw 'The destination directory "' + prefs.getCharPref("destDir") + '" is not an absolute file path. Please go to the Dontprint options and provide the correct destination directory.';
		}
		
		if (!destFile.exists()) {
			throw 'The destination directory "' + destFile.path + '" does not exist. Maybe your device is not connected or it needs to be accessed under a different path.';
		}
		
		// Don't allow the '.' char in the file name because files starting with
		// a '.' are usually hidden on unix systems, which would be confusing.
		destFile.append(job.title.replace(/[^a-zA-Z0-9 \-_,]+/g, "_") + ".pdf");
		destFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0775); // octal value --> don't remove leading zero!
		
		try {
			// TODO: moving the file should really be done asynchronously
			// but I couldn't find out how to do that.
			origFile.moveTo(destFile.parent, destFile.leafName);
		} catch (e) {
			throw 'Unable to move the resulting PDF file to the destination directory "' + destFile.parent.path + '". Maybe your device is not connected or it needs to be accessed under a different path.';
		}
		
		job.result = {
			success: true,
			destDir: destFile.parent.path,
			fileName: destFile.leafName,
			filePath: destFile.path
		};
	}
	
	
	function callPostTransferCommand(job) {
		updateJobState(job, "postTransferCommand");
		
		if (prefs.getBoolPref("postTransferCommandEnabled")) {
			let args = prefs.getCharPref("postTransferCommand").trim().split(/\s+/);
			let cmd = args.shift();
			
			for (let i=0; i<args.length; i++) {
				args[i] = args[i].replace(/%u/g, job.result.filePath);
			}
			
			job.result.command = cmd + " " + args.join(" ");
			
			let file = Components.classes["@mozilla.org/file/local;1"]
						.createInstance(Components.interfaces.nsIFile);
			try {
				file.initWithPath(cmd);
			} catch (e) {
				throw 'The Post-process command "' + cmd + '" is not an absolute file path.';
			}
			
			let process = Components.classes["@mozilla.org/process/util;1"]
									.createInstance(Components.interfaces.nsIProcess);
			process.init(file);
			let deferred = Promise.defer();
			process.runAsync(args, args.length, {observe: deferred.resolve});
			let timeout = setTimeout(function() {
				deferred.reject("The post-transfer command is taking suspiciously long. It's still running but you may want to check if it's doing what you expect it to do.");
			}, 300000); // 5 minutes
			
			yield deferred.promise;
			clearTimeout(timeout);
		}
	}
	
	function displayResult(job) {
		job.result.errorOperation = job.state;
		updateJobState(job, job.result.success ? "success" : "error");
		let transferMethod = prefs.getCharPref("transferMethod")==="email" ? "sendmail" : "savetodir";
		let defaultInBackground = prefs.getBoolPref("successPageInBackground");
		let url = "http://localhost:8000/" + transferMethod + "/" + job.state + ".html#" + (defaultInBackground ? "1," : "0,") + job.id;
		deferred = Promise.defer();
		job.resultPageCallback = deferred.resolve;
		
		// Open new tab
		let gBrowser = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator)
			.getMostRecentWindow("navigator:browser").gBrowser;
		let tab = gBrowser.loadOneTab(
			url,
			{inBackground: job.result.success && defaultInBackground}
		);
		
		tab.addEventListener("TabClose", function() {
			updateJobState(job, "closed");
		}, true);
		
		if (job.state === "error") {
			job.raiseErrorTab = function() {
				gBrowser.selectedTab = tab;
			};
			updateJobState(job);
		}
		
		// wait for the page to load
		yield deferred.promise;
		delete job.resultCallback;
		
		if (job.raiseErrorTab) {
			job.raiseErrorTab();
		}
		
		throw new Task.Result({gBrowser:gBrowser, tab:tab});
	}
	
	function initResultPage(evt) {
		let jobid = evt.target.location.hash.split(',')[1];
		let job = runningJobs[jobid];
		if (job === undefined) {
			// outdated page, probably after restarting Firefox
			evt.target.defaultView.close();
		} else {
			// send job data to page
			let doc = evt.target;
			let answerInput = doc.getElementById("jobjson");
			answerInput.value = JSON.stringify(job);
			let answerEvt = doc.createEvent("HTMLEvents");
			answerEvt.initEvent("DontprintInitEvent", true, false);
			answerInput.dispatchEvent(answerEvt);
			job.resultPageCallback();
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
	
	
	function getK2pdfopt() {	//TODO: remove this function and just use prefs.getCharPref("k2pdfoptPath")
		var path = prefs.getCharPref("k2pdfoptPath");
		
		if (path[0] === "%") {
			// path is relative to profile directory.
			// Always use "/" file separator when storing relative paths.
			// Use FileUtils to convert to system file separator.
			return FileUtils.getFile("ProfD", path.substring(1).split("/"));
		} else {
			// path is absolute
			return path;
		}
	}
	
	
	/**
	 * return value if value isn't undefined; otherwise, return defaultTo or empty string
	 */
	function checkUndefined(value, defaultTo) {
		return value === undefined ? (defaultTo === undefined ? '' : defaultTo) : value;
	}
	
	
	function incrementQueueLength(inc, url) {
		if (url !== undefined) {
			if (inc > 0) {
				queuedUrls.push(url);
			} else if (inc < 0) {
				var index = queuedUrls.indexOf(url);
				if (index !== -1) {
					queuedUrls.splice(index, 1);
				}
			}
		}
		
		queuelength = Math.max(0, queuelength+inc);
		
		let enumerator = Components.classes["@mozilla.org/appshell/window-mediator;1"]
						.getService(Components.interfaces.nsIWindowMediator)
						.getEnumerator("navigator:browser");
		
		while (enumerator.hasMoreElements()) {
			enumerator.getNext().DontprintBrowser.updateQueueLength(queuelength);
		}
	}
	
	
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
	
	
	function updateJobState(job, state) {
		if (job.state === "canceled") {
			// interrupt the job if it was already canceled by the user
			throw "canceled";
		}
		
		if (state !== undefined) {
			job.state = state;
		}
		
		setTimeout(function() {
			for (let i in progressListeners) {
				try {
					progressListeners[i](job);
				} catch (e) {
					// apparently, progressTab has been closed without unregistering the listener
					delete progressListeners[i];
				}
			}
		}, 0);
	}
	
	
	/**
	 * Returns -1 if v2 is newer than v1, +1 if v1 is newer than v2
	 * and 0 if they are equal.
	 */
	function compareVersionStrings(v1, v2) {
		let a1 = v1.split(".");
		let a2 = v2.split(".");
		for (let i=0; i<Math.min(a1.length, a2.length); i++) {
			if (a1[i] < a2[i])
				return -1;
			if (a1[i] > a2[i])
				return 1;
		}
		if (a1.length < a2.length)
			return -1;
		if (a1.length > a2.length)
			return 1;
		return 0;
	}
	
	
	function detectK2pdfoptVersion(k2pdfoptPath, onSuccess, onOutdated, onNotFound, onError) {
		clearTimeout(k2pdfoptTestTimeout);
		let currentLine = "";
		let lineNumber = 0;
		let found = false;
		if (!k2pdfoptPath) {
			k2pdfoptPath = prefs.getCharPref("k2pdfoptPath");
		}
		
		try {
			let p = subprocess.call({
				command: k2pdfoptPath,
				arguments: ['-ui-', '-x', '-a-', '-?'],
				stdout: function(data) {
					if (lineNumber < 5 || !found) {
						let lines = data.split(/[\n\r]+/);
						lines[0] = currentLine + lines[0];
						currentLine = lines.pop();
						for (let i=0; i<Math.min(lines.length, 5-lineNumber); i++) {
							let m = lines[i].match(/^\s*k2pdfopt\s+v(\d+(\.\d+)*)\s/);
							if (m) {
								found = true;
								if (compareVersionStrings(m[1], "1.51") >= 0) {
									onSuccess(m[1]);
								} else {
									onOutdated(m[1]);
								}
							}
							lineNumber++;
						}
					}
				},
				done: function(result) {
					if (!found) {
						onNotFound();
					}
				},
				mergeStderr: false
			});
		} catch (e) {
			let errstr = e.toString();
			if (errstr.length > 120) {
				errstr = errstr.substr(0, 100) + "...";
			}
			onError(errstr);
		} finally {
			if (typeof p === "object") {
				k2pdfoptTestTimeout = setTimeout(p.kill, 5000);  // 5 seconds
			}
		}
	}
	
	
	/**
	 * Tries to understand a date string from zotero. On success, returns an
	 * integer of the form YYYYMMDD. On Failure, returns 0. If only the year
	 * or only the year and the month can be recognized, unrecognized fileds
	 * are set to zero.
	 */
	function parseDateString(str) {
		var y=0, m=0, d=0;
		
		(function setYMD() {
			// first try some patterns that would interfere with newDate(str)
			if (!str) {
				return;
			}
			if (str.match(/^\d{8}$/)) {
				let val = parseFloat(str);
				d = val % 100;
				m = ((val-d)/100) % 100;
				y = (val-d-100*m)/10000;
				return;
			}
			let mm = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})\./);
			if (mm) {
				d = parseFloat(mm[1]);
				m = parseFloat(mm[2]);
				y = parseFloat(mm[3]);
				if (y < 100) {
					y += 1900;
				}
				return;
			}
			
			// now try to parse with JavaScript's builtin Date parser
			let date = new Date(str);
			if (!isNaN(date.getFullYear())) {
				y = date.getFullYear();
				m = isNaN(date.getMonth()) ? 0 : date.getMonth()+1;
				d = isNaN(date.getDate()) ? 0 : date.getDate();
				return;
			}
			
			// if this still fails, try to read at least the year
			mm = str.match(/\b(\d{4})\b/);
			y = mm ? parseFloat(mm[1]) : 0;
		}());
		
		var small, large;
		if (y===0) {  // unable to parse date
			small = 0;
			large = 0;
		} else if (m===0) {  // only year known
			small = y*10000 + 101;   // 1 January
			large = y*10000 + 1231;  // 31 December
		} else if (d===0) {  // only year and month known
			small = y*10000 + m*100 + 1; // first of month
			let date = new Date(m===12 ? y+1 : y, m%12, 1);  // one month later
			date = new Date(date.getTime()-10000); // subtract 10 seconds
			large = date.getFullYear()*10000 + (date.getMonth()+1)*100 + date.getDate();
		} else {  // year, month, and day known
			small = y*10000 + m*100 + d;
			large = small;
		}
		
		return { small: small, large: large };
	}
	
	
	// ==== EXPORT PUBLICLY VISIBLE METHODS =========================
	
	this.wrappedJSObject = {
		init: init,
		validatePreferences: validatePreferences,
		dontprintZoteroItems: dontprintZoteroItems,
		runJob: runJob,
		dontprintLocalFile: dontprintLocalFile,
		abortJob: abortJob,
		showProgress: showProgress,
		registerProgressListener: registerProgressListener,
		unregisterProgressListener: unregisterProgressListener,
		downloadK2pdfopt: downloadK2pdfopt,
		detectK2pdfoptVersion: detectK2pdfoptVersion,
		sendTestEmail: sendTestEmail,
		getRecipientEmail: getRecipientEmail,
		compareVersionStrings: compareVersionStrings,
		getPrefs: function() {return prefs;},
		deleteFile: deleteFile,
		reportScreenSettings: reportScreenSettings,
		isZoteroInstalled: function() { return zoteroInstalled; },
		isQueuedUrl: function(url) { return queuedUrls.indexOf(url) !== -1; },
		getRunningJobs: function() { return runningJobs; },
		getHostFromUrl: getHostFromUrl,
		getDB: function() {
			// call with "var conn = yield Dontprint.getDB();" from a task
			return Sqlite.openConnection({path: databasePath});
		},
		getToolsMenuLabel: getToolsMenuLabel,
		saveJournalSettings: saveJournalSettings,
		deleteJournalSettings: deleteJournalSettings,
		EREADER_MODEL_DEFAULTS: EREADER_MODEL_DEFAULTS,
		getScreenDimensions: getScreenDimensions,
		initResultPage: initResultPage,
		sendVerificationCode: sendVerificationCode,
		verifyEmailAddress: verifyEmailAddress,
		rememberVerifiedEmail: rememberVerifiedEmail
	};
}


const os = Components.classes["@mozilla.org/observer-service;1"]
			.getService(Components.interfaces.nsIObserverService);
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");


// Define XPCOM component
Dontprint.prototype = {
	classDescription:	"Singleton service for Dontprint add-on for Firefox",
	classID:			Components.ID("{7432b5f0-ad37-4d1d-aab9-cf0559fb75a1}"),
	contractID:			"@robamler.github.com/dontprint;1",
	_xpcom_categories:	[{ category: "app-startup", service: true }],  /* for toolkit before 2.0 (Fx 4.0) */
	QueryInterface:		XPCOMUtils.generateQI([Components.interfaces.nsIObserver]),
	
	// initialization
	observe: function (aSubject, aTopic, aData) {
		switch (aTopic) {
		case "app-startup":  /* for toolkit before 2.0 (Fx 4.0) */
			os.addObserver(this, "profile-after-change", false);
			break;
		
		case "profile-after-change":
			os.addObserver(this, "sessionstore-windows-restored", false);
			this.wrappedJSObject.init();
			break;
		
		case "sessionstore-windows-restored":
			// See http://stackoverflow.com/a/10680715 for why we listen to
			// "sessionstore-windows-restored" and not, e.g., to
			// "browser-delayed-startup-finished".
			os.removeObserver(this, "sessionstore-windows-restored");
			this.wrappedJSObject.validatePreferences();
			break;
		}
	}
};

// Register component
if ("generateNSGetFactory" in XPCOMUtils) {
	// Firefox 4.0 and higher
	var NSGetFactory = XPCOMUtils.generateNSGetFactory([Dontprint]);
} else {
	// Firefox 3.x
	var NSGetModule = XPCOMUtils.generateNSGetModule([Dontprint]);
}
