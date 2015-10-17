"use strict";

Components.utils.import("resource://gre/modules/Timer.jsm");

(function() {
	let Dontprint = PlatformTools.getMainComponent();

	let zoteroInstalledResolveFunction = null;
	let initialized = false;

	Dontprint.isZoteroInstalled = new Promise(function(resolve, reject) {
		zoteroInstalledResolveFunction = resolve;
	});

	Dontprint.initOnPlatform = function() {
		if (initialized) {
			return;
		}
		initialized = true;

		const loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
						.getService(Components.interfaces.mozIJSSubScriptLoader);
		Components.utils.import("resource://gre/modules/AddonManager.jsm");

		AddonManager.getAddonByID("zotero@chnm.gmu.edu", function(addon) {
			let zoteroInstalled = addon && addon.isActive;
			let context = {};
			if (zoteroInstalled) {
				// Load Zotero's main extension logic (this is from Zotero's
				// documentation on how to write a Zotero extension).
				loader.loadSubScript("chrome://zotero/content/include.js", context, "UTF-8");
			} else {
				// Register URI alias "resource://zotero/...". The Zotero xpcom module expects this.
				Components.utils.import("resource://gre/modules/Services.jsm");
				var resProt = Services.io.getProtocolHandler("resource")
								.QueryInterface(Components.interfaces.nsIResProtocolHandler);
				var aliasURI = Components.classes["@mozilla.org/network/io-service;1"]
								.getService(Components.interfaces.nsIIOService)
								.newURI("chrome://dontprint/content/zotero-resource/", null, null);
				resProt.setSubstitution("zotero", aliasURI);

				// Initialize the included Zotero xpcom module
				context.Zotero = Components.classes["@robamler.github.com/minimal-zotero;1"]
					.getService(Components.interfaces.nsISupports).wrappedJSObject;
			}

			// Load Dontprint's own translator (may only be loaded *after* loading Zotero, regardless
			// of whether we use an actual zotero plugin or the included Zotero xpcom module)
			loader.loadSubScript("chrome://dontprint/content/adapted-from-zotero/translate-dontprint.js", context, "UTF-8");

			// Attach Zotero object to Dontprint so that it can be accessed
			// from functions in the Dontprint main component.
			Dontprint.Zotero = context.Zotero;

			zoteroInstalledResolveFunction(zoteroInstalled);
		});
	}
}());
