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
	var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
					.getService(Components.interfaces.nsIPromptService);


	Dontprint.initOnPlatform = function() {
		if (initialized) {
			return;
		}
		initialized = true;

		// Add Dontprint button to menu panel
		try {
			Components.utils.import("resource:///modules/CustomizableUI.jsm");
			CustomizableUI.createWidget({
				id: 'dontprint-toolbaritem',
				type: 'view',
				viewId: 'dontprint-toolbaritem-view',
				label: 'Dontprint',
				tooltiptext: 'Show tools provided by addon "Dontprint"',
				defaultArea: CustomizableUI.AREA_PANEL,
				onViewShowing: function(event) {
					event.target.ownerDocument.defaultView.DontprintBrowser.onDontprintMenuShow(event);
				}
			});
		} catch (e) { } // FF < 29

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
		return function*(args, preferredFinalFilename, progressListener) {
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
			let finalFile = FileUtils.getFile("TmpD", [preferredFinalFilename]);
			finalFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);

			// Add job.finalFile to job.tmpFiles already now so that if
			// conversion crashes or is canceled, the file will be removed
			// during cleanup.
			job.finalFile = {
				fullPath: finalFile.path,
				mozFile: finalFile
			};
			job.tmpFiles.push(job.finalFile);

			let prefs = yield Dontprint.platformTools.getPrefs({
				k2pdfoptPath: ""
			});
			if (prefs.k2pdfoptPath === "") {
				throw "Cannot find k2pdfopt executable."
			}

			let currentLine = "";
			let k2pdfoptError = "";

			try {
				yield new Promise(function(resolve, reject) {
					let p = subprocess.call({
						command: prefs.k2pdfoptPath,
						workdir: job.origPdfFile.mozFile.parent.path,
						arguments: args.concat([
							job.origPdfFile.mozFile.leafName,
							"-o", finalFile.path
						]),
						stdout: function(data) {
							let lines = data.split(/[\n\r]+/);
							lines[0] = currentLine + lines[0];
							currentLine = lines.pop();
							lines.forEach(function(line) {
								let m = line.match(/^SOURCE PAGE \d+ \((\d+) of (\d+)\)/);
								if (m !== null && m[2]!=0) { // no typo: we want to use != instead of !== in second condition
									progressListener(parseInt(m[1]) / (parseInt(m[2]) + 1));
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


	Dontprint.moveFileToDestDir = function*(job, preferredFinalFilename) {
		let destDir = (yield Dontprint.platformTools.getPrefs({
			destDir: ""
		})).destDir;

		let destFile = null;
		if (destDir === "") {
			// Use the user's desktop directory as default destination directory
			destFile = Components.classes["@mozilla.org/file/directory_service;1"].
				getService(Components.interfaces.nsIProperties).
				get("Desk", Components.interfaces.nsIFile);
		} else {
			destFile = Components.classes["@mozilla.org/file/local;1"]
						.createInstance(Components.interfaces.nsILocalFile);
			try {
				destFile.initWithPath(destDir);
			} catch (e) {
				throw 'The destination directory "' + destDir + '" is not an absolute file path. Please go to the Dontprint options and provide the correct destination directory.';
			}
		}

		if (!destFile.exists()) {
			throw 'The destination directory "' + destFile.path + '" does not exist. Maybe your device is not connected or it needs to be accessed under a different path.';
		}
		
		destFile.append(preferredFinalFilename);
		destFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 509); // octal representation: 775
		
		try {
			// TODO: moving the file should really be done asynchronously
			// but I couldn't find out how to do that.
			job.finalFile.mozFile.moveTo(destFile.parent, destFile.leafName);
			let index = job.tmpFiles.indexOf(job.finalFile);
			if (index !== -1) {
				job.tmpFiles.splice(index, 1);
			}
		} catch (e) {
			throw 'Unable to move the resulting PDF file to the destination directory "' + destFile.parent.path + '". Maybe your device is not connected or it needs to be accessed under a different path.';
		}
		
		job.result = {
			success: true,
			destDir: destFile.parent.path,
			fileName: destFile.leafName,
			filePath: destFile.path
		};
	};


	Dontprint.callPostTransferCommand = function(job) {
		Dontprint.platformTools.getPrefs({
			postTransferCommandEnabled: false,
			postTransferCommand: ""
		}).then(function(prefs) {
			if (prefs.postTransferCommandEnabled && prefs.postTransferCommand !== "") {
				let args = prefs.postTransferCommand.trim().split(/\s+/);
				let cmd = args.shift();

				for (let i=0; i<args.length; i++) {
					args[i] = args[i].replace(/%u/g, job.result.filePath);
				}

				job.result.command = cmd + " " + args.join(" ");

				let file = Components.classes["@mozilla.org/file/local;1"]
							.createInstance(Components.interfaces.nsIFile);
				try {
					file.initWithPath(cmd);
				} catch (e) {
					throw 'The Post-process command "' + cmd + '" is not an absolute file path.';
				}

				let process = Components.classes["@mozilla.org/process/util;1"]
										.createInstance(Components.interfaces.nsIProcess);
				process.init(file);
				process.runAsync(args, args.length);
			}
		});
	};


	Dontprint.showFile = function(path) {
		let file = Components.classes["@mozilla.org/file/local;1"]
					.createInstance(Components.interfaces.nsIFile);
		file.initWithPath(path);
		file.launch();
	};


	Dontprint.revealFile = function(path) {
		let file = Components.classes["@mozilla.org/file/local;1"]
					.createInstance(Components.interfaces.nsIFile);
		file.initWithPath(path);
		file.reveal();
	};


	Dontprint.notifyJobStarted = function(job) {
		let enumerator = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator)
			.getEnumerator("navigator:browser");
		while (enumerator.hasMoreElements()) {
			let win = enumerator.getNext();
			win.DontprintBrowser.updateQueueLength();
		}
	};


	Dontprint.notifyJobDone = Dontprint.notifyJobStarted;


	Dontprint.dontprintLocalFile = function() {
		let win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator)
			.getMostRecentWindow("navigator:browser");
		
		let nsIFilePicker = Components.interfaces.nsIFilePicker;
		let fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
		fp.addToRecentDocs = true;
		fp.init(win, "Pick a PDF document to send to your e-reader", nsIFilePicker.modeOpenMultiple);
		fp.appendFilter("PDF documents", "*.pdf");
		fp.appendFilters(nsIFilePicker.filterAll);
		
		if (fp.show() === nsIFilePicker.returnOK) {
			let files = fp.files;
			while (files.hasMoreElements())  {
				let file = files.getNext().QueryInterface(Components.interfaces.nsILocalFile);
				let m = file.leafName.match(/^(.*)\.pdf$/i);
				let title = m ? m[1] : file.leafName;
				Dontprint.runJob({
					jobType: "localfile",
					title: title,
					origPdfFile: {
						fullPath: file.path,
						mozFile: file,
						toURL: function() { return "file://" + file.path; }
					}
				});
			}
		}
	};


	/**
	 * Called when the user clicks the dontprint button in the Zotero pane.
	 */
	Dontprint.dontprintZoteroItems = function(items, forceCropWindow) {
		// Create structure of all zotero "items" of which we want to dontprint
		// at least one attachment. Items are indexed by their ID. To each item
		// ID, we store a list of explicitly selected attachments, if any.
		let itemmap = {};
		for (let i=0; i<items.length; i++) {
			let it = items[i];
			let itemid = undefined;
			let attachment = undefined;
			if (it.isAttachment() && it.attachmentMIMEType === 'application/pdf') {
				itemid = it.getSource();
				attachment = it;
			} else {
				// Get ID of parent item (if, e.g., a note was selected) or of
				// the selected item itself.
				itemid = it.getSource() || it.id;
			}
			
			if (itemid !== undefined) {
				if (itemmap[itemid] === undefined) {
					itemmap[itemid] = (attachment === undefined) ? [] : [attachment];
				} else if (attachment !== undefined) {
					itemmap[itemid].push(attachment);
				}
				// else do nothing (both the item and one of its attachments were selected)
			}
		}
		
		// Add first attachment to each item for which no attachment was explicitly selected
		let noattach = [];
		for (let id in itemmap) {
			let val = itemmap[id];
			if (val.length === 0) {
				let attachs = Dontprint.Zotero.Items.get(id).getAttachments(false);
				for (let j=0; j<attachs.length; j++) {
					let attach = Dontprint.Zotero.Items.get(attachs[j]);
					if (attach.attachmentMIMEType === 'application/pdf') {
						val.push(attach);
						break;
					}
				}
				if (val.length === 0) {
					noattach.push(id);
					delete itemmap[id];
				}
			}
		}
		
		// generate list of all meta data
		let jobs = [];
		for (let id in itemmap) {
			let attachs = itemmap[id];
			let i = Dontprint.Zotero.Items.get(id);
			
			// Note that item.getCreators() returns something different than
			// what the "itemDone" handler of translators return. Apparently,
			// Zotero manages a table of all creators of all stored items and
			// therefore saves creators as references to the stored items.
			// Here, we bring the job.aritcleCreators in the same form as for
			// jobs of type "page" and make it JSONifyable (i.e., explicitly
			// call the JavaScript getters for firstName and lastName).
			let creators = [];
			try {
				creators = i.getCreators().map(function(c) {
					return {
						firstName: c.ref.firstName,
						lastName:  c.ref.lastName
					};
				});
			} catch (e) { } // fall back to empty array for creators
			
			for (let j=0; j<attachs.length; j++) {
				// Note that if several attachments of the same item where selected,
				// the corresponding jobs share the "creators" object. I.e., modifying
				// job.articleCreators in one job will modify it in the others, too.
				// But we never modify job.articleCreators, so this should not be an issue.
				let file = attachs[j].getFile();
				if (!file) {
					prompts.alert(null, "Dontprint", "Error: Cannot find file for attachment to article \"" + i.getField('title') + "\".");
					return;
				}
				jobs.push({
					jobType:			"zotero",
					title:				i.getField("title"),
					journalLongname:	i.getField("publicationTitle"),
					journalShortname:	i.getField("journalAbbreviation"),
					pageurl:			i.getField("url"),
					doi:				i.getField("DOI"),
					articleDate:		i.getField("date"),
					articleVolume:		i.getField("volume"),
					articleIssue:		i.getField("issue"),
					articlePages:		i.getField("pages"),
					articleCreators:	creators,
					forceCropWindow:	forceCropWindow,
					origPdfFile: {
						fullPath: file.path,
						mozFile: file,
						toURL: function() { return "file://" + file.path; }
					}
				});
			}
		}
		
		if (noattach.length !== 0) {
			prompts.alert(
				null,
				"Dontprint",
				"The following selected items cannot be sent to your e-reader because they do not have an attached PDF file:\n\n" +
				noattach.map(function(id) {
					return Dontprint.Zotero.Items.get(id).getField('title');
				}).join("\n")
			);
		}
		
		if (jobs.length === 0) {
			prompts.alert(null, "Dontprint", "Error: No documents sent to your e-reader. Select an item with an attached PDF file and try again.");
			return;
		}
		
		jobs.forEach(function(job) {
			Dontprint.runJob(job);
		});
	};
}());
