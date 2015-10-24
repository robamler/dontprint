"use strict";

if (window.PlatformTools === undefined) {
	window.PlatformTools = {};
}


(function() {
	var tmpFilesystem = null;

	var publicInterface = {
		platform: "chrome",
		extensionScriptUrl,
		registerMainComponent,
		getPrefs,
		setPrefs,
		getTmpFile,
		saveTmpFileOrBlob,
		downloadTmpFile,
		rmTmpFiles,
		debug,
		xhr,
		postFile
	};

	for (let i in publicInterface) {
		PlatformTools[i] = publicInterface[i];
	}

	return;


	/**
	 * Return an absolute URL to a file that is packaged with the extension.
	 * @param  {string} relativePath
	 *         Path to the file, relative to chrome-platform.js
	 * @return {string}
	 *         An absolute URL to the file, which can be used in an XHR.
	 */
	function extensionScriptUrl(relativePath) {
		return chrome.runtime.getURL(relativePath);
	}


	/**
	 * Export a component of the extension to make it available to the rest
	 * of the extension under a given name. If the component has a member
	 * "init", it will be called once the component is exported. In this
	 * call, the execution context ("this") will be set to the component
	 * itself.
	 * Note that injected scripts cannot export components at this time.
	 * @param  {string} name
	 *         An identifier under which the component shall be exported.
	 *         Other parts of the system will be able to access the
	 *         component by passing this name to platform.getComponent().
	 * @param  {function} builder
	 *         A function that, when invoked without parameters, returns
	 *         the component object. This object's interface will be
	 *         made available to all other parts of the extension.
	 */
	function registerMainComponent(name, builder) {
		// On Google Chrome, each extension's background page runs in its
		// own execution context (window). So simply attach all exported
		// components to the background page's window object.
		let comp = builder();
		chrome.runtime.getBackgroundPage(function(bgpage) {
			bgpage[name] = comp;
			if (typeof comp.init === "function") {
				comp.init.call(comp);
			}
		});
	}


	/**
	 * Asynchroneously get a single or several preferences.
	 * @param  {object} keys
	 *         An object with keys and default values. The type of the
	 *         default value defines the type of the preference.
	 * @return {Promise}
	 *         Will be resolved with an object whose keys and values
	 *         correspond to the retrieved settings.
	 */
	function getPrefs(keys) {
		return new Promise(function(resolve, reject) {
			chrome.storage.sync.get(keys, function(ret) {
				if (chrome.runtime.lastError) {
					reject(chrome.runtime.lastError);
				} else {
					resolve(ret);
				}
			});
		});
	}


	/**
	 * Asynchroneously set preferences.
	 * @param  {object} items
	 *         Keys and values of the preferences to set.
	 * @return {Promise}
	 *         Will be resolved if the operation is successful and
	 *         rejected (with chrome.runtime.lastError) upon error.
	 */
	function setPrefs(keys) {
		return new Promise(function(resolve, reject) {
			chrome.storage.sync.set(keys, function() {
				if (chrome.runtime.lastError) {
					reject(chrome.runtime.lastError);
				} else {
					resolve();
				}
			});
		});
	}


	/**
	 * Get a handle to the temporary HTML5 filesystem. On the first call,
	 * delete all files in the filesystem.
	 * @private
	 * @return {Promise}
	 *         A promise that will be resolved with the HTML5 file system.
	 */
	function getTmpFilesystem() {
		return new Promise(function(resolve, reject) {
			if (tmpFilesystem !== null) {
				resolve(tmpFilesystem);
			} else {
				webkitRequestFileSystem(
					TEMPORARY, 15 * 1024 * 1024,
					function(fs) {
						let dirreader = fs.root.createReader();
						dirreader.readEntries(
							function processEntries(entries) {
								function deleteEntries() {
									if (entries.length == 0) {
										dirreader.readEntries(processEntries);
									} else {
										let entry = entries.pop();
										if (entry.isFile) {
											entry.remove(deleteEntries);
										} else if (entry.isDirectory) {
											entry.removeRecursively(deleteEntries);
										}
									}
								}

								if (entries.length == 0) {
									tmpFilesystem = fs;
									resolve(fs);
								} else {
									deleteEntries();
								}
							}
						);
					}
				),
				reject
			}
		});
	}


	function* saveTmpFileOrBlob(fileOrBlob, filename) {
		let entry = yield getTmpFile(filename, true);

		return new Promise(function(resolve, reject) {
			entry.createWriter(function(writer) {
				writer.onwriteend = function() {
					resolve(entry);
				}
				writer.onerror = reject;
				writer.write(fileOrBlob);
			});
		});
	}


	function* downloadTmpFile(url, targetFilename, progressListener) {
		let blob = yield new Promise(function(resolve, reject) {
			let req = PlatformTools.xhr();
			req.responseType = "blob";

			if (progressListener) {
				req.addEventListener("progress", function(evt) {
					if (evt.lengthComputable && evt.total>0) {
						progressListener(evt.loaded / evt.total);
					}
				}, false);
			}

			req.addEventListener("error", reject, false);

			req.onreadystatechange = function (evt) {
				if (req.readyState == 4) {
					if (req.status == 200) {
						resolve(req.response);
					} else {
						reject(req.status);
					}
				}
			};

			req.open("GET", url);
			req.send();
		});

		return yield PlatformTools.saveTmpFileOrBlob(blob, targetFilename);
	}


	function* getTmpFile(filename, create) {
		let fs = yield getTmpFilesystem();
		return new Promise(function(resolve, reject) {
			fs.root.getFile(filename, {create: !!create}, resolve, reject);
		});
	}


	function rmTmpFiles(files) {
		return new Promise(function(resolve, reject) {
			getTmpFilesystem().then(function(fs) {
				(function rmTmpFiles() {
					if (files.length === 0) {
						resolve();
					} else {
						let entry = files.pop();
						if (typeof entry === "string") {
							fs.root.getFile(
								entry, null,
								function(file) {
									file.remove(rmTmpFiles);
								},
								rmTmpFiles
							);
						} else if (typeof entry === "object" && entry.remove && typeof entry.remove === "function") {
							entry.remove(rmTmpFiles, rmTmpFiles);
						} else {
							rmTmpFiles();
						}
					}
				}());
			});
		});
	}


	/**
	 * Called when a script from a different execution context of the app
	 * connects to this one.
	 * @private
	 */
	function onConnect(port) {
		if (port.sender.id === chrome.runtime.id) {
			// Send a dummy message to signal successfull connection to
			// the other end.
			port.onMessage.addListener(onMessageOnPort);
			port.postMessage("connected");
		}
	}


	/**
	 * Print a debug message to the background page's console.
	 * @param  {any} msg
	 *         The debug message.
	 */
	function debug(msg) {
		console.log(msg);
	}


	/**
	 * Return a new XMLHttpRequest.
	 */
	function xhr() {
		return new XMLHttpRequest();
	}


	/**
	 * Start sending a file with a POST request.
	 * @param  {XMLHttpRequest} xhr
	 *         An XHR that is already set up with event handlers etc. but
	 *         not opened yet.
	 * @param  {HTML5 FileEntry} file
	 *         The file to send.
	 * @param  {string} url
	 *         The URL to which the POST request will be directed.
	 * @return {Promise}
	 *         A promise that will be resolved if the file could be
	 *         retrieved and the POST request could be initiated. This does
	 *         not guarantee that the POST request will succeed. To wait for
	 *         the POST request itself, set the onload handler of xhr *before*
	 *         calling this function. To monitor the upload progress, use the
	 *         "progress" handler of xhr.upload;
	 */
	function postFile(xhr, file, url) {
		return new Promise(function(resolve, reject) {
			file.file(
				function(file) {
					xhr.open('POST', url, true);
					xhr.send(file);
					resolve();
				},
				reject
			);
		});
	}
}());
