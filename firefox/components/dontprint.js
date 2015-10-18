"use strict";

function Dontprint() {
	let context = {};
	const loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
					.getService(Components.interfaces.mozIJSSubScriptLoader);
	loader.loadSubScript("chrome://dontprint/content/platform-tools/core.js", context, "UTF-8");
	loader.loadSubScript("chrome://dontprint/content/platform-tools/concurrency.js", context, "UTF-8");
	loader.loadSubScript("chrome://dontprint/content/platform-tools/sql.js", context, "UTF-8");
	loader.loadSubScript("chrome://dontprint/content/common/dontprint.js", context, "UTF-8");
	loader.loadSubScript("chrome://dontprint/content/dontprint-firefox-specifics.js", context, "UTF-8");

	this.wrappedJSObject = context.PlatformTools.getMainComponent();
}


const os = Components.classes["@mozilla.org/observer-service;1"]
			.getService(Components.interfaces.nsIObserverService);
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");


// Define XPCOM component
Dontprint.prototype = {
	classDescription:	"Singleton service for Dontprint add-on for Firefox",
	classID:			Components.ID("{7432b5f0-ad37-4d1d-aab9-cf0559fb75a1}"),
	contractID:			"@robamler.github.com/dontprint;1",
	_xpcom_categories:	[{ category: "app-startup", service: true }],  /* for toolkit before 2.0 (Fx 4.0) */
	QueryInterface:		XPCOMUtils.generateQI([Components.interfaces.nsIObserver]),
	
	// initialization
	observe: function (aSubject, aTopic, aData) {
		switch (aTopic) {
		case "app-startup":  /* for toolkit before 2.0 (Fx 4.0) */
			os.addObserver(this, "profile-after-change", false);
			break;
		
		case "profile-after-change":
			os.addObserver(this, "sessionstore-windows-restored", false);
			this.wrappedJSObject.init();
			break;
		
		case "sessionstore-windows-restored":
			// See http://stackoverflow.com/a/10680715 for why we listen to
			// "sessionstore-windows-restored" and not, e.g., to
			// "browser-delayed-startup-finished".
			os.removeObserver(this, "sessionstore-windows-restored");
			this.wrappedJSObject.init.call(this.wrappedJSObject);
			break;
		}
	}
};

// Register component
if ("generateNSGetFactory" in XPCOMUtils) {
	// Firefox 4.0 and higher
	var NSGetFactory = XPCOMUtils.generateNSGetFactory([Dontprint]);
} else {
	// Firefox 3.x
	var NSGetModule = XPCOMUtils.generateNSGetModule([Dontprint]);
}
