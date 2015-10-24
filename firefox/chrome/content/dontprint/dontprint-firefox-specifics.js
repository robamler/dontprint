"use strict";

Components.utils.import("resource://gre/modules/Timer.jsm");
Components.utils.import("resource://EXTENSION/subprocess.jsm");

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


	Dontprint.detectK2pdfoptVersion = function(path) {
		if (k2pdfoptTestTimeout !== "null") {
			clearTimeout(k2pdfoptTestTimeout);
		}
		let currentLine = "";
		let lineNumber = 0;
		let found = false;

		let p = null;
		if (path) {
			p = Promise.resolve({k2pdfoptPath: path});
		} else {
			p = Dontprint.platformTools.getPrefs({k2pdfoptPath: ""});
		}
		return p.then(function(prefs) {
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


	Dontprint.downloadK2pdfopt = function(prefs, progressListener) {
		let leafFilename = prefs.k2pdfoptPlatform.substr(0,4)==="win_" ? "k2pdfopt.exe" : "k2pdfopt";

		return Dontprint.platformTools.spawn(function*() {
			try {
				var file = yield Dontprint.platformTools.downloadTmpFile(
					"http://dontprint.net/k2pdfopt/" + prefs.k2pdfoptPlatform + "/" + leafFilename,
					leafFilename,
					progressListener
				).mozFile;
			} catch (e) {
				throw "Unable to download k2pdfopt. Are you connected to the internet?";				return;
			}

			let targetPath = prefs.k2pdfoptPath;
			if (targetPath === "") {
				let newfile = FileUtils.getFile("ProfD", ["dontprint", "k2pdfopt"]);
				newfile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 599);
				targetPath = newfile.path;
			}
			
			// This can only be reached if platform is not "unknown.*". Therefore,
			// if an older version of k2pdfopt already exists, it must have been
			// originally downloaded by Dontprint, so we may overwrite it.
			file.permissions = 509 // For unix: executable file (octal representation: 775)
			var m = targetPath.match(/^(.*)[\\/](.*)$/);
			var destdir = Components.classes["@mozilla.org/file/local;1"].
			           createInstance(Components.interfaces.nsILocalFile);
			destdir.initWithPath(m[1]);
			file.moveTo(destdir, m[2]);

			if (prefs.k2pdfoptPath === "") {
				return Dontprint.platformTools.setPrefs({
					k2pdfoptPath: file.path
				});
			}
		});
	};


	Dontprint.loadK2pdfopt = function(job) {
		return function*(args, progressListener) {
			// Create filename from author and title. We already use the final filename
			// for the temporarily generated file because k2pdfopt generates the pdf
			// title meta-data based on the output filename if the input file has none
			// and these meta data are displayed by Kobo e-readers.
			
			// Don't allow the '.' char in the file name because files starting with
			// a '.' are usually hidden on unix systems, which would be confusing.
			let authorAndTitle = job.title.replace(/[^a-zA-Z0-9 \-,]+/g, "_");
			if (job.articleCreators && job.articleCreators.length !== 0 && job.articleCreators[0].lastName) {
				authorAndTitle = job.articleCreators[0].lastName.replace(/[^a-zA-Z0-9 \-,]+/g, "_") + ", " + authorAndTitle;
			}
			
			// On OS X, k2pdfopt crops long file paths for some reason. To
			// work around this issue, we start k2pdfopt with workdir set
			// to the directory of the input file, and also use a rather
			// short filename for the temporary file.
			job.finalFile = FileUtils.getFile("TmpD", [authorAndTitle.substr(0, 70) + ".pdf"]);
			job.finalFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);

			let prefs = yield Dontprint.platformTools.getPrefs({
				k2pdfoptPath: ""
			});
			if (prefs.k2pdfoptPath === "") {
				throw "Cannot find k2pdfopt executable."
			}

			let currentLine = "";

			try {
				yield new Promise(function(resolve, reject) {
					let p = subprocess.call({
						command: prefs.k2pdfoptPath,
						workdir: job.origPdfFile.mozFile.parent.path,
						arguments: args.concat([
							job.origPdfFile.mozFile.leafName,
							"-o", job.finalFile.path
						]),
						stdout: function(data) {
							let lines = data.split(/[\n\r]+/);
							lines[0] = currentLine + lines[0];
							currentLine = lines.pop();
							lines.forEach(function(line) {
								let m = line.match(/^SOURCE PAGE \d+ \((\d+) of (\d+)\)/);
								if (m !== null && m[2]!=0) { // no typo: we want to use != instead of !== in second condition
									progressListener(m[1] / (m[2] + 1));
								}
							});
						},
						stderr: function(data) {
							if (k2pdfoptError.length < 500) {
								k2pdfoptError += data;
							}
						},
						done: function(result) {
							if (result.exitCode) {
								if (job.jobType === "page") {
									reject("Conversion failed. This may mean that Dontprint was unable to download the article. Try to download the PDF manually, then go back to the article's abstract and click the Dontprint icon again. Original error message: " + k2pdfoptError);
								} else {
									reject("Conversion failed with error message: " + k2pdfoptError);
								}
							}
							progressListener(1);
							resolve();
						},
						mergeStderr: false
					});
					job.abortCurrentTask = p.kill.bind(p);
				});
			} finally {
				delete job.abortCurrentTask;
			}
		};
	};
}());
