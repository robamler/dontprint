"use strict";

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
		let naclListenerDiv = bgpage.document.createElement("div");

		naclListenerDiv.addEventListener("error", function(evt) {
			errorState = "Unable to load k2pdfopt.";
			if (naclErrCallback !== null) {
				naclErrCallback(errorState);
			}
		}, true);
		naclListenerDiv.addEventListener("load", function(evt) {
			naclModuleLoaded = true;
		}, true);
		naclListenerDiv.addEventListener("crash", function(evt) {
			errorState = "K2pdfopt crashed.";
			if (naclErrCallback !== null) {
				naclErrCallback(errorState);
			}
		}, true);
		naclListenerDiv.addEventListener("message", onNaclMessage, true);

		let naclModule = bgpage.document.createElement("embed");
		naclListenerDiv.appendChild(naclModule);
		naclModule.setAttribute("width", 0);
		naclModule.setAttribute("height", 0);
		naclModule.setAttribute("path", ".");
		naclModule.setAttribute("src", "k2pdfopt/k2pdfopt.nmf");
		naclModule.setAttribute("type", "application/x-pnacl");

		bgpage.document.getElementsByTagName("body")[0].appendChild(naclListenerDiv);

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
				naclListenerDiv.addEventListener("progress", function(evt) {
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
						args: args.concat([
							"-o", "/temporary/converted" + job.id + ".pdf",
							"/temporary" + job.origPdfFile.fullPath
						]),
						options: {
							title: job.title,
							author: job.authorsStr === undefined ? "" : job.authorsStr
						}
					});
				});

				job.finalFile = yield PlatformTools.getTmpFile("converted" + job.id + ".pdf");
			} catch (e) {
				if (job.jobType === 'page') {
					throw "Conversion failed. This may mean that Dontprint was unable to download the article. Try to download the PDF manually, then go back to the article's abstract and click the Dontprint icon again.";
				} else {
					throw "Conversion failed";
				}
			} finally {
				delete job.abortCurrentTask;
				naclListenerDiv.parentNode.removeChild(naclListenerDiv);
				// Event listeners are freed automatically
			}
		}
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
});
