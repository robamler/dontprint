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
		Zotero.Translate.ItemSaver["ATTACHMENT_MODE_DOWNLOAD"], 1,
		this.document, this._cookieSandbox, this.location);
	this._itemSaver.saveItems = function(items, callback, attachmentCallback) {
		if (items.length) {
			that.dontprintDoneHandler(items[0]);
		} else {
			that.dontprintErrorHandler("No articles found on page.");
		}
	};
	
	this.newItems = [];
}


/**
 * This is adapted from code in Zotero's xpcom/attachments.js.
 */
// Zotero.Translate.Dontprint.prototype.downloadPdfAttachment = function(url, cookieSandbox) {
// 	if (this.canceled) {
// 		throw "canceled";
// 	}

// 	Components.utils.import("resource://gre/modules/Downloads.jsm");
// 	Components.utils.import("resource://gre/modules/Task.jsm");
// 	var that = this;

// 	Task.spawn(function() {
// 		var success = false;
// 		try {
// 			that.download = yield Downloads.createDownload({source: url, target: that.destFile});
// 			that.download.onchange = function() {
// 				that.progressHandler(that.download.progress/100);
// 			};

// 			yield that.download.start();
// 			success = true;
// 		} catch(e) {
// 			that.errorHandler("Error downloading the PDF file. Try to download the PDF manually, then go back to the article's abstract and click the Dontprint icon again. Original error message: " + e.toString());
// 		} finally {
// 			if (that.download) {
// 				that.download.onchange = undefined;
// 				that.download.finalize();
// 			}
// 		}
		
// 		if (success && that.attachDoneHandler) {
// 			that.attachDoneHandler();
// 		}
// 	});
// };


/**
 * Set up a function that is called when all meta data, including the pdf url
 * are retrieved. (This may happen after the "itemDone" handler is fired).
 * The function will be called with the item object as parameter.
 */
Zotero.Translate.Dontprint.prototype.dontprintSetDoneHandler = function(handler) {
	this.dontprintDoneHandler = handler;
};


/**
 * Set up a function that is called when translation fails. The function will
 * be called with one parameter representing the error.
 */
Zotero.Translate.Dontprint.prototype.dontprintSetErrorHandler = function(handler) {
	this.dontprintErrorHandler = handler;
};
