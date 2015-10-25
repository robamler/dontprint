"use strict";

if (typeof PlatformTools === "undefined") { //TODO
	var PlatformTools = {};
}


(function() {
	var publicInterface = {
		platform: "firefox",
		extensionScriptUrl,
		registerMainComponent,
		getMainComponent,
		getPrefs,
		setPrefs,
		downloadTmpFile,
		debug,
		xhr,
		postFile
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
		"boolean": "Bool",
		"object": "Char"
	};

	return;


	function extensionScriptUrl(relativePath) {
		if (relativePath.indexOf("://") !== -1) {
			return relativePath;
		} else {
			return "chrome://" + extensionName.toLowerCase() + "/content/" + relativePath;
		}
	}


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
				if (typeof def === "object") {
					ret[key] = JSON.parse(ret[key]);
				}
			} catch (e) {
				ret[key] = def;
			}
		}
		return Promise.resolve(ret);
	}


	function setPrefs(keys) {
		try {
			for (let key in keys) {
				let val = keys[key];
				if (typeof val === "object") {
					val = JSON.stringify(val);
				}
				prefs["set" + prefFunctions[typeof val] + "Pref"](key, val);
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

		return {
			fullPath: file.path,
			mozFile: file,
			toURL: function() { return "file://" + file.path; }
		};
	}


	function xhr() {
		return Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
			.createInstance(Components.interfaces.nsIXMLHttpRequest);
	}


	function postFile(xhr, file, url) {
		try {
			let stream = Components.classes["@mozilla.org/network/file-input-stream;1"]
					.createInstance(Components.interfaces.nsIFileInputStream);
			stream.init(file.mozFile, 0x04 | 0x08, 420, 0x04);  // octal representation of 420: 644
			xhr.open("POST", url, true);
			xhr.send(stream);
			return Promise.resolve();
		} catch (e) {
			return Promise.reject(e);
		}
	}
}());
