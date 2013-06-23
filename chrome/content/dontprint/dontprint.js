Dontprint = (function() {
	var databasePath = null;
	var googleOauthService = null;
	var dontprintThisPageImg = null;
	var dontprintProgressImg = null;
	var dontprintFromZoteroBtn = null;
	var queuedUrls = [];
	var prefs_ = null;
	
	var defaultCropParams = {
		builtin:false, remember:true, coverpage:false, m1:0.52, m2:0.2, m3:0.2, m4:0.2
	};

	var init = function () {
		Components.utils.import("resource://gre/modules/FileUtils.jsm");
		Components.utils.import("resource://gre/modules/Sqlite.jsm")
		Components.utils.import("resource://gre/modules/Task.jsm");
		
		dontprintThisPageImg   = document.getElementById("dontprint-status-image");
		dontprintFromZoteroBtn = document.getElementById("dontprint-tbbtn");
		dontprintProgressImg   = document.getElementById("dontprint-progress-image");
		
		prefs_ = Components.classes["@mozilla.org/preferences-service;1"]
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
						"longname  TEXT UNIQUE ON CONFLICT REPLACE COLLATE NOCASE," +
						"shortname TEXT UNIQUE ON CONFLICT REPLACE COLLATE NOCASE," +
						"builtin INT," +
						"remember INT," +
						"coverpage INT," +
						"m1 TEXT," +				// for some reason, using FLOAT here dosn't work
						"m2 TEXT," +
						"m3 TEXT," +
						"m4 TEXT" +
					")");
				}
				
				exists = yield conn.tableExists("oauth");
				if (!exists) {
					yield conn.execute("CREATE TABLE oauth (" +
						"service TEXT UNIQUE ON CONFLICT REPLACE," +
						"data TEXT" +
					")");
				}
			} finally {
				yield conn.close();
			}
		});
		
		var that = this;
		googleOauthService = new this.OauthService(
			"google",										// internally used service name
			"https://accounts.google.com/o/oauth2/auth",	// URL to authorize app
			"87904320419-ln2m751m5ddpuh4801tjbv1c2k6b1q8d.apps.googleusercontent.com", // client ID
			"BXBhZwni65Sl1V8jHhtSCMHh",						// client secret
			"urn:ietf:wg:oauth:2.0:oob",					// redirect URI
			"https://www.googleapis.com/auth/drive.file",	// scope
			"https://accounts.google.com/o/oauth2/token",	// URL to exchange token
			function(service, callback) {					// function to read state from data base
				readOauthData.call(that, service, callback);
			},
			function(service, data) {						// function to write state to data base
				writeOauthData.call(that, service, data);
			},
			function(service, url, callback) {				// function to open an authorization page
				showAuthPage.call(that, service, url, callback);
			}
		);
		
		// Inject some own code into Zotero's updateStatus() function. This function
		// is called to show or hide the "scrape this"-icon in the address bar.
		// We first call the original Zotero implemntation and then add our own icon.
		var oldUpdateStatus = Zotero_Browser.updateStatus;
		
		Zotero_Browser.updateStatus = function() {
			oldUpdateStatus.apply(Zotero_Browser, arguments);
			updateDontprintIconVisibility();
		};
	};
	
	var prefs = function() {
		return prefs_;
	};
	
	var getK2pdfopt = function() {
		var path = prefs().getCharPref("k2pdfoptpath");
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
	};
	
	var updateDontprintIconVisibility = function() {
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
	};
	
	/*
	 * Gets a data object given a browser window object
	 */
	var _getTabObject = function(browser) {
		if(!browser) return false;
		if(!browser.zoteroBrowserData) {
			browser.zoteroBrowserData = new Zotero_Browser.Tab(browser);
		}
		return browser.zoteroBrowserData;
	};
	
	/**
	 * Called when the user right-clicks the dontprint-icon in the address bar.
	 * Show a list of available translators to dontprint the document represented
	 * by the current page.
	 */
	var onStatusPopupShowing = function(e) {
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
	};
	
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
	var dontprintThisPage = function(translator) {
		// Perform translation
		var tab = _getTabObject(Zotero_Browser.tabbrowser.selectedBrowser);
		if (!tab || !tab.page.translators || !tab.page.translators.length) {
			alert("error: no translators available");
			return false;
		}
		
		// show progress indicator
		var pageurl = tab.page.document.location.href;
		incrementQueueLength(+1, pageurl);
		
		var pdfFile = FileUtils.getFile("TmpD", ["dontprint-original.pdf"]);
		pdfFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
		
		var translate = new Zotero.Translate.Dontprint();
		translate.setDocument(tab.page.translate.document);
		translate.setDestFile(pdfFile);
		translate.setTranslator(translator || tab.page.translators[0]);
		translate.clearHandlers("done");
		translate.clearHandlers("itemDone");
		
		// Call dontprintPdf(pdfData) as soon as both the "itemDone" handler was fired and
		// the "attachDone" handler was fired, independently of which one happens first.
		// But make sure to call dontprintPdf(pdfData) no more than once
		var pdfData = null;
		var attachDone = false;
		var dontprintStarted = false;
		
		translate.setHandler("itemDone", function(obj, dbItem, item) {
			// Apparently, this is called when the item meta data is ready but attachments may still be being downloaded
			pdfData = {
				key: checkUndefined(item.id, "noid"),
				title: checkUndefined(item.title, "Untitled document"),
				journalLongname : checkUndefined(item.publicationTitle),
				journalShortname : checkUndefined(item.journalAbbreviation),
				attachments: [pdfFile.path],
				deleteFileWhenDone: true,
				pageurl: pageurl
			};
			if (attachDone && !dontprintStarted) {
				dontprintStarted = true;
				Dontprint.dontprintPdf(pdfData);
			}
		});
		
		translate.setAttachDoneHandler(function() {
			attachDone = true;
			if (pdfData !== null && !dontprintStarted) {
				dontprintStarted = true;
				Dontprint.dontprintPdf(pdfData);
			}
		});
		
		//TODO: test what happens when user clicks "save to zotero" shortly after clicking "dontprint" (or vice versa)
		translate.translate(null);
	};
	
	/**
	 * return value if value isn't undefined; otherwise, return defaultTo or empty string
	 */
	var checkUndefined = function(value, defaultTo) {
		return value === undefined ? (defaultTo === undefined ? '' : defaultTo) : value;
	};

	var showAuthPage = function(service, url, callback) {
		var gBrowser = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator)
			.getMostRecentWindow("navigator:browser").gBrowser;
		var newTabBrowser = gBrowser.getBrowserForTab(
			gBrowser.loadOneTab(url, {inBackground:false})
		);
		
		var that = this;
		newTabBrowser.addEventListener("load", function () {
			receiveAuthorizationCode.call(that, newTabBrowser.contentWindow, callback);
		}, true);
	};
	
	var readOauthData = function(service, callback) {
		Task.spawn(function readFromDb() {
			var ret = null;
			try {
				var conn = yield Sqlite.openConnection({path: databasePath});
				var sqlresult = yield conn.executeCached("SELECT data FROM oauth WHERE service = ?", [service]);
				ret = sqlresult.length === 0 ? null : sqlresult[0].getResultByName("data");
			} finally {
				yield conn.close();
			}
			throw new Task.Result(ret);
		}).then(function (ret) {
			callback(ret);
		});
	};

	var writeOauthData = function(service, data) {
		Task.spawn(function readFromDb() {
			try {
				var conn = yield Sqlite.openConnection({path: databasePath});
				var sqlresult = yield conn.executeCached("INSERT INTO oauth VALUES (?, ?)", [service, data]);
			} finally {
				yield conn.close();
			}
		});
	};
	
	var receiveAuthorizationCode = function(cwin, callback) {
		var found = /^Success state=([^&]+)&code=(\S+)$/.exec(cwin.document.title);
		if (found) {
			cwin.close();
			callback(found[2]);
		}
	};
	
	var doFileUpload = function(that, documentData, filepath, accessToken, onSuccess, onFail, onAuthFail) { return function() {
	try {
		if (this.responseText !== "" && JSON.parse(this.responseText).error !== undefined) {
			alert("File Upload failed. The server returned the following error message:\n" + JSON.parse(this.responseText).error.message)
			onAuthFail();
			return;
		}
		
		onSuccess();
		var location = this.getResponseHeader("Location");
		
		var file = Components.classes["@mozilla.org/file/local;1"]
					.createInstance(Components.interfaces.nsILocalFile);
		file.initWithPath(filepath);
		if (!file.exists()) {
			alert("Error: " + filepath + " does not exist");
		}
		var filesize = file.fileSize;
		
		// Make a stream from a file.
		var stream = Components.classes["@mozilla.org/network/file-input-stream;1"]
					.createInstance(Components.interfaces.nsIFileInputStream);
		stream.init(file, 0x04 | 0x08, 0644, 0x04); // file is an nsIFile instance  
		
		// Send   
		var req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
							.createInstance(Components.interfaces.nsIXMLHttpRequest);
		
		req.onload = function () {
			var fileId = JSON.parse(req.responseText).id;
			var url = googleOauthService.buildURL(
				"chrome://dontprint/content/sendmail.html",
				{fileId: fileId}
			);
			var queueLengthDecremented = false;
			
			// Open tab in background
			var gBrowser = Components.classes["@mozilla.org/appshell/window-mediator;1"]
				.getService(Components.interfaces.nsIWindowMediator)
				.getMostRecentWindow("navigator:browser").gBrowser;
			var tab = gBrowser.loadOneTab(url, {inBackground:true});
			var newTabBrowser = gBrowser.getBrowserForTab(tab);
			var win = newTabBrowser.contentWindow;
			
			// set onload-handler for new tab. This cannot be done in Google Apps Script because we need the rights to close the tab.
			var onloadFunction = function () {
				if (win.location.href.match(/^https\:\/\/accounts\.google\.com\//) || win.document.title.match(/Authorization needed/)) {
					// The user either needs to authorize dontprint or authenticate himself. In either case, bring tab to front.
					if (!queueLengthDecremented) {
						incrementQueueLength(-1, documentData.pageurl);
						queueLengthDecremented = true;
					}
					gBrowser.selectedTab = tab;
				} else if (win.document.title.match(/ \(Dontprint plugin for Zotero\)$/)) {
					if (!queueLengthDecremented) {
						incrementQueueLength(-1, documentData.pageurl);
						queueLengthDecremented = true;
					}
					
					var favicon = win.document.createElement('link');
					favicon.type = 'image/x-icon';
					favicon.rel = 'shortcut icon';
					favicon.href = 'http://robamler.github.io/dontprint/webapp/favicon.png';
					win.document.getElementsByTagName('head')[0].appendChild(favicon);
					
					if (win.document.title.match(/^Success\: /)) {
						newTabBrowser.removeEventListener("load", onloadFunction, true);
						var timeout = 60;
						var timer = setInterval(function() {
							if (
								win.frames.length === 1 &&
								win.frames[0].document.getElementsByTagName("span").length === 1
							) {
								if (timeout === 0) {
									clearInterval(timer);
									win.close();
								}
								win.frames[0].document.getElementsByTagName("span")[0].textContent = timeout;
								timeout -= 5;
							}
						}, 5000);
					}
					
					if (!prefs().getBoolPref("copyInGoogleDrive")) {
						// delete file on Google Drive for good (upload only places file in trash)
						var delreq = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
											.createInstance(Components.interfaces.nsIXMLHttpRequest);
						delreq.open('DELETE', 'https://www.googleapis.com/drive/v2/files/' + encodeURIComponent(fileId));
						delreq.setRequestHeader("Authorization", "OAuth " + accessToken);
						delreq.send();
						// Don't care about response. If delete fails then so be it.
					}
				}
			};
			newTabBrowser.addEventListener("load", onloadFunction, true);
			
			file.remove(false);
		};
		
		req.open('PUT', location, true);
		req.setRequestHeader('Content-Type', "application/pdf");
		req.setRequestHeader("Authorization", "OAuth " + accessToken);
// 		alert("sending");
		req.send(stream);
	} catch (e) {
		alert("Error: " + e.toString());
	}
	};};
	
	var lengthInUtf8Bytes = function(str) {
		// Matches only the 10.. bytes that are non-initial characters in a multi-byte sequence.
		var m = encodeURIComponent(str).match(/%[89ABab]/g);
		return str.length + (m ? m.length : 0);
	};
	
	var uploadFileToGoogleDrive = function(documentData, filepath, accessToken, onSuccess, onFail, onAuthFail) { try {
		// TODO: create preferences frontend to set:
		// * extensions.dontprint.recipientEmailPrefix
		// * extensions.dontprint.recipientEmailfix
		// * extensions.dontprint.ccEmails
		// * extensions.dontprint.copyInGoogleDrive
		
// 		alert("uploading");
		var metadata = {
			title: 					documentData.title.replace(/[^a-zA-Z0-9 .\-_,]+/g, "_") + ".pdf",
			labels: {
				trashed: 			!prefs().getBoolPref("copyInGoogleDrive")
			},
			description: JSON.stringify({
				recipientEmail:		prefs().getCharPref("recipientEmailPrefix") + prefs().getCharPref("recipientEmailSuffix"),
				ccEmails:			prefs().getCharPref("ccEmails"),
				itemKey:			documentData.key
			})
		};
		
// 		alert("token: " + accessToken);
		
		var file = Components.classes["@mozilla.org/file/local;1"]
					.createInstance(Components.interfaces.nsILocalFile);
		file.initWithPath(filepath);
		if (!file.exists()) {
			alert("Error: " + filepath + " does not exist");
		}
		var filesize = file.fileSize;
// 		alert("size: " + filesize);
		
		var req = new XMLHttpRequest();
		req.onload = doFileUpload(this, documentData, filepath, accessToken, onSuccess, onFail, onAuthFail);
		req.open("post", "https://www.googleapis.com/upload/drive/v2/files?uploadType=resumable", true);
		req.setRequestHeader("Authorization", "OAuth " + accessToken);
		req.setRequestHeader("Content-Length", lengthInUtf8Bytes(metadata));
		req.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
		req.setRequestHeader("X-Upload-Content-Type", "application/pdf");
		req.setRequestHeader("X-Upload-Content-Length", filesize);
		req.send(JSON.stringify(metadata));
	} catch (e) {
		alert("err: " + e.toString());
	}
	};
	
	var incrementQueueLength = (function() {
		// local variables
		var queuelength = 0;
		var timer = null;
		var state = 0;
		
		// the actual function "incrementQueueLength()"
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
	
	var startConversion = function(documentData, attachmentIndex, settings) {
		// TODO: create preferences frontend to set:
		// * extensions.dontprint.k2pdfoptpath
		
		try {
			var exec = getK2pdfopt();
			if (!exec.exists()) {
				throw (exec.path + " does not exist");
			}
			
			var proc = Components.classes["@mozilla.org/process/util;1"]
							.createInstance(Components.interfaces.nsIProcess);
			proc.init(exec);
			
			var outFile = FileUtils.getFile("TmpD", ["dontprint-converted.pdf"]);
			outFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
			var outputpath = outFile.path;
			
			var args = [
				'-ui-', '-x', '-w', '557', '-h', '721',
				'-ml', settings.m1,
				'-mt', settings.m2,
				'-mr', settings.m3,
				'-mb', settings.m4,
				'-p', settings.coverpage ? '2-' : '1-',
				documentData.attachments[attachmentIndex],
				'-o', outputpath
			];
			
			var that = this;
			proc.runwAsync(args, args.length, {
				observe: function(subject, topic, data) {
					googleOauthService.apicall(
						function(accessToken, onSuccess, onFail, onAuthFail) {
							uploadFileToGoogleDrive.call(
								that,
								documentData,
								outputpath,
								accessToken,
								onSuccess,
								onFail,
								onAuthFail
							);
						}
					);
					
					if (documentData.deleteFileWhenDone) {
						var origFile = Components.classes["@mozilla.org/file/local;1"]
										.createInstance(Components.interfaces.nsILocalFile);
						origFile.initWithPath(documentData.attachments[attachmentIndex]);
						if (origFile.exists()) {
							origFile.remove(false);
						}
					}
				}
			});
		}
		catch (e) {
			alert('Dontprint: faild to launch k2pdfopt: ' + e.toString());
		}
	};
	
	var pdfcropSuccessCallback = function(documentData, attachmentIndex, settings) {
		if (!settings.builtin) {
			Task.spawn(function storeInDb() {
				try {
					var conn = yield Sqlite.openConnection({path: databasePath});
					yield conn.executeCached("INSERT INTO journals VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)", [
						documentData.journalLongname,
						documentData.journalShortname,
						settings.remember ? 1 : 0,
						settings.coverpage ? 1 : 0,
						""+settings.m1,		// explicitly cast margins to strings
						""+settings.m2,		// (don't know why this is necessary
						""+settings.m3,		// but, whithout this, sqlite would
						""+settings.m4		// only store the integer part)
					]);
				} finally {
					yield conn.close();
				}
			});
		}
		
		startConversion(documentData, attachmentIndex, settings);
	};
	
	var pdfcropFailCallback = function(documentData, attachmentIndex) {
		incrementQueueLength(-1, documentData.pageurl);
		if (documentData.deleteFileWhenDone) {
			var origFile = Components.classes["@mozilla.org/file/local;1"]
							.createInstance(Components.interfaces.nsILocalFile);
			origFile.initWithPath(documentData.attachments[attachmentIndex]);
			if (origFile.exists()) {
				origFile.remove(false);
			}
		}
	};
	
	/**
	 * Called when the user cilcks the dontprint button in the Zotero pane.
	 */
	var dontprintSelectionInZotero = function() {
		var selectedItems = ZoteroPane.getSelectedItems();
		
		// delete duplicates (e.g., if user selects both an attachment and its parent)
		var entryIds = selectedItems.map(function(i) {
			return i.getSource() || i.id;
		});
		var uniqueEntryIds = entryIds.filter(function(elem, pos, self) {
			return self.indexOf(elem) == pos;
		})
		
		// generate list of all meta data
		var docData = uniqueEntryIds.map(function(id) {
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
				'key': i.getField('key'),
				'title': i.getField('title'),
				'journalLongname' : i.getField('publicationTitle'),
				'journalShortname' : i.getField('journalAbbreviation'),
				'attachments': attachmentPaths
			};
		});
		
		// remove entries without attached PDF files
		var noattach = docData.filter(function(elem) {
			return elem.attachments.length == 0;
		});
		if (noattach.length) {
			alert("The following selected items cannot be sent to your e-reader because they do not have an attached PDF file:\n\n" +
				noattach.map(function(elem) { return elem.title; }).join("\n"));
		}
		
		docData = docData.filter(function(elem) {
			return elem.attachments.length != 0;
		});
		if (docData.length == 0) {
			alert("No documents sent to your e-reader. Select an item with an attached PDF file and try again.");
			return;
		}
		
		var that = this;
		docData.forEach(function(i) {
			incrementQueueLength(+1);
			dontprintPdf.call(that, i);
		});
	};
	
	var dontprintPdf = function(pdfData) {
		Task.spawn(function storeInDb() {
			try {
				var conn = yield Sqlite.openConnection({path: databasePath});
				var sqlparams = [pdfData.journalLongname, pdfData.journalShortname];
				var sqlresult = yield conn.executeCached("SELECT * FROM journals WHERE (longname = ? AND longname != '') OR (shortname = ? AND shortname != '')", sqlparams);
			} finally {
				yield conn.close();
			}
			throw new Task.Result(sqlresult);
		}).then(function (sqlresult) {
			var cropParams;
			if (sqlresult.length === 0) {
				cropParams = defaultCropParams;
			} else {
				cropParams = {};
				["longname", "shortname", "builtin", "remember", "coverpage", "m1", "m2", "m3", "m4"].forEach(
					function(key) {
						cropParams[key] = sqlresult[0].getResultByName(key);
					}
				);
			}
			
			if (sqlresult.length !== 0 && cropParams.remember) {
				startConversion(pdfData, 0, cropParams);
			} else {
				var gBrowser = Components.classes["@mozilla.org/appshell/window-mediator;1"]
					.getService(Components.interfaces.nsIWindowMediator)
					.getMostRecentWindow("navigator:browser").gBrowser;
				var newTabBrowser = gBrowser.getBrowserForTab(
					gBrowser.loadOneTab("chrome://dontprint/content/pdfcrop/pdfcrop.html", {inBackground:false})
				);
				
				newTabBrowser.addEventListener("load", function () {
					newTabBrowser.contentWindow.PDFCrop.init(pdfData, 0, cropParams, pdfcropSuccessCallback, pdfcropFailCallback);
				}, true);
				//TODO: this doesn't seem to call init if page has already been loaded by that time
				//TODO: don't forget to remove event listener (avoid memory leak)
			}
		});
	};
	
	var showProgress = function() {
		//TODO
	};
	
	return {
		init: init,
		dontprintSelectionInZotero: dontprintSelectionInZotero,
		onStatusPopupShowing: onStatusPopupShowing,
		dontprintThisPage: dontprintThisPage,
		dontprintPdf: dontprintPdf,
		showProgress: showProgress,
		prefs: prefs
	};
}());

// Initialize the utility
window.addEventListener('load', function(e) { Dontprint.init(); }, false);
