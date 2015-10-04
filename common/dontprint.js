"use strict";

PlatformTools.exportComponent("Dontprint", function() {
	const DATABASE_VERSION = "20150627";
	var runningJobs = {};
	var journaldb = null;
	var progressListeners = {};
	
	const EREADER_MODEL_DEFAULTS = {
		"kindle-paperwhite":		{screenWidth: 718,  screenHeight: 963,  screenPpi: 212},
		"kindle-touch":				{screenWidth: 557,  screenHeight: 721,  screenPpi: 167},
		"kindle-generation4":		{screenWidth: 557,  screenHeight: 721,  screenPpi: 167},
		"kindle-keyboard":			{screenWidth: 557,  screenHeight: 721,  screenPpi: 167},
		"kindle-dx":				{screenWidth: 785,  screenHeight: 1153, screenPpi: 150},
		"kindle-generation2":		{screenWidth: 557,  screenHeight: 721,  screenPpi: 167},
		"kindle-generation1":		{screenWidth: 557,  screenHeight: 721,  screenPpi: 167},
		"kindle-fire-1or2":			{screenWidth: 557,  screenHeight: 963,  screenPpi: 169},
		"kindle-fire-hd-7inch":		{screenWidth: 761,  screenHeight: 1240, screenPpi: 216},
		"kindle-fire-hd-8p9inch":	{screenWidth: 1168, screenHeight: 1931, screenPpi: 254},
		"kindle-voyage":			{screenWidth: 1046, screenHeight: 1412, screenPpi: 300},
		"other":					{screenWidth: 600,  screenHeight: 800,  screenPpi: 170}
	};
	

	// Public interface	
	return {
		init,
		runJob,
		zoteroTranslatorDone,
		getJobFromId,
		cropPageDone,
		resultPageLoaded,
		sendVerificationCode,
		verifyEmailAddress,
		dontprintArticleFromPage,
		connectPopupToJob,
		openSettings,
		showProgress,
		abortJob,
		getJournalFilters,
		saveJournalSettings,
		deleteJournalSettings,
		isTransferMethodValid,
		getEreaderModelDefaults
	};


	function updateJournalDb() {
		let req = new XMLHttpRequest();
		req.responseType = "json";

		req.onload = function() {
			let builtinJournals = req.response;

			journaldb.changeVersion(
				journaldb.version,
				DATABASE_VERSION,
				function(t) {
					t.executeSql(
						"CREATE TABLE IF NOT EXISTS journals (" +
							"id INTEGER PRIMARY KEY ASC ON CONFLICT REPLACE," +
							"priority INTEGER," +
							"lastModified TEXT DEFAULT CURRENT_TIMESTAMP," +
							"enabled INTEGER," +
							"longname TEXT," +
							"shortname TEXT," +
							"minDate INTEGER," +
							"maxDate INTEGER," +
							"m1 TEXT," +
							"m2 TEXT," +
							"m3 TEXT," +
							"m4 TEXT," +
							"coverpage INTEGER," +
							"k2pdfoptParams TEXT," +
							'scale TEXT DEFAULT "1"' +
						")"
					);
					t.executeSql("CREATE TABLE IF NOT EXISTS deletedBuiltinJournals (id INTEGER PRIMARY KEY ON CONFLICT IGNORE)");

					for (let i=0; i<builtinJournals.length; i++) {
						t.executeSql("INSERT INTO journals VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", builtinJournals[i]);
					}

					// Disable any builtin journals that had already been deleted by the user.
					t.executeSql("UPDATE journals SET enabled=0, priority=priority & ~2097152 WHERE id IN (SELECT id FROM deletedBuiltinJournals)");
				}
			);
		};

		//TODO: is getUrl() really necessary here?
		req.open("GET", PlatformTools.extensionScriptUrl("common/builtinJournals.json"));
		req.send();
	}


	function connectToProgressTab(sendResponse, port) {
		progressListeners[port.sender.tab.id] = port;
		sendResponse(runningJobs);
	}


	function disconnectFromProgressPage(port) {
		delete progressListeners[port.sender.tab.id];
	}


	function disconnectFromPreferencesPage(port) {
		// Wait for 5 seconds before checking if we are allowed to
		// send screen settings because we might still be saving
		// the settings.

		setTimeout(
			function() {
				PlatformTools.getPrefs({
					sendScreenSettigns: false,
					screenWidth: -1,
					screenHeight: -1,
					screenPpi: -1,
					ereaderModel: "",
					otherEreaderModel: ""
				}).then(function(prefs) {
					if (!prefs.sendScreenSettigns) {
						return;
					}

					PlatformTools.setPrefs({sendScreenSettigns: false});

					let url = buildURL(
						'https://docs.google.com/forms/d/1YCclhAjI9iDOf9tQybcJuW4QYM8Ayr1K6HB8894GfrI/formResponse?draftResponse=[]%0D%0A&pageHistory=0',
						{
							'entry.1501323902':	prefs.ereaderModel + (prefs.ereaderModel==="other" ? " (" + prefs.otherEreaderModel + ")" : ""),
							'entry.1922726083':	prefs.screenWidth,
							'entry.651002044':	prefs.screenHeight,
							'entry.2016260998':	prefs.screenPpi
						}
					);
					let req = new XMLHttpRequest();
					req.open("GET", url, true);
					req.send();
				});
			},
			5000
		);
	}


	function dontprintArticleFromPage(pageurl, tabId, windowId, listener) {
		Dontprint.runJob({
			jobType: "page",
			pageurl: pageurl.split("#")[0],
			tabId,
			windowId,
			title: "Retrieving article meta data...",
			progressListener: listener
		});
	}


	function connectPopupToJob(jobId, listener) {
		let job = runningJobs[jobId];
		if (job) {
			job.progressListener = listener;
		}
		listener(job);
	}


	function getJobFromId(jobId) {
		return runningJobs[jobId];
	}


	function getJournalFilters() {
		return spawnSqlTransaction(journaldb, function*(sql) {
			let result = yield sql("SELECT id, longname, shortname, minDate, maxDate, m1, m2, m3, m4, coverpage, k2pdfoptParams, scale FROM journals WHERE enabled=1 ORDER BY priority DESC, lastModified DESC");
			return Array.prototype.slice.call(result.rows);
		});
	}


	function init() {
		// Make platformTools available to scripts that connect to this one
		this.platformTools = PlatformTools;
		// PlatformTools.exportFunctions({
		// 	getJobFromId,
		// 	cropPageDone,
		// 	resultPageLoaded,
		// 	sendVerificationCode,
		// 	verifyEmailAddress,
		// 	dontprintArticleFromPage,
		// 	connectPopupToJob,
		// 	openSettings,
		// 	showProgress,
		// 	abortJob,
		// 	getJournalFilters,
		// 	saveJournalSettings,
		// 	deleteJournalSettings,
		// 	isTransferMethodValid,
		// 	getEreaderModelDefaults
		// });

		journaldb = openDatabase("journaldb", "", "Dontprint's k2pdfopt settings for known journals", 100 * 1024);

		if (journaldb.version !== DATABASE_VERSION) {
			updateJournalDb();
		}

		PlatformTools.getPrefs({
			ereaderModel: "",
			transferMethod: "",
			recipientEmailPrefix: "",
			recipientEmailSuffix: "",
			recipientEmailOther: "",
			verifiedEmails: []
		}).then(function(prefs) {
		console.log(prefs);
			if (!prefs.ereaderModel || !isTransferMethodValid(prefs)) {
				chrome.tabs.create({
					url: "common/welcome/dontprint-welcome.html"
				});
			}
		});
	}

// 	// ==== PUBLICLY VISIBLE METHODS ================================
	
// 	function init() {
// 		Components.utils.import("resource://gre/modules/FileUtils.jsm");
// 		Components.utils.import("resource://gre/modules/Sqlite.jsm")
// 		Components.utils.import("resource://gre/modules/Task.jsm");
// 		Components.utils.import("resource://EXTENSION/subprocess.jsm");
// 		Components.utils.import("resource://gre/modules/AddonManager.jsm");
// 		Components.utils.import("resource://gre/modules/Timer.jsm");
// 		Components.utils.import("resource://gre/modules/Downloads.jsm");
// 		console = Components.utils.import("resource://gre/modules/devtools/Console.jsm", {}).console;
// 		try {
// 			// Gecko >= 25
// 			Components.utils.import("resource://gre/modules/Promise.jsm");
// 		} catch (e) {
// 			try {
// 				// Gecko 21 to 24
// 				Components.utils.import("resource://gre/modules/commonjs/sdk/core/promise.js");
// 			} catch (e) {
// 				// Gecko 17 to 20
// 				Components.utils.import("resource://gre/modules/commonjs/promise/core.js");
// 			}
// 		}
		
// 		prefs = Components.classes["@mozilla.org/preferences-service;1"]
// 						.getService(Components.interfaces.nsIPrefService)
// 						.getBranch("extensions.dontprint.");
		
// 		// Add Dontprint button to menu panel
// 		try {
// 			Components.utils.import("resource:///modules/CustomizableUI.jsm");
// 			let that = this;
// 			CustomizableUI.createWidget({
// 				id: 'dontprint-toolbaritem',
// 				type: 'view',
// 				viewId: 'dontprint-toolbaritem-view',
// 				label: 'Dontprint',
// 				tooltiptext: 'Show tools provided by addon "Dontprint"',
// 				defaultArea: CustomizableUI.AREA_PANEL,
// 				onViewShowing: function(event) {
// 					event.target.ownerDocument.defaultView.DontprintBrowser.onDontprintMenuShow(event);
// 				}
// 			});
// 		} catch (e) { } // FF < 29
		
// 		// Initialize database in file "dontprint/db3.sqlite" in the profile directory
// 		// FileUtils.getFile() creates the directory (but not the file) if necessary
// 		let dbfile = FileUtils.getFile("ProfD", ["dontprint", "db3.sqlite"]);
// 		databasePath = dbfile.path;
		
// 		Task.spawn(function() {
// 			try {
// 				// Sqlite.openConnection() creates the file if necessary
// 				var conn = yield Sqlite.openConnection({path: databasePath});
// 				if (!(yield conn.tableExists("settings"))) {
// 					yield conn.executeTransaction(updateDatabase);
// 				} else {
// 					let sqlresult = yield conn.execute("SELECT value FROM settings WHERE key='dbversion'");
// 					if (sqlresult.length === 0 || sqlresult[0].getResultByName("value") < DATABASE_VERSION) {
// 						yield conn.executeTransaction(updateDatabase);
// 					}
// 				}
// 			} finally {
// 				yield conn.close();
// 			}
// 		});
		
// 		const loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
// 						.getService(Components.interfaces.mozIJSSubScriptLoader);
// 		loader.loadSubScript("chrome://dontprint/content/post-translation.js");
// 	}


	function* getScreenDimensions() {
		let ret = yield PlatformTools.getPrefs({
			screenWidth: -1,
			screenHeight: -1,
			screenPpi: -1,
			ereaderModel: "other"
		});
		let defaultSettings = EREADER_MODEL_DEFAULTS[ret.ereaderModel];
		for (let key in defaultSettings) {
			if (ret[key] < 0) {
				ret[key] = defaultSettings[key];
			}
		}
		return ret;
	}
	
	
// 	function dontprintLocalFile() {
// 		let Dontprint = Components.classes['@robamler.github.com/dontprint;1']
// 						.getService().wrappedJSObject;
// 		let win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
// 			.getService(Components.interfaces.nsIWindowMediator)
// 			.getMostRecentWindow("navigator:browser");
		
// 		let nsIFilePicker = Components.interfaces.nsIFilePicker;
// 		let fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
// 		fp.addToRecentDocs = true;
// 		fp.init(win, "Pick a PDF document to send to your e-reader", nsIFilePicker.modeOpenMultiple);
// 		fp.appendFilter("PDF documents", "*.pdf");
// 		fp.appendFilters(nsIFilePicker.filterAll);
		
// 		if (fp.show() === nsIFilePicker.returnOK) {
// 			let files = fp.files;
// 			while (files.hasMoreElements())  {
// 				let file = files.getNext().QueryInterface(Components.interfaces.nsILocalFile);
// 				let m = file.leafName.match(/^(.*)\.pdf$/i);
// 				let title = m ? m[1] : file.leafName;
// 				Dontprint.runJob({
// 					jobType:			"localfile",
// 					title:				title,
// 					journalLongname:	"",
// 					journalShortname:	"",
// 					originalFilePath:	file.path,
// 					tmpFiles:			[]
// 				});
// 			}
// 		}
// 	}
	
	
	function abortJob(jobId) {
		let job = runningJobs[jobId];
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
				cleanupJob(job);
			} catch (e) {
				//ignore
			}
		}
	}
	
	
	function showProgress(openerTabId) {
		openSingletonTab("common/progress/progress.html", openerTabId, false);
	}
	
	
	function openSettings(openerTabId) {
		openSingletonTab("common/preferences/preferences.html", openerTabId, true);
	}


	function openSingletonTab(url, openerTabId, globalSingleton) {
		spawn(function*() {
			let openargs = {url};
			let openerTab = yield new Promise(function(res, rej) {
				chrome.tabs.get(openerTabId, res);
			});

			if (openerTab || globalSingleton) {
				// check if we can reuse an existing progress tab in this window
				let existing = yield new Promise(function(res, rej) {
					let absUrl = chrome.extension.getURL(url);
					let queryargs = {
						url: [absUrl, absUrl + "#*"]
					};
					if (!globalSingleton) {
						queryargs.windowId = openerTab.windowId;
					}
					chrome.tabs.query(queryargs,res);
				});

				if (existing.length) {
					console.log(existing[0]);
					if (existing[0].windowId !== openerTab.windowId) {
						existing[0] = yield new Promise(function(res, rej) {
							chrome.tabs.move(
								existing[0].id,
								{
									windowId: openerTab.windowId,
									index: openerTab.index + 1
								},
								res
							);
						});
					}
					console.log(existing[0]);
					chrome.tabs.highlight({
						windowId: existing[0].windowId,
						tabs: existing[0].index
					});
					return;
				}

				openargs.windowId = openerTab.windowId;
				openargs.index = openerTab.index + 1;
			}

			chrome.tabs.create(openargs);
		})();
	}
	
	
	function sendTestEmail(callback) {
		PlatformTools.getPrefs({ereaderModel: "other"}).then(
			function(ret) {
				runJob({
					title:		"Dontprint test document",
					jobType:	"test",
					pdfurl:		"http://dontprint.net/test-documents/" + ret.ereaderModel + ".pdf",
					tmpFiles:	[],
					callback:	callback
				});
			}
		);
	}
	
	
	function* getRecipientEmail() {
		let prefs = yield PlatformTools.getPrefs({
			recipientEmailPrefix: null,
			recipientEmailSuffix: null,
			recipientEmailOther: null
		});

		if (prefs.recipientEmailSuffix === "other") {
			return prefs.recipientEmailOther;
		} else if (prefs.recipientEmailPrefix) {
			return prefs.recipientEmailPrefix + prefs.recipientEmailSuffix;
		} else {
			throw "No e-mail address set";
		}
	}
	

	function isTransferMethodValid(prefs) {
		if (prefs.transferMethod === "directory") {
			return true;
		} else if (prefs.transferMethod === "email") {
			let email = prefs.recipientEmailSuffix === "other" ? prefs.recipientEmailOther : prefs.recipientEmailPrefix + prefs.recipientEmailSuffix;
			return prefs.verifiedEmails.indexOf(email) !== -1;
		} else {
			return false;
		}
	}


	function getEreaderModelDefaults() {
		return EREADER_MODEL_DEFAULTS;
	}
	
	function sendVerificationCode(prefs) {
		return new Promise(function (resolve, reject) {
			spawn(function*() {
				yield PlatformTools.setPrefs(prefs);
				let email = yield getRecipientEmail();
				if (!email) {
					reject("No e-mail address set");
				}
				let req = new XMLHttpRequest();
				req.responseType = "json";
				req.onload = function() {
					if (req.response.success && req.response.returncode === 1) {
						// Email addres was already verified
						rememberVerifiedEmail(email);
					}
					if (req.response.success) {
						resolve(req.response);
					} else {
						reject(req.response.message);
					}
				};
				req.onerror = function(error) {
					reject("Connection error. Are you connected to the internet?");
				};
				req.open("POST", "http://dontprint.net/cgi-bin/send-verification-mail.pl", true);
				req.setRequestHeader("Content-type","application/x-www-form-urlencoded");
				req.send(buildURL("", {email}));
			})();
		});
	}
	
	
	function verifyEmailAddress(code) {
		return new Promise(function(resolve, reject) {
			spawn(function*() {
				let email = yield getRecipientEmail();
				if (!email) {
					reject("No e-mail address set");
				}

				let req = new XMLHttpRequest();
				req.responseType = "json";
				req.onload = function() {
					if (req.response.success) {
						rememberVerifiedEmail(email);
					}
					if (req.response.success) {
						resolve(req.response);
					} else {
						reject(req.response.message);
					}
				};
				req.onerror = function() {
					reject("Connection error. Are you connected to the internet?");
				};
				req.open("POST", "http://dontprint.net/cgi-bin/verify-email.pl", true);
				req.setRequestHeader("Content-type","application/x-www-form-urlencoded");
				req.send(buildURL("", {email, code}));
			})();
		});
	}
	
	
	function rememberVerifiedEmail(email) {
		PlatformTools.getPrefs({verifiedEmails: []}).then(function(prefs) {
			let em = email.toLocaleLowerCase();
			if (prefs.verifiedEmails.indexOf(em) !== -1) {
				return;
			}
			prefs.verifiedEmails.unshift(em);
			// Remember only up to 10 e-mail addresses.
			prefs.verifiedEmails = prefs.verifiedEmails.slice(0,10);
			PlatformTools.setPrefs(prefs);
		});
	}
	

	function cleanupJob(job) {
		if (!job.cleaned) {
			console.log("cleaning up");
			job.cleaned = true;
			delete runningJobs[job.id];
			if (job.pageurl) {
			console.log("removing from joblist");
				Zotero.Connector_Browser.dontprintJobDone(job.id, job.pageurl);
			}

			if (job.naclModule) {
				job.naclModule.parentNode.parentNode.removeChild(job.naclModule.parentNode);
				delete job.naclModule;
				// Event listeners are freed automatically
			}
			// TODO: rerender pageaction if job.jobType === "page"

			PlatformTools.rmTmpFiles(job.tmpFiles);
		}
	}


