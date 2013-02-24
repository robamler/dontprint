Zotero.Zotero2kindle = {
	DB: null,
	
	init: function () {
		// Connect to (and create, if necessary) zotero2kindle.sqlite in the Zotero directory
/*		this.DB = new Zotero.DBConnection('zotero2kindle');
		
		if (!this.DB.tableExists('changes')) {
			this.DB.query("CREATE TABLE changes (num INT)");
			this.DB.query("INSERT INTO changes VALUES (0)");
		}*/
	},
	
	sendSelectionToKindle: function() {
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
			var attachmentKeys = i.getAttachments(false).map(function(id) {
				var a_item = Zotero.Items.get(id);
				if (a_item.attachmentMIMEType == 'application/pdf') {
					return a_item.getField('key');
				} else {
					return undefined;
				}
			}).filter(function(elem) {
				return elem !== undefined;
			});

			return {
				'key': i.getField('key'),
				'title': i.getField('title'),
				'attachments': attachmentKeys
			};
		});

		// remove entries without attached PDF files
		var noattach = docData.filter(function(elem) {
			return elem.attachments.length == 0;
		});
		if (noattach.length) {
			alert("The following selected items cannot be sent to your Kindle because they do not have an attached PDF file:\n\n" +
				noattach.map(function(elem) { return elem.title; }).join("\n"));
		}
		
		docData = docData.filter(function(elem) {
			return elem.attachments.length != 0;
		});
		if (docData.length == 0) {
			alert("No documents sent to your Kindle. Select an item with an attached PDF file and try again.");
			return;
		}

//		alert(JSON.stringify(docData));

//		alert("opening tab");
		var browserWindow = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator)
			.getMostRecentWindow("navigator:browser");
		var tab = browserWindow.gBrowser.loadOneTab("chrome://zotero2kindle/content/pdfcrop.xul", {inBackground:false});
	}
};

// Initialize the utility
window.addEventListener('load', function(e) { Zotero.Zotero2kindle.init(); }, false);
