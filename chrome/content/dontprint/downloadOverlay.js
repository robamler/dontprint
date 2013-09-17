var Dontprint_DownloadOverlay = new function() {
	/**
	 * Called when the dialog was accepted.
	 * @return {Boolean} True if Dontprint handles the file, false otherwise.
	 */
	this.handleOK = function() {
		if (!document.getElementById("dontprint-radio").selected) {
			return false;
		}
		
		let Dontprint = Components.classes["@robamler.github.com/dontprint;1"].getService().wrappedJSObject;
		let url = dialog.mLauncher.source.spec;
		let title = document.getElementById("dontprint-title").value;
		if (!title) {
			title = "Untitled document";
		}
		
		Dontprint.runJob({
			jobType:			"pdfurl",
			title:				title,
			pdfurl:				url,
			identifierurl:		url,
			journalLongname:	"",
			journalShortname:	"",
			tmpFiles:			[]
		});
		
		return true;
	};
	
	/**
	 * Called when the selected action in the dialog has been changed
	 */
	this.modeChanged = function() {
		let dontprintSelected = document.getElementById("dontprint-radio").selected;
		document.getElementById("dontprint-title").disabled = !dontprintSelected;
		
		if (dontprintSelected) {
			document.getElementById("rememberChoice").disabled = true;
			document.getElementById("rememberChoice").checked = false;
			let title = document.getElementById("dontprint-title").value;
			document.getElementById("dontprint-title").setSelectionRange(0, title.length);
			document.getElementById("dontprint-title").focus();
		} else if (!window.Zotero_DownloadOverlay) {
			// Don't enable if Zotero is installed. Zotero's modeChanged()
			// function was called before this function and already
			// set disabled to the correct value.
			document.getElementById("rememberChoice").disabled = false;
		}
	};
	
	/**
	 * Called when the save dialog is opened
	 */
	this.init = function() {
		if (dialog.mLauncher.MIMEInfo.MIMEType.toLowerCase() === "application/pdf") {
			let filename = decodeURIComponent(dialog.mLauncher.source.path.match(/([^/]*?)(\.pdf)?([?#].*)?$/i)[1]);
			if (!filename) {
				filename = "Untitled document";
			}
			document.getElementById("dontprint-title").value = filename;
			document.getElementById("dontprint-container").hidden = false;
			
			// Hook in event listener to ondialogaccept (this is adapted from Zotero)
			document.documentElement.setAttribute("ondialogaccept",
				"if(!Dontprint_DownloadOverlay.handleOK()) { "
				+ document.documentElement.getAttribute("ondialogaccept")
				+"}"
			);
			
			// Hook in event listener for mode change
			if (window.Zotero_DownloadOverlay) {
				let oldModeChanged = Zotero_DownloadOverlay.modeChanged;
				Zotero_DownloadOverlay.modeChanged = function() {
					oldModeChanged.apply(Zotero_DownloadOverlay, arguments);
					Dontprint_DownloadOverlay.modeChanged();
				}
				// The event listener will be added in Zotero's init() function.
			} else {
				document.getElementById("mode").addEventListener("command", Dontprint_DownloadOverlay.modeChanged, false);
			}
		}
		
		if (window.Zotero_DownloadOverlay) {
			Zotero_DownloadOverlay.init.apply(Zotero_DownloadOverlay, arguments);
		}
	};
}

try {
	// Make sure our overlay is initialized before Zotero's.
	// Zotero_DownloadOverlay.init() will be called from our init() function.
	window.removeEventListener("load", Zotero_DownloadOverlay.init, false);
} catch (e) {}

window.addEventListener("load", Dontprint_DownloadOverlay.init, false);
