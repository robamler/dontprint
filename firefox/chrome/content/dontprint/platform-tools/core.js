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
		downloadTmpFile,
		debug,
		xhr
	};

	for (let i in publicInterface) {
		PlatformTools[i] = publicInterface[i];
	}

	var exportedComponents = {};

	Components.utils.import("resource://gre/modules/Downloads.jsm");
	Components.utils.import("resource://gre/modules/FileUtils.jsm");
	var console = Components.utils.import("resource://gre/modules/devtools/Console.jsm", {}).console;
	var prefs = null;
	var extensionName = null;
	var mainComponent = null;
	var prefFunctions = {
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


	function* downloadTmpFile(url, targetFilename, progressListener) {
		let file = FileUtils.getFile("TmpD", targetFilename.split("/"));
		file.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);

		try {
			var download = yield Downloads.createDownload({
				source: url,
				target: file
			});

			if (progressListener) {
				download.onchange = function() {
					progressListener(download.progress / 100);
				};
			}

			yield download.start();
		} finally {
			download.finalize();
		}

		if (!file.exists() || file.fileSize === 0) {
			throw -1;
		}

		return file;
	}


	function xhr() {
		return Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
			.createInstance(Components.interfaces.nsIXMLHttpRequest);
	}
}());
