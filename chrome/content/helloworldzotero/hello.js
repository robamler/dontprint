Zotero.HelloWorldZotero = {
	DB: null,
	
	init: function () {
		// Connect to (and create, if necessary) helloworld.sqlite in the Zotero directory
		this.DB = new Zotero.DBConnection('helloworld');
		
		if (!this.DB.tableExists('changes')) {
			this.DB.query("CREATE TABLE changes (num INT)");
			this.DB.query("INSERT INTO changes VALUES (0)");
		}
		
		// Register the callback in Zotero as an item observer
		var notifierID = Zotero.Notifier.registerObserver(this.notifierCallback, ['item']);

		var oldstop = Zotero.Sync.Runner.stop;
		Zotero.Sync.Runner.stop = function () {
			oldstop();
			alert("snyc stopped");
		}
		var notifierID2 = Zotero.Notifier.registerObserver(this.notifierCallback, ['item']);
		
		// Unregister callback when the window closes (important to avoid a memory leak)
		window.addEventListener('unload', function(e) {
				Zotero.Notifier.unregisterObserver(notifierID);
		}, false);
	},
	
	insertHello: function() {
		// Make sure data is synced (code adapted from zoteroPane.xul's <toolbarbutton id="zotero-tb-sync">)
		Zotero.Sync.Server.canAutoResetClient = true;
		Zotero.Sync.Server.manualSyncRequired = false;
		Zotero.Sync.Runner.sync();	// seems to be asynchroneous

		var selectedItems = ZoteroPane.getSelectedItems();
		alert("selectedItems.length = " + selectedItems.length);

		// delete duplicates (e.g., if user selects both an attachment and its parent)
		var entryIds = selectedItems.map(function(i) {
			return i.getSource() || i.id;
		});
		var uniqueEntryIds = entryIds.filter(function(elem, pos, self) {
			return self.indexOf(elem) == pos;
		})
		alert("slectedEntryIds = " + JSON.stringify(uniqueEntryIds));

		// generate list of all metadata
		var postData = uniqueEntryIds.map(function(id) {
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
		var noattach = postData.filter(function(elem) {
			return elem.attachments.length == 0;
		});
		if (noattach.length) {
			alert("The following selected items cannot be sent to your Kindle because they do not have an attached PDF file:\n\n" +
				noattach.map(function(elem) { return elem.title; }).join("\n"));
		}
		
		postData = postData.filter(function(elem) {
			return elem.attachments.length != 0;
		});
		if (postData.length == 0) {
			alert("No documents sent to your Kindle. Select an item with an attached PDF file and try again.");
			return;
		}

		// TODO: save list to class variable. Make XHR call as soon as sync is finished.
		alert(JSON.stringify(postData));
	},
	
	// Callback implementing the notify() method to pass to the Notifier
	notifierCallback: {
		notify: function(event, type, ids, extraData) {
//			alert("notify");
/*			if (event == 'add' || event == 'modify' || event == 'delete') {
				// Increment a counter every time an item is changed
				Zotero.HelloWorldZotero.DB.query("UPDATE changes SET num = num + 1");
				
				if (event != 'delete') {
					// Retrieve the added/modified items as Item objects
					var items = Zotero.Items.get(ids);
				}
				else {
					var items = extraData;
				}
				
				// Loop through array of items and grab titles
				var titles = [];
				for each(var item in items) {
					// For deleted items, get title from passed data
					if (event == 'delete') {
						titles.push(item.old.title ? item.old.title : '[No title]');
					}
					else {
						titles.push(item.getField('title'));
					}
				}
				
				if (!titles.length) {
					return;
				}
				
				// Get the localized string for the notification message and
				// append the titles of the changed items
				var stringName = 'notification.item' + (titles.length==1 ? '' : 's');
				switch (event) {
					case 'add':
						stringName += "Added";
						break;
						
					case 'modify':
						stringName += "Modified";
						break;
						
					case 'delete':
						stringName += "Deleted";
						break;
				}
				
				var str = document.getElementById('hello-world-zotero-strings').
					getFormattedString(stringName, [titles.length]) + ":\n\n" +
					titles.join("\n");
			}
			
			alert(str);*/
		}
	}
};

// Initialize the utility
window.addEventListener('load', function(e) { Zotero.HelloWorldZotero.init(); }, false);