// 	// ==== LIFE CYCLE OF A DONTPRINT JOB ===========================
	function runJob(job) {
		job.id = Date.now();
		while (job.id in runningJobs) {
			job.id++;
		}
		runningJobs[job.id] = job;
		
		job.downloadProgress = 0;
		job.convertProgress = 0;
		job.uploadProgress = 0;
		job.tmpFiles = [];
		updateJobState(job, "queued");

		spawn(function*() {
			try {
				job.transferMethod = (yield PlatformTools.getPrefs("transferMethod")).transferMethod;

				if (job.jobType !== "test") {
					var naclLoaded = false;
					var naclPromise = loadK2pdfoptNaclModule(job);
					naclPromise.then(function() {
						naclLoaded = true;
					})
				}

				if (job.jobType === "page") {
					yield runZoteroTranslator(job);
				}

				let origPdfFile = null;

				if (job.pdfurl) {
					let blob = yield downloadPdfUrl(job);
					origPdfFile = yield PlatformTools.saveTmpFileOrBlob(blob, "original" + job.id + ".pdf");
					job.origPdfUrl = origPdfFile.toURL();
					job.tmpFiles.push(origPdfFile);
				}

				if (job.jobType === "test") {
					//TODO
// 					job.convertedFilePath = job.originalFilePath;
// 					job.finalFilename = 'Dontprint test document.pdf';
				} else {
					yield cropMargins(job);
					yield convertDocument(job, naclLoaded, naclPromise);
					if (origPdfFile) {
						origPdfFile.remove(function(){});
					}
				}

				let authorAndTitle = job.title.replace(/[^a-zA-Z0-9 \-,]+/g, "_");
				if (job.articleCreators && job.articleCreators.length !== 0 && job.articleCreators[0].lastName) {
					authorAndTitle = job.articleCreators[0].lastName.replace(/[^a-zA-Z0-9 \-,]+/g, "_") + ", " + authorAndTitle;
				}
				if (job.transferMethod === "email") {
					yield sendEmail(job, authorAndTitle);
				} else {
					yield moveFileToDestDir(job, authorAndTitle);
				}
			} catch (e) {
				console.log("Dontprint encountered an error:");
				console.log(e);
				job.result = {
					success: false,
					message: e.toString()
				};
			} finally {
				try {
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
	// 				if (job.jobType === 'test') {  TODO
	// 					job.callback(newtab);
	// 				}
				} finally {
					cleanupJob(job);
				}
			}
		})();
	}


	function loadK2pdfoptNaclModule(job) {
		return new Promise(function(resolve, reject) {
			function err() {
				reject();
				job.abortCurrentTask();
			}

			let naclListenerDiv = document.createElement("div");
			naclListenerDiv.addEventListener("error", err, true);
			naclListenerDiv.addEventListener("load", resolve, true);
			naclListenerDiv.addEventListener("crash", err, true);
			naclListenerDiv.addEventListener("message", onNaclMessage.bind(this, job.id), true);

			job.naclModule = document.createElement("embed");
			job.naclModule.setAttribute("width", 0);
			job.naclModule.setAttribute("height", 0);
			job.naclModule.setAttribute("path", ".");
			job.naclModule.setAttribute("src", "k2pdfopt/k2pdfopt.nmf");
			job.naclModule.setAttribute("type", "application/x-pnacl");
			naclListenerDiv.appendChild(job.naclModule);

			document.getElementsByTagName("body")[0].appendChild(naclListenerDiv);
		});
	}


	function onNaclMessage(jobId, evt) {
		if (evt.data && evt.data.category) {
			let job = runningJobs[jobId];

			if (evt.data.category === "status") {
				if (evt.data.msg === "done") {
					job.naclDoneCallback();
				}
			} else if (evt.data.category === "progress") {
				job.convertProgress = 0.1 + 0.9 * evt.data.current / (evt.data.total + 1);
				updateJobState(job);
			}
		}
	}


	function* runZoteroTranslator(job) {
		updateJobState(job, "translating");

		try {
			yield new Promise(function(resolve, reject) {
				job.translatorSuccess = resolve;
				job.translatorFail = reject;
				Zotero.Connector_Browser.dontprintRunZoteroTranslator(job.tabId, job.id, job.pageurl);
			});
		} finally {
			delete job.translatorSuccess;
			delete job.translatorFail;
			delete job.translatorFunction;
		}
	}
	
	
	function downloadPdfUrl(job) {
		updateJobState(job, "downloading");

		if (!job.title) {		
			let title = decodeURIComponent(nsIURL.filePath);
			let m = title.match(/^.*\/([^/]+)\/?$/);  // extract last part of path
			if (m) {
				title = m[1];
			}
			title = title.replace(/\..{0,4}$/, ""); // trim file extension if any
			if (!title) {
				title = "Dontprinted document";
			}
			job.title = title;
		}

		return new Promise(function(resolve, reject) {
			let req = new XMLHttpRequest();
			req.responseType = "blob";

			req.addEventListener("progress", function(evt) {
				if (evt.lengthComputable && evt.total>0) {
					job.downloadProgress = evt.loaded/evt.total;
					updateJobState(job);
				}
			}, false);

			req.addEventListener("error", function(evt) {
				reject("Error downloading PDF file. Are you connected to the internet? Original error message: " + evt.toString());
			}, false);

			req.onreadystatechange = function (evt) {
				if (req.readyState == 4) {
					if(req.status == 200) {
						resolve(req.response);
					} else {
						reject("Unable to download article. Maybe it is behind a captcha. (Try to download the PDF manually, then go back to the article's abstract and click the Dontprint icon again.)");
					}
				}
			};

			req.open("GET", job.pdfurl);
			req.send();
		});
	}


	function* cropMargins(job) {
		updateJobState(job, "cropping");
		
		// sanitize journal names
		if (!job.journalLongname) {
			job.journalLongname = "";
		}
		if (!job.journalShortname) {
			job.journalShortname = "";
		}
		
		// yield Dontprint.postTranslate(job);  TODO

		job.crop = yield spawnSqlTransaction(journaldb, function*(sql) {
			let dates = parseDateString(job.articleDate);
			try {
				if (job.journalLongname) {
					var longnameresult = (yield sql(
						"SELECT * FROM journals WHERE longname=? AND (minDate=0 OR minDate<=?) AND (maxDate=0 OR maxDate>=?) ORDER BY priority DESC, lastModified DESC LIMIT 1",
						[job.journalLongname, dates.small, dates.large]
					)).rows;
				}
				if (job.journalShortname) {
					var shortnameresult = (yield sql(
						"SELECT * FROM journals WHERE shortname=? AND (minDate=0 OR minDate<=?) AND (maxDate=0 OR maxDate>=?) ORDER BY priority DESC, lastModified DESC LIMIT 1",
						[job.journalShortname, dates.small, dates.large]
					)).rows;
				}
			} catch (e) {
				return null;
			}

			// augment sqlresults with priority based on matching shortname and/or longname
			if (!longnameresult || longnameresult.length === 0) {
				if (shortnameresult && shortnameresult.length === 1) {
					return shortnameresult[0];
				} else {
					return null;
				}
			} else if (!shortnameresult || shortnameresult.length === 0) {
				return longnameresult[0];
			} else {
				// found match for both longname and shortname
				let spriority = parseFloat(shortnameresult[0].priority) + 0x200;
				let lpriority = parseFloat(longnameresult[0].priority) + 0x1000;
				return spriority > lpriority ? shortnameresult[0] : longnameresult[0];
			}
		}, true);

		if (job.crop) {
			job.crop.rememberPreset = false;  // if crop window needs to be shown, then by default don't remember settings
		} else {
			job.crop = {
				rememberPreset:true, id:0, enabled:false,
				minDate:0, maxDate:0,
				m1:5, m2:5, m3:5, m4:5,
				coverpage:false, k2pdfoptParams: "", scale: "1"
			};
		}
		if (!job.crop.longname) {
			job.crop.longname = job.journalLongname;
		}
		if (!job.crop.shortname) {
			job.crop.shortname = job.journalShortname;
		}
		
		if (job.adjustCropDefaults) {
			yield job.adjustCropDefaults();
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
			// pass "neverReportJournalSettings" to crop dialog
			job.neverReportJournalSettings = false; // TODO: get from settings

			let openertab = yield new Promise(function(res, rej) {
				chrome.tabs.get(job.tabId, res);
			});
			let openargs = {
				windowId: job.windowId,
				url: "common/pdfcrop/pdfcrop.html#" + job.id
			};
			if (openertab) {
				openargs.index = openertab.index + 1;
			}
			let newtab = yield new Promise(function(res, rej) {
				chrome.tabs.create(openargs, res);
			});

			try {
				job.crop = yield new Promise(function(resolve, reject) {
					job.acceptCropPage = resolve;
					job.abortCurrentTask = reject.bind(this, "canceled");
				});
			} finally {
				delete job.acceptCropPage;
				delete job.abortCurrentTask;
				try {
					chrome.tabs.remove(newtab.id);
				} catch (e) {
					// ignore: Tab was already closed
				}
			}

			if (!job.prohibitSaveJournalSettings && (job.crop.shortname !== "" || job.crop.longname !== "")) {
				try {
					yield saveJournalSettings(job.crop);
				} catch (e) {
					// ignore errors
				}

				if (job.crop.sendsettings) {
					yield reportJournalSettings(job);
				}
			}
		}
	}


	function cropPageDone(jobId, success, crop) {
		let job = runningJobs[jobId];
		if (success) {
			job.acceptCropPage(crop);
		} else {
			job.abortCurrentTask();
		}
	}
	
	/**
	 * Returns a promise. Call either from within a transaction with
	 *   yield deleteJournalSettings(crop.id, sql);
	 * where "sql" is the function that executes an sql statement,
	 * or outside of a transaction:
	 *   yield deleteJournalSettings(crop.id);
	 */
	function deleteJournalSettings(id, sql) {
		function* run(sql2) {
			yield sql2(
				"UPDATE journals SET enabled=0, priority=priority & ~2097152 WHERE id=?",
				[id]
			);
			if (id < 0) {
				// Builtin filter; make sure it remains deleted even after a database update
				yield sql2(
					"INSERT INTO deletedBuiltinJournals VALUES (?)",
					[id]
				);
			}
		}

		if (sql) {
			return run(sql);
		} else {
			return spawnSqlTransaction(journaldb, run);
		}
	}
	
	
	/**
	 * Saves the data in job.crop to the database. Automatically
	 * calculates the priority and decides whether to overwrite
	 * an existing setting or to add a new entry. If crop.id < 0, then
	 * the builtin filter is marked as disabled, a new filter is
	 * inserted and crop.id will be set to the new (positive) id.
	 * @param  {function} crop
	 *         The journal settings.
	 * @return {Promise}
	 *         A promise that will be resolved with an object
	 *         {oldid, newid}, which holds the old and the new id of the
	 *         journal filter. If a new filter was added, then
	 *         oldid === undefined and newid >= 0. If a builtin filter was
	 *         modified, then oldid < 0 and newid >= 0. If a custom filter
	 *         was modified, then oldid === newid >= 0.
	 */
	function saveJournalSettings(crop) {
		return spawnSqlTransaction(journaldb, function*(sql) {
			if (crop.id < 0) {
				// builtin filter; mark as deleted and then insert new filter
				yield deleteJournalSettings(crop.id, sql);
			}

			// determine priority (used to be octal values, therefore increment by factor of 8)
			crop.priority = (
				// If enabled===false, then the filter should be regarded as deleted.
				// It will only be used as a suggestion and only if no other filter matches.
				(crop.enabled					?  0x200000 : 0)
				// Setting minDate and/or maxDate increases the specificity of the filter
				+ (crop.minDate !== 0			?   0x40000 : 0)
				+ (crop.maxDate !== 0			?   0x40000 : 0)
				// If two filters are equally specific, then custom filters have priority over builtin ones; this function only inserts custom filters
				+ 								     0x8000
				// longname matches:                 0x1000 (set in cropMargins())
				// shortname matches:                 0x200 (set in cropMargins())
				// If there's still a tie, then use the more cautious filter.
				+ (!crop.coverpage				?      0x40 : 0)
				+ (crop.k2pdfoptParams !== ""	?       0x8 : 0)
			);

			// Synthesize sql query
			let sqlfields = ["priority", "enabled", "longname", "shortname", "minDate", "maxDate", "m1", "m2", "m3", "m4", "coverpage", "k2pdfoptParams", "scale"];
			if (crop.id >= 0) {
				// don't overwrite builtin entries (id<0) or new entries (id===undefined)
				sqlfields.push("id");
			}
			let sqlcommand = "INSERT INTO journals (" + sqlfields.join(",") + ") VALUES (" + sqlfields.map(function() {return "?";}).join(",") + ")";
			let sqlparams = sqlfields.map(function(key) {
				let val = crop[key];
				// Convert bools to ints to avoid automatic conversion to strings
				return (val===true ? 1 : (val===false ? 0 : val));
			});
			
			let insertresult = yield sql(sqlcommand, sqlparams);
			let ret = {
				oldid: crop.id,
				newid: crop.id
			};
			if (insertresult && (crop.id < 0 || crop.id===undefined)) {
				ret.newid = insertresult.insertId;
			}
			return ret;
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
				'entry_708841410':  job.crop.scale,
				'entry.937121035':	job.crop.k2pdfoptParams,
				'entry.536903634':	job.doi,
				'entry.1375537145':	job.title
			}
		);
		var req = new XMLHttpRequest();
		req.open("GET", url, true);
		req.send();
		// Don't set onload handler because we don't really care about the response
	}
	
	
	function getHostFromUrl(url) {
		var m = url.match(/^([^#/?:]+:[^#/?:]*\/+)?([^#/?]+\.[^#/?]+)([#/?].*)?$/);
		return m ? m[2] : "unknown";
	}
	
	
	function* convertDocument(job, naclLoaded, naclPromise) {
		updateJobState(job, "converting");

		if (!naclLoaded) {
			// If NaCl module is still loading, use the first 10% of the
			// convert progress bar to show remaining NaCl load progress.
			let firstLoadStatus = null;
			job.naclModule.parentNode.addEventListener("progress", function(evt) {
				if (evt.lengthComputable && evt.total>0) {
					if (firstLoadStatus === null) {
						firstLoadStatus = evt.loaded;
					} else {
						job.convertProgress = 0.1 * (evt.loaded-firstLoadStatus) / (evt.total-firstLoadStatus);
						updateJobState(job);
					}
				}
			}, true);
			yield naclPromise;
		}

		let dims = yield getScreenDimensions();
		var scale = parseFloat(job.crop.scale);
		if (isNaN(scale)) {
			scale = 1;
		}

		// Put more specific command line arguments to the end. It seems
		// like later command line arguments overwrite earlier arguments.
		let args = [
			"-a-",
			"-w",  "" + dims.screenWidth,
			"-h",  "" + dims.screenHeight,
			"-odpi", "" + Math.round(scale * dims.screenPpi),
			"-ml", "" + parseFloat(job.crop.m1)/25.4,
			"-mt", "" + parseFloat(job.crop.m2)/25.4,
			"-mr", "" + parseFloat(job.crop.m3)/25.4,
			"-mb", "" + parseFloat(job.crop.m4)/25.4,
			"-p", job.crop.pagerange ? job.crop.pagerange : (job.crop.coverpage ? "2-" : "1-"),
			"-o", "/temporary/converted" + job.id + ".pdf",
			"/temporary/original" + job.id + ".pdf"
		];
		let globalArgs = (yield PlatformTools.getPrefs({
			k2pdfoptAdditionalParams: ""
		})).k2pdfoptAdditionalParams.trim();
		if (globalArgs) {
			args = args.concat(globalArgs.split(/\s+/));
		}
		if (job.crop.k2pdfoptParams) {
			args = args.concat(job.crop.k2pdfoptParams.split(/\s+/));
		}
		
		job.tmpFiles.push("converted" + job.id + ".pdf");

		try {
			yield new Promise(function(resolve, reject) {
				job.naclDoneCallback = resolve;
				job.abortCurrentTask = reject;  //TODO: will removing the <module> element stop the k2pdfopt process?
				job.naclModule.postMessage({
					cmd: "k2pdfopt",
					args: args,
					options: {
						title: job.title,
						author: checkUndefined(job.authorsStr)
					}
				});
			});
		} catch (e) {
			if (job.jobType === 'page') {
				throw "Conversion failed. This may mean that Dontprint was unable to download the article. Try to download the PDF manually, then go back to the article's abstract and click the Dontprint icon again.";
			} else {
				throw "Conversion failed";
			}
		} finally {
			delete job.abortCurrentTask;
			delete job.naclDoneCallback;

			job.naclModule.parentNode.parentNode.removeChild(job.naclModule.parentNode);
			delete job.naclModule;
			// Event listeners are freed automatically
		}

		job.finalFile = yield PlatformTools.getTmpFile("converted" + job.id + ".pdf");
	}


	function* sendEmail(job) {
		updateJobState(job, "sending");
		
		job.recipientEmail = yield getRecipientEmail();
		var url = buildURL(
			"http://dontprint.net/cgi-bin/send-document.pl",
			{
				filename:	job.finalFilename,
				email:		job.recipientEmail,
				itemKey:	job.id
			}
		);
		
		try {
			yield new Promise(function(resolve, reject) {
				let req = new XMLHttpRequest();
				req.upload.addEventListener(
					"progress",
					function uploadProgressListener(e) {
						job.uploadProgress = e.loaded / e.total;
						updateJobState(job);
					},
					false
				);
				req.onload = function() {
					try {
						req.upload.removeEventListener(uploadProgressListener);
						job.result = JSON.parse(req.responseText);
						if (job.result.success) {
							resolve(job.result);
						} else if (job.result.errno === 3) {
							reject('The e-mail address of your e-reader is not verified yet. Please choose "Tools --> Dontprint --> Configure Dontprint" and verify your e-mail address.'); //TODO: adjust text to Chrome
						} else {
							reject(job.result.message);
						}
					} catch (err) {
						reject("Error sending e-mail: " + err);
					}
				};
				req.onerror = function(e) {
					reject("Error sending e-mail: " + e.toString());
				};
				req.onabort = function() {
					reject("canceled");
				};
				req.open('POST', url, true);
				req.send(job.finalFile);

				job.abortCurrentTask = function() {
					// Setting job.abortCurrentTask = req.abort won't work.
					// With this function wrapper, it works.
					req.abort();
				};
			});
		} finally {
			delete job.abortCurrentTask;
		}
	}


	function moveFileToDestDir(job, authorAndTitle) {
		updateJobState(job, "moving");

		return new Promise(function(resolve, reject) {
			chrome.downloads.download(
				{
					url: job.finalFile.toURL(),
					filename: authorAndTitle.substr(0, 100) + ".pdf",
					conflictAction: "uniquify"
				},
				function(downloadId) {
					if (downloadId === undefined) {
						reject("Cannot find converted file.");
					} else {
						chrome.downloads.search(
							{id: downloadId},
							function(downloadItems) {
								let item = downloadItems[0];
								job.result = {
									success: true,
									fileName: item.filename.match(/[^\\/]+$/),
									downloadId
								};
								resolve();
							}
						);
					}
				}
			);
		});
	}


	function* displayResult(job) {
		console.log(job);//TODO
		job.result.errorOperation = job.state;
		updateJobState(job, job.result.success ? "success" : "error");
		let prefs = yield PlatformTools.getPrefs({
			transferMethod: "directory",
			successPageInBackground: false
		});

		let openertab = yield new Promise(function(res, rej) {
			chrome.tabs.get(job.tabId, res);
		});
		let openargs = {
			windowId: job.windowId,
			active: !(prefs.successPageInBackground && job.result.success),
			url: "common/resultpage/" + prefs.transferMethod + "/" + job.state + ".html#" + job.id
		};
		if (openertab) {
			openargs.index = openertab.index + 1;
		}
		let newtab = yield new Promise(function(res, rej) {
			chrome.tabs.create(openargs, res);
		});

		// yield new Promise(function(res, rej) {
		// 	job.resultPageCallback = res;
		// });

		return newtab;
	}


	function resultPageLoaded(jobId, sendResponse) {
		let job = runningJobs[jobId];
		sendResponse(job);
		job.resultPageCallback();
	}


	function formatName(creator) {
		if (!creator.lastName) {
			throw "error";
		}
		if (!creator.firstName) {
			return creator.lastName;
		}
		return creator.firstName + " " + creator.lastName
	}


	function getAuthorsString(creators) {
		switch (creators.length) {
		case 0:
			throw "error";
		
		case 1:
			return formatName(creators[0]);
		
		case 2:
			// two authors, separated by " and " without a comma
			return formatName(creators[0]) + " and " + formatName(creators[1]);
		
		case 3: //FALLTHRU
		case 4:
			// comma separated list, with comma before the ", and "
			var authorsStr = "";
			for (var i=0; i<creators.length-1; i++) {
				authorsStr += formatName(creators[i]) + ", ";
			}
			authorsStr += "and " + formatName(creators[creators.length-1]);
			return authorsStr;
		
		default: // too many authors to list them all
			return formatName(creators[0]) + " et al.";
		}
	}


	function zoteroTranslatorDone(item, tabId) {
		let job = null;

		for (let i in runningJobs) {
			let el = runningJobs[i];
			if (typeof el === "object" && el.tabId === tabId && el.state === "translating") {
				job = el;
				break;
			}
		}

		if (!job) {
			return;
		}

		job.title = checkUndefined(item.title, "Untitled document");
		job.articleCreators = item.creators;
		job.authorsStr = getAuthorsString(item.creators);
		job.journalLongname = checkUndefined(item.publicationTitle);
		job.journalShortname = checkUndefined(item.journalAbbreviation);
		job.doi = checkUndefined(item.DOI);
		job.articleVolume = item.volume;
		job.articleIssue = item.issue;
		job.articlePages = item.pages;
		job.articleDate = checkUndefined(item.date);

		let type = (item.itemType ? item.itemType : "webpage");
		if (type === "note") {
			//TODO: error
		} else if (type == "attachment") {	// handle attachments differently
			//TODO
		} else if (item.attachments) {
			for (let i=0; i<item.attachments.length; i++) {
				let att = item.attachments[i];
				if (att.mimeType && att.mimeType === "application/pdf") {
					job.pdfurl = att.url;
					break;
				}
			}
		}

		if (job.pdfurl) {
			job.translatorSuccess();
		} else {
			job.translatorFail("Dontprint cannot find a PDF document that is associated with this web page. Navigate your browser to a web page that clearly describes a single specific article before you click the Dontprint icon.");
		}
	}
	
	
// 	// ==== HELPER FUNCTIONS ========================================================
	
	function spawn(generatorFunc) {
		return function() {
			function iterate(generator) {
				function continuer(verb, arg) {
					try {
						var result = generator[verb](arg);
					} catch (err) {
						return Promise.reject(err);
					}
					if (result.done) {
						return Promise.resolve(result.value);
					} else {
						if (typeof result.value === "object" && result.value.next && typeof result.value.next === "function") {
							return iterate(result.value).then(onFulfilled, onRejected);
						} else {
							return Promise.resolve(result.value).then(onFulfilled, onRejected);
						}
					}
				}
				let onFulfilled = continuer.bind(continuer, "next");
				let onRejected = continuer.bind(continuer, "throw");
				return onFulfilled();
			}

			let gen = generatorFunc.apply(this, arguments);
			return iterate(gen);
		};
	}
	
	/**
	 * Execute a transaction on a database and return a promise.
	 * Obtains a transaction for the database db and then spawns the
	 * function* generatorFunc passing it a function "sql". The body of
	 * generatorFunc will typically yield for one or more executions of
	 * the sql function, i.e. it will contain calls of the form
	 *   "let queryresult = yield sql(sqlstring, args)"
	 * Here, sqlstring is a query string that may contain "?" placeholders
	 * and args is an optional array of values to be inserted for the
	 * placeholders.
	 * Note: The body of generatorFunc MUST NOT contain any "yield"
	 * statements that don't queue up any SQL queries (if it does, the SQL
	 * transaction may be committed before generatorFunction terminates).
	 *
	 * @param  {Database} db
	 *         The database.
	 * @param  {function*(sql)} generatorFunc
	 *         A generator function that MUST NOT contain any yield
	 *         statements that are not of the form
	 *         "yield sql(sqlstring, args)".
	 *         If the SQL query succeeds, the return value of the yield
	 *         statement is the query result. If it fails, an error is
	 *         thrown.
	 * @param  {bool} readonly
	 *         Optional argument; set to true if the true if the
	 *         transaction does not change the database. Defaults to false.
	 * @return {Promise}
	 *         A promise that will be resolved with the return value of
	 *         generatorFunc or rejected in case of an error.
	 */
	function spawnSqlTransaction(db, generatorFunc, readonly) {
		let overallRet = null;
		
		return new Promise(function(resolve, reject) {
			db[readonly ? "readTransaction" : "transaction"](
				function (t) {
					function sql(sqlstring, args) {
						return new Promise(function(resolve, reject) {
							t.executeSql(
								sqlstring,
								args,
								function(t2, ret) {
									resolve(ret);
								},
								function(t2, err) {
									reject(err);
								}
							);
						});
					}

					spawn(generatorFunc)(sql).then(
						function (ret) {
							overallRet = ret;
						},
						reject
					);
				},
				reject,
				function() {
					resolve(overallRet);
				}
			);
		});
	}
	
	
	/**
	 * return value if value isn't undefined; otherwise, return defaultTo or empty string
	 */
	function checkUndefined(value, defaultTo) {
		return value === undefined ? (defaultTo === undefined ? "" : defaultTo) : value;
	}
	
	
	function buildURL(main, params) {
		if (main === null)
			main = "";
		let sep = (main === "" ? "" : (main.indexOf("?") === -1 ? '?' : '&'));
		for (let i in params) {
			main += sep + encodeURIComponent(i) + '=' + encodeURIComponent(params[i]);
			sep = "&";
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
			if (job.progressListener) {
				try {
					job.progressListener(job);
				} catch (e) {
					delete job.progressListener;
				}
			}

			for (let id in progressListeners) {
				try {
					progressListeners[id].postMessage({
						call: "updateJob",
						args: [job]
					});
				} catch (e) {
					// apparently, progressTab has been closed without unregistering the listener
					delete progressListeners[id];
				}
			}
		}, 0);
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
}());
