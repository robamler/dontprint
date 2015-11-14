"use strict";

chrome.runtime.onInstalled.addListener(function(info) {
	chrome.runtime.getBackgroundPage(function(bgpage) {
		var interval = setInterval(function() {
			if (bgpage.Dontprint && bgpage.Dontprint.loadK2pdfoptIntoCache) {
				clearInterval(interval);
				bgpage.Dontprint.loadK2pdfoptIntoCache();
			}
		}, 500);
	});
});

chrome.runtime.getBackgroundPage(function(bgpage) {
	var Dontprint = bgpage.Dontprint;

	Dontprint.loadK2pdfopt = function(job) {
		let naclModuleLoaded = false;
		let naclDoneCallback = null;
		let naclErrCallback = null;
		let waitedForNacl = false;
		let naclProgressListener = null;
		let errorState = null;
		let naclStarted = false;

		job.naclListenerDiv = bgpage.document.createElement("div");
		job.naclListenerDiv.addEventListener("error", function(evt) {
			errorState = "Unable to load k2pdfopt.";
			if (naclErrCallback !== null) {
				naclErrCallback(errorState);
			}
		}, true);
		job.naclListenerDiv.addEventListener("load", function(evt) {
			naclModuleLoaded = true;
		}, true);
		job.naclListenerDiv.addEventListener("crash", function(evt) {
			errorState = "K2pdfopt crashed.";
			if (naclErrCallback !== null) {
				naclErrCallback(errorState);
			}
		}, true);
		job.naclListenerDiv.addEventListener("message", onNaclMessage, true);

		let naclModule = bgpage.document.createElement("embed");
		job.naclListenerDiv.appendChild(naclModule);
		naclModule.setAttribute("width", 0);
		naclModule.setAttribute("height", 0);
		naclModule.setAttribute("path", ".");
		naclModule.setAttribute("src", "k2pdfopt/k2pdfopt.nmf");
		naclModule.setAttribute("type", "application/x-pnacl");

		bgpage.document.getElementsByTagName("body")[0].appendChild(job.naclListenerDiv);

		return runK2pdfopt;


		function onNaclMessage(evt) {
			if (evt.data && evt.data.category) {
				if (evt.data.category === "status") {
					if (evt.data.msg === "start") {
						naclStarted = true;
					} else if (evt.data.msg === "done") {
						naclDoneCallback();
					}
				} else if (evt.data.category === "progress") {
					let progress = evt.data.current / (evt.data.total + 1);
					if (waitedForNacl) {
						progress = 0.1 + 0.9 * progress;
					}
					naclProgressListener(progress);
				}
			}
		}


		function* runK2pdfopt(args, preferredFinalFilename, progressListener) {
			naclProgressListener = progressListener;

			if (!naclModuleLoaded) {
				// If NaCl module is still loading, use the first 10% of the
				// convert progress bar to show remaining NaCl load progress.
				waitedForNacl = true;
				let firstLoadStatus = null;
				job.naclListenerDiv.addEventListener("progress", function(evt) {
					if (!naclStarted && evt.lengthComputable && evt.total>0) {
						if (firstLoadStatus === null) {
							firstLoadStatus = evt.loaded;
						} else {
							naclProgressListener(0.1 * (evt.loaded-firstLoadStatus) / (evt.total-firstLoadStatus));
						}
					}
				}, true);
			}

			if (errorState !== null) {
				throw errorState;
			}

			try {
				var authorsStr = getAuthorsString(job.articleCreators);
			} catch (e) {
				authorsStr = "";
			}

			// Add the final file to job.tmpFiles already now so that if
			// conversion crashes or is canceled, the file will be removed
			// during cleanup.
			job.tmpFiles.push("converted" + job.id + ".pdf");

			try {
				yield new Promise(function(resolve, reject) {
					naclDoneCallback = resolve;
					naclErrCallback = reject;
					job.abortCurrentTask = reject;  //TODO: will removing the <module> element stop the k2pdfopt process?
					// It seems like we can post a message to the module even
					// before it is loaded and the message will be queued until
					// the module is ready. On the other hand, waiting for the
					// "load" event to fire doesn't work reliably.
					naclModule.postMessage({
						cmd: "k2pdfopt",
						args: job.onlyLoadK2pdfopt ? args : args.concat([
							"-o", "/temporary/converted" + job.id + ".pdf",
							"/temporary" + job.origPdfFile.fullPath
						]),
						options: {
							title: job.title,
							author: authorsStr
						}
					});
				});

				if (!job.onlyLoadK2pdfopt) {
					job.finalFile = yield PlatformTools.getTmpFile("converted" + job.id + ".pdf");
				}
			} catch (e) {
				if (job.jobType === 'page') {
					throw "Conversion failed. This may mean that Dontprint was unable to download the article. Maybe it is behind a captcha. Try to download the PDF manually, then go back to the article's abstract and click the Dontprint icon again.";
				} else {
					throw "Conversion failed";
				}
			} finally {
				delete job.abortCurrentTask;
				job.naclListenerDiv.parentNode.removeChild(job.naclListenerDiv);
				delete job.naclListenerDiv;
				// Event listeners are freed automatically
			}
		}
	};


	/**
	 * Loads k2pdfopt and then runs a dummy call on it. This should be called
	 * after an update or a fresh install of Dontprint so that k2pdfopt is
	 * loaded once. This will speed up all subsequent calls of k2pdfopt.
	 * @return {[type]} [description]
	 */
	Dontprint.loadK2pdfoptIntoCache = function() {
		let k2pdfopt = Dontprint.loadK2pdfopt({
			onlyLoadK2pdfopt: true,
			tmpFiles: []
		});
		Dontprint.platformTools.spawn(
			k2pdfopt,
			['-ui-', '-x', '-a-', '-?'],
			undefined,
			function() {}
		);
	};


	Dontprint.moveFileToDestDir = function(job, preferredFinalFilename) {
		return new Promise(function(resolve, reject) {
			chrome.downloads.download(
				{
					url: job.finalFile.toURL(),
					filename: preferredFinalFilename,
					conflictAction: "uniquify"
				},
				function(downloadId) {
					if (downloadId === undefined) {
						reject("Cannot find converted file.");
					} else {
						// item.filename will only be set when the download is done.
						// So we need to wait until the download is done.
						chrome.downloads.onChanged.addListener(downloadListener);

						// Nevertheless, check if the download is already done (In this
						// case, the onChange listener may never fire).
						chrome.downloads.search(
							{id: downloadId},
							function(downloadItems) {
								if (downloadItems[0].state ===  "complete") {
									chrome.downloads.onChanged.removeListener(downloadListener);
									downloadDoneHandler(downloadItems);
								} else if (downloadItems[0].state ===  "interrupted") {
									chrome.downloads.onChanged.removeListener(downloadListener);
									reject('Unable to move PDF file to your "Downloads" directory.');
								}
							}
						);
					}

					function downloadListener(downloadDelta) {
						if (downloadDelta.id === downloadId && downloadDelta.state) {
							if (downloadDelta.state.current ===  "complete") {
								chrome.downloads.onChanged.removeListener(downloadListener);
								chrome.downloads.search({id: downloadId}, downloadDoneHandler);
							} else if (downloadDelta.state.current ===  "interrupted") {
								chrome.downloads.onChanged.removeListener(downloadListener);
								reject('Unable to move PDF file to your "Downloads" directory.');
							}
						}
					}

					function downloadDoneHandler(downloadItems) {
						let item = downloadItems[0];
						
						let m = item.filename.match(/^(.*?)([^\\/]+)$/);
						job.result = {
							success: true,
							destDir: m[1],
							fileName: m[2],
							filePath: item.filename
						};
						resolve();
					}
				}
			);
		});
	};


	Dontprint.showFile = function(path) {
		PlatformTools.openTab({
			url: "file://" + path
		});
	};


	Dontprint.revealFile = function() {
		// Assumes the file is in the user's "Downloads" directory
		chrome.downloads.showDefaultFolder();
	};


	Dontprint.notifyJobStarted = Zotero.Connector_Browser.dontprintJobStarted;

	Dontprint.notifyJobDone = Zotero.Connector_Browser.dontprintJobDone;

	Dontprint.postTranslate = postTranslate;


	function getAuthorsString(creators) {
		switch (creators.length) {
		case 0:
			throw "error";
		
		case 1:
			return formatName(creators[0]);
		
		case 2:
			// two authors, separated by " and " without a comma
			return formatName(creators[0]) + " and " + formatName(creators[1]);
		
		case 3: //FALLTHRU
		case 4:
			// comma separated list, with comma before the ", and "
			var authorsStr = "";
			for (var i=0; i<creators.length-1; i++) {
				authorsStr += formatName(creators[i]) + ", ";
			}
			authorsStr += "and " + formatName(creators[creators.length-1]);
			return authorsStr;
		
		default: // too many authors to list them all
			return formatName(creators[0]) + " et al.";
		}
	}

	function formatName(creator) {
		if (!creator.lastName) {
			throw "error";
		}
		if (!creator.firstName) {
			return creator.lastName;
		}
		return creator.firstName + " " + creator.lastName
	}
});
