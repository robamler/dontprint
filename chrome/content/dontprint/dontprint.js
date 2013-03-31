Zotero.Dontprint = (function() {
	var DB = null;
	var googleOauthService = null;

	var defaultCropParams = {
		builtin:false, remember:true, coverpage:false, m1:0.25, m2:0.25, m3:0.25, m4:0.25
	};

	var init = function () {
		// Connect to (and create, if necessary) dontprint.sqlite in the Zotero directory
		this.DB = new Zotero.DBConnection('dontprint');
		
		if (!this.DB.tableExists('journals')) {
			this.DB.query("CREATE TABLE journals (" +
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
		
		if (!this.DB.tableExists('oauth')) {
			this.DB.query("CREATE TABLE oauth (" +
				"service TEXT UNIQUE ON CONFLICT REPLACE," +
				"access_token TEXT, expiration_date TEXT, refresh_token TEXT" +
			")");
		}
		
		var that = this;
		googleOauthService = new this.OauthService(
			"google",									// internally used service name
			"https://accounts.google.com/o/oauth2/auth",	// URL to authorize app
			"233418378471.apps.googleusercontent.com",	// client ID
			"Tc9B-5BfkUe6Y-YbBaXITe5_",					// client secret
			"urn:ietf:wg:oauth:2.0:oob",					// redirect URI
			"https://www.googleapis.com/auth/drive.file",	// scope
			"https://accounts.google.com/o/oauth2/token",	// URL to exchange token
			this.DB,
			function(url, callback) {
				showAuthPage.call(that, url, callback);
			}
		);
	};
	
	var showAuthPage = function(url, callback) {
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
	
	var receiveAuthorizationCode = function(cwin, callback) {
		var found = /^Success state=([^&]+)&code=(\S+)$/.exec(cwin.document.title);
		if (found) {
// 			alert("received: " + found[2]);
			cwin.close();
			callback(found[2]);
		}
	};
	
	var doFileUpload = function(that, filepath, accessToken, onSuccess, onFail, onAuthFail) { return function() {
	try {
// 		alert("dofileupload: " + this.responseText + "\n" + this.getAllResponseHeaders());
		if (this.responseText !== "" && JSON.parse(this.responseText).error !== undefined) {
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
// 			alert("async done:" + req.responseText);
			var id = JSON.parse(req.responseText).id;
// 			alert("id: " + id);
			
			// Note: This is a small security issue: anyone who can redirect the user
			// to this site and knows the id of a file in the users drive can send
			// that file to the users kindle. Not sure if that's really a problem.
			
			var dataString = "fileId=" + encodeURIComponent(id);
			
			// POST method requests must wrap the encoded text in a MIME stream
			var stringStream = Components.classes["@mozilla.org/io/string-input-stream;1"]
				.createInstance(Components.interfaces.nsIStringInputStream);
			if ("data" in stringStream) // Gecko 1.9 or newer
				stringStream.data = dataString;
			else // 1.8 or older
				stringStream.setData(dataString, dataString.length);
			
			var postData = Components.classes["@mozilla.org/network/mime-input-stream;1"]
				.createInstance(Components.interfaces.nsIMIMEInputStream);
			postData.addHeader("Content-Type", "application/x-www-form-urlencoded");
			postData.addContentLength = true;
			postData.setData(stringStream);

			// Open tab with post data
			var gBrowser = Components.classes["@mozilla.org/appshell/window-mediator;1"]
				.getService(Components.interfaces.nsIWindowMediator)
				.getMostRecentWindow("navigator:browser").gBrowser;
			gBrowser.loadOneTab(
				"https://script.google.com/macros/s/AKfycbzS9ZRuiITZnQPIgLdJHlXWts6AGvlKuT-sU1l3K5E5cl38On2p/exec",
				{inBackground:false, postData:postData}
			);
			
			incrementQueueLength(-1);
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
	
	var uploadFileToGoogleDrive = function(filepath, filename, itemKey, accessToken, onSuccess, onFail, onAuthFail) { try {
		// TODO: create preferences frontend to set:
		// * extensions.zotero.dontprint.recipientEmail
		// * extensions.zotero.dontprint.copyToMe
		// * extensions.zotero.dontprint.copyInGoogleDrive
		
// 		alert("uploading");
		filename = filename.replace(/[^a-zA-Z0-9 .\-_,]+/g, "_") + ".pdf";
		var metadata = JSON.stringify({
			title: filename,
			description: JSON.stringify({
				recipientEmail:		Zotero.Prefs.get("dontprint.recipientEmail"),
				copyToMe:			Zotero.Prefs.get("dontprint.copyToMe"),
				copyInGoogleDrive:	Zotero.Prefs.get("dontprint.copyInGoogleDrive"),
				itemKey:				itemKey
			})
		});
		
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
		req.onload = doFileUpload(this, filepath, accessToken, onSuccess, onFail, onAuthFail);
		req.open("post", "https://www.googleapis.com/upload/drive/v2/files?uploadType=resumable", true);
		req.setRequestHeader("Authorization", "OAuth " + accessToken);
		req.setRequestHeader("Content-Length", lengthInUtf8Bytes(metadata));
		req.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
		req.setRequestHeader("X-Upload-Content-Type", "application/pdf");
		req.setRequestHeader("X-Upload-Content-Length", filesize);
		req.send(metadata);
	} catch (e) {
		alert("err: " + e.toString());
	}
	};
	
	var incrementQueueLength = (function() {
		// local variables
		var queuelength = 0;
		var timer = null;
		var button = document.getElementById('dontprint-tbbtn');
		var state = 0;
		
		// the actual function "incrementQueueLength()"
		return function(inc) {
			if (!button)
				button = document.getElementById('dontprint-tbbtn');
			clearInterval(timer);
			queuelength = Math.max(0, queuelength+inc);
			
			if (queuelength === 0) {
				button.style.listStyleImage = "url('chrome://dontprint/skin/dontprint-btn/idle.png')";
			} else {
				var len = Math.min(10, queuelength);
				var timerfunc = function() {
					button.style.listStyleImage = "url('chrome://dontprint/skin/dontprint-btn/"+len+("ab"[state])+".png')";
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
		// * extensions.zotero.dontprint.k2pdfoptpath
		// * extensions.zotero.dontprint.outputdirectory
		
		try {
			incrementQueueLength(1);
			
			var exec = Components.classes["@mozilla.org/file/local;1"]
						.createInstance(Components.interfaces.nsILocalFile);
			
			exec.initWithPath(Zotero.Prefs.get("dontprint.k2pdfoptpath"));
			if (!exec.exists()) {
				throw (path + " does not exist");
			}
			
			var proc = Components.classes["@mozilla.org/process/util;1"]
							.createInstance(Components.interfaces.nsIProcess);
			proc.init(exec);
			
			var outputpath = Zotero.Prefs.get("dontprint.outputdirectory") + '/converted_' + documentData.key + '_' + attachmentIndex + '.pdf';
			// TODO: use file path separator according to system
			
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
// 					alert('k2pdfopt done. Output file: ' + outputpath);
					googleOauthService.apicall(
						function(accessToken, onSuccess, onFail, onAuthFail) {
							uploadFileToGoogleDrive.call(
								that,
								outputpath,
								documentData.title,
								documentData.key,
								accessToken,
								onSuccess,
								onFail,
								onAuthFail
							);
						}
					);
				}
			});
		}
		catch (e) {
			alert('Dontprint: faild to launch k2pdfopt: ' + e.toString());
		}
	};
	
	var pdfcropCallback = function(db) {return function(documentData, attachmentIndex, settings) {
		if (!settings.builtin) {
			db.query("INSERT INTO journals VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)", [
				documentData.journalLongname,
				documentData.journalShortname,
				settings.remember ? 1 : 0,
				settings.coverpage ? 1 : 0,
				""+settings.m1,		// explicitly cast margins to strings
				""+settings.m2,		// (don't know why this is necessary
				""+settings.m3,		// but, whithout this, sqlite would
				""+settings.m4		// only store the integer part)
			]);
		}
		
		startConversion(documentData, attachmentIndex, settings);
	};};
	
	var dontprintSelection = function() {
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

			// Find field names in Zotero's resource/schema/system.sql (search "INSERT INTO fields")
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
		
		var sqlparams = [docData[0].journalLongname, docData[0].journalShortname];
		var sqlresult = this.DB.query("SELECT * FROM journals WHERE (longname = ? AND longname != '') OR (shortname = ? AND shortname != '')", sqlparams);
		var cropParams = sqlresult !== false ? sqlresult[0] : defaultCropParams;
		
		if (sqlresult !== false && cropParams.remember) {
			startConversion(docData[0], 0, cropParams);
		} else {
			var gBrowser = Components.classes["@mozilla.org/appshell/window-mediator;1"]
				.getService(Components.interfaces.nsIWindowMediator)
				.getMostRecentWindow("navigator:browser").gBrowser;
			var newTabBrowser = gBrowser.getBrowserForTab(
				gBrowser.loadOneTab("chrome://dontprint/content/pdfcrop/pdfcrop.html", {inBackground:false})
			);
			
			var thisdb = this.DB;
			newTabBrowser.addEventListener("load", function () {
				newTabBrowser.contentWindow.PDFCrop.init(docData[0], 0, cropParams, pdfcropCallback(thisdb));
			}, true);
			//TODO: this doesn't seem to call init if page has already been loaded by that time
			//TODO: don't forget to remove event listener (avoid memory leak)
		}
	};
	
	return {
		init: init,
		dontprintSelection: dontprintSelection
	};
}());

// Initialize the utility
window.addEventListener('load', function(e) { Zotero.Dontprint.init(); }, false);
