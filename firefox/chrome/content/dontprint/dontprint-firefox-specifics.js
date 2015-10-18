"use strict";

Components.utils.import("resource://gre/modules/Timer.jsm");

(function() {
	let Dontprint = PlatformTools.getMainComponent();

	let zoteroInstalledResolveFunction = null;
	let initialized = false;
	let k2pdfoptTestTimeout = null;

	Dontprint.isZoteroInstalled = new Promise(function(resolve, reject) {
		zoteroInstalledResolveFunction = resolve;
	});

	Components.utils.import("resource://EXTENSION/subprocess.jsm");


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


	Dontprint.detectK2pdfoptVersion = function() {
		if (k2pdfoptTestTimeout !== "null") {
			clearTimeout(k2pdfoptTestTimeout);
		}
		let currentLine = "";
		let lineNumber = 0;
		let found = false;

		return Dontprint.platformTools.getPrefs({
			"k2pdfoptPath": ""
		}).then(function(prefs) {
			if (prefs.k2pdfoptPath === "") {
				return Promise.reject("k2pdfoptPath is not set");
			}

			return new Promise(function(resolve, reject) {
				try {
					let p = subprocess.call({
						command: prefs.k2pdfoptPath,
						arguments: ['-ui-', '-x', '-a-', '-?'],
						stdout: function(data) {
							if (lineNumber < 5 || !found) {
								let lines = data.split(/[\n\r]+/);
								lines[0] = currentLine + lines[0];
								currentLine = lines.pop();
								for (let i=0; i<Math.min(lines.length, 5-lineNumber); i++) {
									let m = lines[i].match(/^\s*k2pdfopt\s+v(\d+(\.\d+)*)\s/);
									if (m) {
										found = true;
										if (Dontprint.compareVersionStrings(m[1], "1.51") >= 0) {
											resolve(m[1]);
										} else {
											reject("Outdated version: " + m[1]);
										}
									}
									lineNumber++;
								}
							}
						},
						done: function(result) {
							if (!found) {
								reject("Cannot parse version string.");
							}
						},
						mergeStderr: false
					});
				} catch (e) {
					let errstr = e.toString();
					if (errstr.length > 120) {
						errstr = errstr.substr(0, 100) + "...";
					}
					reject(errstr);
				} finally {
					if (typeof p === "object") {
						k2pdfoptTestTimeout = setTimeout(p.kill, 5000);  // 5 seconds
					}
				}
			});
		});
	};


	/**
	 * Returns -1 if v2 is newer than v1, +1 if v1 is newer than v2
	 * and 0 if they are equal.
	 */
	Dontprint.compareVersionStrings = function(v1, v2) {
		let a1 = v1.split(".");
		let a2 = v2.split(".");
		for (let i=0; i<Math.min(a1.length, a2.length); i++) {
			if (a1[i] < a2[i])
				return -1;
			if (a1[i] > a2[i])
				return 1;
		}
		if (a1.length < a2.length)
			return -1;
		if (a1.length > a2.length)
			return 1;
		return 0;
	};
}());
