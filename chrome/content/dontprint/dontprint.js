Zotero.Dontprint = (function() {
	var DB = null;

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
	};
	
	var startConversion = function(documentData, attachmentIndex, settings) {
		// TODO: create preferences frontend to set:
		// * extensions.zotero.dontprint.k2pdfoptpath
		// * extensions.zotero.dontprint.outputdirectory
		
		try {
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
			
			proc.runwAsync(args, args.length, {
				observe: function(subject, topic, data) {
					alert('k2pdfopt done. Output file: ' + outputpath);
				}
			});
			//TODO: provide some feedback that conversion has started
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
				""+settings.m3,		// but it doesn't work otherwise)
				""+settings.m4
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
