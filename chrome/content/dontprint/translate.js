/**
 * @class Dontprint translation
 *
 * @property {Document} document The document object to be used for web scraping (set with setDocument)
 * @property {Zotero.CookieSandbox} cookieSandbox A CookieSandbox to manage cookies for
 *     this Translate instance.
 */

Zotero.Translate.Dontprint = function() { };

Zotero.Translate.Dontprint.prototype = new Zotero.Translate.Web();
Zotero.Translate.Dontprint.prototype.constructor = Zotero.Translate.Dontprint;

/**
 * Prepare translation; Set up correct function to call for saving attachments.
 */
Zotero.Translate.Dontprint.prototype._prepareTranslation = function() {
	var that = this;
	this._itemSaver = new Zotero.Translate.ItemSaver(this._libraryID,
		Zotero.Translate.ItemSaver[(this._saveAttachments ? "ATTACHMENT_MODE_DOWNLOAD" : "ATTACHMENT_MODE_IGNORE")], 1,
		this.document, this._cookieSandbox, this.location);
	this._itemSaver.saveItems = function() {
		that.dontprintSaveItems.apply(that, arguments);
	};
	
	this.newItems = [];
}


/**
 * This is adapted from code in Zotero's translate_item.js.
 */
Zotero.Translate.Dontprint.prototype.dontprintSaveItems = function(items, callback, attachmentCallback) {
	try {
		var newItems = [];
		for each(var item in items) {
			// Get typeID, defaulting to "webpage"
			var newItem;
			var type = (item.itemType ? item.itemType : "webpage");
			
			if(type == "note") {
				//ignore
			} else {
				if(type == "attachment") {	// handle attachments differently
					//TODO
				} else {
					// handle attachments
					if(item.attachments) {
						for(var i=0; i<item.attachments.length; i++) {
							var attachment = item.attachments[i];
							if (attachment.mimeType && attachment.mimeType === "application/pdf") {
								var newAttachment = this.downloadPdfAttachment(attachment.url);
							}
						}
					}
				}
			}
		}
		callback(true, newItems);
	} catch(e) {
		alert("error saving item\n" + e.toString());
		callback(false, e);
	}
};

/**
 * This is adapted from code in Zotero's xpcom/attachments.js.
 */
Zotero.Translate.Dontprint.prototype.downloadPdfAttachment = function(url, cookieSandbox) {
	const nsIWBP = Components.interfaces.nsIWebBrowserPersist;
	var wbp = Components
		.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"]
		.createInstance(nsIWBP);
	wbp.persistFlags = nsIWBP.PERSIST_FLAGS_AUTODETECT_APPLY_CONVERSION;
	
	var that = this;
	wbp.progressListener = {
//		onProgressChange: TODO: show progress bar
		onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) {
			if (aStateFlags & Components.interfaces.nsIWebProgressListener.STATE_STOP) {
				if (that.attachDoneHandler)
					that.attachDoneHandler();
			}
		}
	};
	
	if(cookieSandbox) cookieSandbox.attachToInterfaceRequestor(wbp);
	var nsIURL = Components.classes["@mozilla.org/network/standard-url;1"]
				.createInstance(Components.interfaces.nsIURL);
	nsIURL.spec = url;
	try {
		wbp.saveURI(nsIURL, null, null, null, null, this.destFile);
	} catch(e if e.name === "NS_ERROR_XPC_NOT_ENOUGH_ARGS") {
		// https://bugzilla.mozilla.org/show_bug.cgi?id=794602
		//TODO: Always use when we no longer support Firefox < 18
		wbp.saveURI(nsIURL, null, null, null, null, this.destFile, null);
	}
};

/**
 * Set the nsIFile where the attachment should be downloaded to.
 */
Zotero.Translate.Dontprint.prototype.setDestFile = function(destFile) {
	this.destFile = destFile;
};

/**
 * Set up a function that is called when the attachment is downloaded completely.
 */
Zotero.Translate.Dontprint.prototype.setAttachDoneHandler = function(attachDoneHandler) {
	this.attachDoneHandler = attachDoneHandler;
};
