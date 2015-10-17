"use strict";

if (typeof PlatformTools === "undefined") { //TODO
	var PlatformTools = {};
}


(function() {
	var publicInterface = {
		platform: "firefox",
		registerMainComponent,
		getMainComponent,
		getPrefs,
		setPrefs,
		debug
	};

	for (let i in publicInterface) {
		PlatformTools[i] = publicInterface[i];
	}

	var exportedComponents = {};

	var console = Components.utils.import("resource://gre/modules/devtools/Console.jsm", {}).console;
	var prefs = null;
	var extensionName = null;
	var mainComponent = null;
	const prefFunctions = {
		"string": "Char",
		"number": "Int",
		"boolean": "Bool"
	};

	return;

	function registerMainComponent(name, builder) {
		extensionName = name;
		prefs = Components.classes["@mozilla.org/preferences-service;1"]
						.getService(Components.interfaces.nsIPrefService)
						.getBranch("extensions." + name.toLowerCase() + ".");
		mainComponent = builder();
	}


	function getMainComponent() {
		return mainComponent;
	}


	function getPrefs(keys) {
		let ret = {};

		for (let key in keys) {
			let def = keys[key];
			try {
				ret[key] = prefs["get" + prefFunctions[typeof def] + "Pref"](key);
			} catch (e) {
				ret[key] = def;
			}
		}
		return Promise.resolve(ret);
	}


	function setPrefs(keys) {
		try {
			for (let key in keys) {
				prefs["set" + prefFunctions[typeof def] + "Pref"](key, keys[key]);
			}
			return Promise.resolve();
		} catch (e) {
			return Promise.reject(e);
		}
	}


	function debug(msg) {
		console.log(msg);
	}
}());
