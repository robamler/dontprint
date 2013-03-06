Zotero.Dontprint = (function() {
	var DB = null;
	
	var init = function () {
		// Connect to (and create, if necessary) dontprint.sqlite in the Zotero directory
/*		this.DB = new Zotero.DBConnection('dontprint');
		
		if (!this.DB.tableExists('changes')) {
			this.DB.query("CREATE TABLE changes (num INT)");
			this.DB.query("INSERT INTO changes VALUES (0)");
		}*/
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
				'-ml', settings.margins[0],
				'-mt', settings.margins[1],
				'-mr', settings.margins[2],
				'-mb', settings.margins[3],
				'-p', settings.startpage + '-' + settings.endpage,
				documentData.attachments[attachmentIndex],
				'-o', outputpath
			];

			proc.runwAsync(args, args.length, {
				observe: function(subject, topic, data) {
					alert('k2pdfopt done. Output file: ' + outputpath);
				}
			});
		}
		catch (e) {
			alert('Dontprint: faild to launch k2pdfopt: ' + e.toString());
		}
	};
	
	var dontprintSelection = function() {
		var selectedItems = ZoteroPane.getSelectedItems();
//		alert("selectedItems.length = " + selectedItems.length);

		// delete duplicates (e.g., if user selects both an attachment and its parent)
		var entryIds = selectedItems.map(function(i) {
			return i.getSource() || i.id;
		});
		var uniqueEntryIds = entryIds.filter(function(elem, pos, self) {
			return self.indexOf(elem) == pos;
		})
//		alert("slectedEntryIds = " + JSON.stringify(uniqueEntryIds));

		// generate list of all metadata
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
		
		var gBrowser = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator)
			.getMostRecentWindow("navigator:browser").gBrowser;
		var newTabBrowser = gBrowser.getBrowserForTab(
			gBrowser.loadOneTab("chrome://dontprint/content/pdfcrop/pdfcrop.html", {inBackground:false})
		);

		newTabBrowser.addEventListener("load", function () {
			newTabBrowser.contentWindow.PDFCrop.init(docData[0], 0, startConversion);
		}, true);
		//TODO: don't forget to remove event listener (avoid memory leak)
	};

	return {
		init: init,
		dontprintSelection: dontprintSelection
	};
}());

// Initialize the utility
window.addEventListener('load', function(e) { Zotero.Dontprint.init(); }, false);
