"use strict";

PlatformTools.registerMainComponent("Dontprint", function() {
	const DATABASE_VERSION = "20150627";
	const DONTPRINT_VERSION = "1.1beta";
	const itemTypeBlacklist = ["multiple", "encyclopediaArticle", "blogPost", "forumPost", "presentation", "webpage"];
	var runningJobs = {};
	var runningJobsCnt = 0;
	var queuedUrls = {};
	var journaldb = null;
	var progressListeners = new Set();
	var Dontprint = null;

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
		getAllRunningJobs,
		getNumberOfRunningJobs,
		isQueuedUrl,
		addProgressListener,
		removeProgressListener,
		cropPageDone,
		sendVerificationCode,
		verifyEmailAddress,
		connectPopupToJob,
		connectToResultPage,
		resultPageClosed,
		openSettings,
		showProgress,
		abortJob,
		getJournalFilters,
		saveJournalSettings,
		deleteJournalSettings,
		sendScreenSettings,
		isTransferMethodValid,
		getEreaderModelDefaults,
		onMessageExternal,
		aboutDontprint,
		itemTypeBlacklist
	};


	function updateJournalDb(oldversion, newversion, runUpdateTransaction) {
		let req = PlatformTools.xhr();
		req.responseType = "json";

		req.onload = function() {
			let builtinJournals = req.response;

			runUpdateTransaction(
				function*(sql) {
					// The "scale" column was added on 2015-06-27
					if (parseInt(oldversion) < 20150627) {
						try {
							yield sql('ALTER TABLE journals ADD COLUMN scale TEXT DEFAULT "1"');
						} catch (e) {
							// ignore; will try the CREATE TABLE IF NOT EXISTS command below instead
						}
					}

					yield sql(
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
					yield sql("CREATE TABLE IF NOT EXISTS deletedBuiltinJournals (id INTEGER PRIMARY KEY ON CONFLICT IGNORE)");

					for (let i=0; i<builtinJournals.length; i++) {
						yield sql("INSERT INTO journals VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", builtinJournals[i]);
					}

					// Disable any builtin journals that had already been deleted by the user.
					yield sql("UPDATE journals SET enabled=0, priority=priority & ~2097152 WHERE id IN (SELECT id FROM deletedBuiltinJournals)");
				}
			);
		};

		//TODO: is getUrl() really necessary here?
		req.open("GET", PlatformTools.extensionScriptUrl("common/builtinJournals.json"));
		req.send();
	}


	function getAllRunningJobs() {
		return runningJobs;
	}


	function getNumberOfRunningJobs() {
		return runningJobsCnt;
	}


	function isQueuedUrl(url) {
		return queuedUrls[url.split("#")[0]] !== undefined;
	}


	function addProgressListener(listener) {
		progressListeners.add(listener);
	}


	function removeProgressListener(listener) {
		progressListeners.delete(listener);
	}


	function sendScreenSettings() {
		PlatformTools.getPrefs({
			screenWidth: -1,
			screenHeight: -1,
			screenPpi: -1,
			ereaderModel: "",
			otherEreaderModel: ""
		}).then(function(prefs) {
			let url = buildURL(
				'https://docs.google.com/forms/d/1YCclhAjI9iDOf9tQybcJuW4QYM8Ayr1K6HB8894GfrI/formResponse?draftResponse=[]%0D%0A&pageHistory=0',
				{
					'entry.1501323902':	prefs.ereaderModel + (prefs.ereaderModel==="other" ? " (" + prefs.otherEreaderModel + ")" : ""),
					'entry.1922726083':	prefs.screenWidth,
					'entry.651002044':	prefs.screenHeight,
					'entry.2016260998':	prefs.screenPpi
				}
			);
			let req = PlatformTools.xhr();
			req.open("GET", url, true);
			req.send();
		});
	}


	function connectPopupToJob(jobId, onConnected, listener) {
		let job = runningJobs[jobId];
		if (job) {
			job.progressListener = listener;
		}
		onConnected(job);
	}


	function getJobFromId(jobId) {
		return runningJobs[jobId];
	}


	function getJournalFilters() {
		return journaldb.transaction(function*(sql) {
			let result = yield sql("SELECT id, longname, shortname, minDate, maxDate, m1, m2, m3, m4, coverpage, k2pdfoptParams, scale FROM journals WHERE enabled=1 ORDER BY priority DESC, lastModified DESC");
			return result.rows;
		});
	}


	function init() {
		if (this.initialized) {
			return;
		}
		this.initialized = true;
		Dontprint = this;
		// Make platformTools available to scripts that connect to this one
		this.platformTools = PlatformTools;

		if (PlatformTools.platform === "chrome") {
			chrome.runtime.onMessageExternal.addListener(onMessageExternal);
		}

		PlatformTools.openSqlDatabase({
			filename: "dontprint/db3.sqlite",
			dbname: "journaldb",
			targetVersion: DATABASE_VERSION,
			description: "Dontprint's k2pdfopt settings for known journals",
			estimatedSize: 100 * 1024,
			updateVersionCallback: updateJournalDb
		}).then(function(db) {
			journaldb = db;
		});

		PlatformTools.getPrefs({
			ereaderModel: "",
			transferMethod: "",
			recipientEmailPrefix: "",
			recipientEmailSuffix: "",
			recipientEmailOther: "",
			verifiedEmails: [],
			k2pdfoptPlatform: "",
			k2pdfoptPath: ""
		}).then(function(prefs) {
			if (!prefs.ereaderModel || !isTransferMethodValid(prefs) || (PlatformTools.platform === "firefox" && prefs.k2pdfoptPlatform === "")) {
				Dontprint.welcomeScreenId = Date.now();
				PlatformTools.openTab({
					url: PlatformTools.extensionScriptUrl("common/welcome/dontprint-welcome.html#" + Dontprint.welcomeScreenId),
					singleton: true,
					globalSingleton: true
				});
			}
			if (prefs.k2pdfoptPlatform !== "" && prefs.k2pdfoptPath === "") {
				// Platform has been detected but download of k2pdfopt was interrupted.
				// Resume download silently (regardless of whether or not welcome page
				// is displayed).
				Dontprint.downloadK2pdfopt(prefs);
			}
		});
	}


	function onMessageExternal(request, sender, sendResponse) {
		if (sender && sender.id) {
			// Attempted cross-extension message; deny for security reasons
			return;
		}

		let func;
		let parts = request.call.split(".");
		if (parts[0] === "PlatformTools") {
			func = PlatformTools[parts[1]];
		} else {
			func = Dontprint[parts[0]];
		}
		let args = request.args || [];
		if (typeof func === "function") {
			sendResponse(func.apply(Dontprint, args));
		} else if (request.call === "closeCallingTab") {
			PlatformTools.closeTab(sender.tab.id);
		}
	}


	function aboutDontprint() {
		return {
			version: DONTPRINT_VERSION,
			platform: PlatformTools.platform
		};
	}


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
		PlatformTools.openTab({
			url: PlatformTools.extensionScriptUrl("common/progress/progress.html"),
			openerTab: openerTabId,
			singleton: true
		});
	}
	
	
	function openSettings(openerTabId, pane) {
		PlatformTools.openTab({
			url: PlatformTools.extensionScriptUrl("common/preferences/preferences.html") + (pane ? "#" + pane : ""),
			openerTab: openerTabId,
			singleton: true,
			globalSingleton: true
		});
	}


	function sendTestEmail(callback) {
		PlatformTools.getPrefs({ereaderModel: "other"}).then(
			function(ret) {
				runJob({
					title:		"Dontprint test document",
					jobType:	"test",
					pdfurl:		"http://dontprint.net/test-documents/" + ret.ereaderModel + ".pdf",
					callback:	callback //TODO: call this at end of job
				});
			}
		);
	}
	
	
	function* getRecipientEmail() {
		let prefs = yield PlatformTools.getPrefs({
			recipientEmailPrefix: "",
			recipientEmailSuffix: "",
			recipientEmailOther: ""
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
			return prefs.verifiedEmails.indexOf(email.toLowerCase()) !== -1;
		} else {
			return false;
		}
	}


	function getEreaderModelDefaults() {
		return EREADER_MODEL_DEFAULTS;
	}


	function sendVerificationCode(prefs) {
		return new Promise(function (resolve, reject) {
			PlatformTools.spawn(function*() {
				try {
					if (prefs) {
						yield PlatformTools.setPrefs(prefs);
					}
					let email = yield getRecipientEmail();
					let req = PlatformTools.xhr();
					req.responseType = "json";
					req.onload = function() {
						let p = Promise.resolve();
						if (req.response.success && req.response.returncode === 1) {
							// Email addres was already verified
							p = rememberVerifiedEmail(email);
						}
						p.then(function() {
							if (req.response.success) {
								resolve(req.response);
							} else {
								reject(req.response.message);
							}
						});
					};
					req.onerror = function(error) {
						reject("Connection error. Are you connected to the internet?");
					};
					req.open("POST", "http://dontprint.net/cgi-bin/send-verification-mail.pl", true);
					req.setRequestHeader("Content-type","application/x-www-form-urlencoded");
					req.send(buildURL("", {email}));
				} catch (e) {
					reject(e);
				}
			});
		});
	}
	
	
	function verifyEmailAddress(code) {
		return new Promise(function(resolve, reject) {
			PlatformTools.spawn(function*() {
				try {
					let email = yield getRecipientEmail();

					let req = PlatformTools.xhr();
					req.responseType = "json";
					req.onload = function() {
						if (req.response.success) {
							resolve(rememberVerifiedEmail(email));
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
				} catch (e) {
					reject(e);
				}
			});
		});
	}
	
	
	function rememberVerifiedEmail(email) {
		return PlatformTools.getPrefs({verifiedEmails: []}).then(function(prefs) {
			let em = email.toLowerCase();
			if (prefs.verifiedEmails.indexOf(em) !== -1) {
				return;
			}
			prefs.verifiedEmails.unshift(em);
			// Remember only up to 10 e-mail addresses.
			prefs.verifiedEmails = prefs.verifiedEmails.slice(0,10);
			return PlatformTools.setPrefs(prefs);
		});
	}
	

	function cleanupJob(job) {
		if (!job.cleaned) {
			job.cleaned = true;

			delete runningJobs[job.id];
			if (job.pageurl) {
				let strippedurl = job.pageurl.split("#")[0];
				if (queuedUrls[strippedurl] === job.id) {
					delete queuedUrls[strippedurl];
				}
			}
			runningJobsCnt--;
			Dontprint.notifyJobDone(job);

			if (job.naclListenerDiv) {
				job.naclListenerDiv.parentNode.removeChild(job.naclListenerDiv);
				delete job.naclListenerDiv;
				// Event listeners are freed automatically
			}

			PlatformTools.rmTmpFiles(job.tmpFiles);
		}
	}


	function runJob(job) {
		job.id = Date.now();
		while (job.id in runningJobs) {
			job.id++;
		}
		runningJobs[job.id] = job;
		if (job.pageurl) {
			queuedUrls[job.pageurl.split("#")[0]] = job.id;
		}
		if (PlatformTools.platform === "chrome" && typeof job.tabId !== "undefined") {
			Zotero.Connector_Browser.dontprintRegisterJobId(job);
		}
		runningJobsCnt++;
		
		job.downloadProgress = 0;
		job.convertProgress = 0;
		job.uploadProgress = 0;
		job.tmpFiles = [];
		updateJobState(job, "queued");

		Dontprint.notifyJobStarted(job);

		PlatformTools.spawn(function*() {
			try {
				job.transferMethod = (yield PlatformTools.getPrefs({
					transferMethod: ""
				})).transferMethod;

				if (job.popupConnector) {
					job.popupConnector(job);
					delete job.popupConnector;
				}

				if (job.jobType !== "test") {
					var k2pdfopt = Dontprint.loadK2pdfopt(job);
				}

				if (job.jobType === "page") {
					yield runZoteroTranslator(job);
					yield Dontprint.postTranslate(job);
				}

				if (job.pdfurl) {
					job.origPdfFile = yield downloadPdfUrl(job);
					job.tmpFiles.push(job.origPdfFile);
				}

				let preferredFinalFilename = job.title.replace(/[^a-zA-Z0-9 \-,]+/g, "_");
				if (job.articleCreators && job.articleCreators.length !== 0 && job.articleCreators[0].lastName) {
					preferredFinalFilename = job.articleCreators[0].lastName.replace(/[^a-zA-Z0-9 \-,]+/g, "_") + ", " + preferredFinalFilename;
				}
				preferredFinalFilename = preferredFinalFilename.substr(0, 70) + ".pdf";

				if (job.jobType === "test") {
					job.finalFile = job.origPdfFile;
				} else {
					yield cropMargins(job);
					yield convertDocument(job, k2pdfopt, preferredFinalFilename);
				}

				if (job.transferMethod === "email") {
					yield sendEmail(job, preferredFinalFilename);
				} else {
					updateJobState(job, "moving");
					yield Dontprint.moveFileToDestDir(job, preferredFinalFilename);

					if (typeof Dontprint.callPostTransferCommand === "function") {
						// Just initiate the post transfer command, don't wait for it to
						// finish (it might be a long-running task and we don't get any
						// progress information from it).
						try {
							Dontprint.callPostTransferCommand(job);
						} catch (e) {
							// ignore
						}
					}
				}

				PlatformTools.debug("Dontprint job result:");
				PlatformTools.debug(job.result);
			} catch (e) {
				PlatformTools.debug("Dontprint encountered an error:");
				PlatformTools.debug(e);
				job.result = {
					success: false,
					message: e.toString()
				};
				if (e instanceof HtmlErrorMessage) {
					job.result.messageIsTrustedHtml = true;
				}
			} finally {
				try {
					if (job.state === "canceled" || (!job.result.success && job.result.message === "canceled")) {
						try {
							updateJobState(job, "canceled");
						} catch (e) {
							// job.state is already "canceled". That's OK.
						}
					} else {
						yield displayResult(job);
					}
	// 				if (job.jobType === 'test') {  TODO
	// 					job.callback(job.resultTab);
	// 				}
				} finally {
					cleanupJob(job);
				}
			}
		});
	}


	function HtmlErrorMessage(message) {
		this.toString = function() {
			return message;
		};
	}


	function* runZoteroTranslator(job) {
		updateJobState(job, "translating");

		let translatorPromise = new Promise(function(resolve, reject) {
			job.translatorSuccess = resolve;
			job.translatorFail = reject;
		});

		// TODO: Set a timeout and cancel translation attempt if it
		// doesn't seem to work.
		// TODO: Set job.abortCurrentTask
		try {
			if (PlatformTools.platform === "firefox") {
				let translate = new Dontprint.Zotero.Translate.Dontprint();
				translate.clearHandlers("done");
				translate.clearHandlers("itemDone");
				translate.setDocument(job.translateDocument);
				translate.setTranslator(job.translator);
				delete job.translator;
				
				var metaDataPromise = new Promise(
					function(resolve, reject) {
						translate.dontprintSetDoneHandler(resolve);
					}
				);
				
				translate.setHandler("error", function(obj, error) {
					job.translatorFail("Unable to download article. Try to download the PDF manually, then go back to the article's abstract and click the Dontprint icon again. Original error message: " + error.toString());
					Dontprint.platformTools.debug(error);
				});
				
				translate.dontprintSetErrorHandler(job.translatorFail);

				//TODO: test what happens when user clicks "save to zotero" shortly after clicking "dontprint" (or vice versa)
				translate.translate(null);

				job.abortCurrentTask = job.translatorFail.bind(undefined, "canceled");

				let item = yield metaDataPromise;
				zoteroTranslatorDone(job.id, item);
			} else {
				Zotero.Connector_Browser.dontprintRunZoteroTranslator(job);
			}

			yield translatorPromise;
		} finally {
			delete job.abortCurrentTask;
			delete job.translatorSuccess;
			delete job.translatorFail;
			delete job.translatorFunction;
		}
	}
	
	
	function zoteroTranslatorDone(jobId, item) {
		let job = runningJobs[jobId];
		job.title = checkUndefined(item.title, "Untitled document");
		job.articleCreators = item.creators;
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


	function* downloadPdfUrl(job) {
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

		try {
			var file = yield PlatformTools.downloadTmpFile(
				job.pdfurl,
				"original" + job.id + ".pdf",
				function(progress) {
					job.downloadProgress = progress;
					updateJobState(job);
				}
			);
		} catch (e) {
			if (typeof e === "number") {
				throw "Unable to download article. Maybe it is behind a captcha. (Try to download the PDF manually, then go back to the article's abstract and click the Dontprint icon again.)";
			} else {throw e;
				throw "Error downloading PDF file. Are you connected to the internet? Original error message: " + e.toString();
			}
		}

		return file;
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
		
		let bestFilter = yield journaldb.transaction(function*(sql) {
			job.dates = parseDateString(job.articleDate);
			try {
				if (job.journalLongname) {
					var longnameresult = (yield sql(
						"SELECT * FROM journals WHERE longname=? AND (minDate=0 OR minDate<=?) AND (maxDate=0 OR maxDate>=?) ORDER BY priority DESC, lastModified DESC LIMIT 1",
						[job.journalLongname, job.dates.small, job.dates.large]
					)).rows;
				}
				if (job.journalShortname) {
					var shortnameresult = (yield sql(
						"SELECT * FROM journals WHERE shortname=? AND (minDate=0 OR minDate<=?) AND (maxDate=0 OR maxDate>=?) ORDER BY priority DESC, lastModified DESC LIMIT 1",
						[job.journalShortname, job.dates.small, job.dates.large]
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
				let spriority = parseFloat(shortnameresult[0].getResultByName("priority")) + 0x200;
				let lpriority = parseFloat(longnameresult[0].getResultByName("priority")) + 0x1000;
				return spriority > lpriority ? shortnameresult[0] : longnameresult[0];
			}
		}, true);

		job.crop = {
			id:0, enabled:false,
			minDate:0, maxDate:0,
			m1:5, m2:5, m3:5, m4:5,
			coverpage:false, k2pdfoptParams: "", scale: "1",
			longname: "", shortname: ""
		}

		if (bestFilter) {
			for (let key in job.crop) {
				job.crop[key] = bestFilter.getResultByName(key);
			}
			job.crop.rememberPreset = false;  // if crop window needs to be shown, then by default don't remember settings
		} else {
			job.crop.rememberPreset = true;  // By default, remember settings (don't set this in the default object above, because if bestFilter exists, we don't want to apply "getResultByName" on this key)
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
			job.neverReportJournalSettings = (yield PlatformTools.getPrefs({
				neverReportJournalSettings: false
			})).neverReportJournalSettings;

			let cropTab = null;
			let cropPromise = new Promise(function(resolve, reject) {
				job.acceptCropPage = resolve;
				job.abortCurrentTask = reject.bind(this, "canceled");
			});

			try {
				cropTab = yield PlatformTools.openTab({
					url: PlatformTools.extensionScriptUrl("common/pdfcrop/pdfcrop.html#" + job.id),
					openerTab: job.tabId
				});
				job.crop = yield cropPromise;
			} finally {
				delete job.acceptCropPage;
				delete job.abortCurrentTask;
				try {
					PlatformTools.closeTab(cropTab);
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
			return journaldb.transaction(run);
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
		return journaldb.transaction(function*(sql) {
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
			if (insertresult && !(crop.id >= 0)) {
				if (typeof insertresult.insertId === "undefined") {
					// insertId is only set by Chrome. For Firefox, we use the
					// following ugly heuristic.
					// NOTE: using conn.lastInsertRowID doesn't work. It returns undefined.
					let sqlresult = yield sql("SELECT id FROM journals ORDER BY id DESC LIMIT 1");
					insertresult.insertId = sqlresult.rows[0].getResultByName("id");
				}
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
		var req = PlatformTools.xhr();
		req.open("GET", url, true);
		req.send();
		// Don't set onload handler because we don't really care about the response
	}
	
	
	function getHostFromUrl(url) {
		var m = url.match(/^([^#/?:]+:[^#/?:]*\/+)?([^#/?]+\.[^#/?]+)([#/?].*)?$/);
		return m ? m[2] : "unknown";
	}
	
	
	function* convertDocument(job, k2pdfopt, preferredFinalFilename) {
		updateJobState(job, "converting");

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
			"-p", job.crop.pagerange ? job.crop.pagerange : (job.crop.coverpage ? "2-" : "1-")
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
		
		yield k2pdfopt(args, preferredFinalFilename, function(progress) {
			job.convertProgress = progress;
			updateJobState(job);
		});
	}


	function* sendEmail(job, preferredFinalFilename) {
		updateJobState(job, "sending");
		
		job.recipientEmail = yield getRecipientEmail();
		job.emailedFilename = preferredFinalFilename;
		var url = buildURL(
			"http://dontprint.net/cgi-bin/send-document.pl",
			{
				filename:	preferredFinalFilename,
				email:		job.recipientEmail,
				itemKey:	job.id
			}
		);
		
		try {
			yield new Promise(function(resolve, reject) {
				let req = PlatformTools.xhr();
				req.responseType = "json";
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
						job.result = req.response;
						if (job.result.success) {
							resolve(job.result);
						} else if (job.result.errno === 1) {
							reject(new HtmlErrorMessage('The e-mail address you set in the preferences is invalid. Please go to the <a href="#" data-rpc="openSettings">Dontprint preferences</a> and make sure that the you set the correct e-mail address.'));
						} else if (job.result.errno === 3) {
							PlatformTools.getPrefs({
								verifiedEmails: []
							}).then(function(prefs) {
								return PlatformTools.setPrefs({
									verifiedEmails: prefs.verifiedEmails.filter(function(x) {
										return x !== job.recipientEmail.toLowerCase();
									})
								});
							}).then(function() {
								reject(new HtmlErrorMessage('The e-mail address of your e-reader is not verified yet. Please go to the <a href="#" data-rpc="openSettings">Dontprint preferences</a>, make sure that the you set the correct e-mail address and then click the button labeled "Send verification code now".'));
							});
						} else {
							reject(job.result.message);
						}
					} catch (e) {
						reject("Error sending e-mail: " + e.toString());
					}
				};
				req.onerror = function(e) {
					reject("Error sending e-mail: " + e.toString());
				};
				req.onabort = function() {
					reject("canceled");
				};

				job.abortCurrentTask = req.abort.bind(req); //TODO: test

				PlatformTools.postFile(req, job.finalFile, url).catch(reject);
			});
		} finally {
			delete job.abortCurrentTask;
		}
	}


	function* displayResult(job) {
		job.result.errorOperation = job.state;
		updateJobState(job, job.result.success ? "success" : "error");
		let prefs = yield PlatformTools.getPrefs({
			successPageInBackground: false
		});

		// Include all valid information in job.result (this is necessary because
		// on Firefox, we cannot communicate the whole job object to the page as
		// it contains cyclic references)
		["articleCreators", "articleIssue", "articlePages", "articleVolume", "dates", "doi", "emailedFilename", "id", "jobType", "journalLongname", "journalShortname", "pageurl", "recipientEmail", "state", "title"].forEach(function(key) {
			job.result[key] = job[key];
		});
		
		job.resultTab = yield PlatformTools.openTab({
			url: "http://dontprint.net/resultpage2/" + (job.result.success ? job.transferMethod : "error") + ".html#" + (prefs.successPageInBackground ? "1," : "0,") + job.id,
			openerTab: job.tabId,
			inBackground: prefs.successPageInBackground && job.result.success
		});

		yield new Promise(function(res, rej) {
			job.resultPageCallback = res;
		});
	}


	function connectToResultPage(jobId) {
		let job = runningJobs[jobId];
		if (job && job.resultPageCallback) {
			job.resultPageCallback();
			return job.result;
		}
	}


	function resultPageClosed(jobId) {
		// Create a new fake job object, since the original one is already cleaned up
		updateJobState({id: jobId}, "closed");
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

			progressListeners.forEach(function(listener) {
				try {
					listener(job);
				} catch (e) {
					// apparently, progressTab has been closed without unregistering the listener
					progressListeners.delete(listener);
				}
			});
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
});
