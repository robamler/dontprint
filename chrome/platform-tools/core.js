"use strict";

if (window.PlatformTools === undefined) {
	window.PlatformTools = {};
}


(function() {
	var tmpFilesystem = null;
	var exportedFunctions = {};
	var rpcPromises = {};
	var rpcCount = 0;
	var connection = null;

	var publicInterface = {
		exportComponent,
		extensionScriptUrl,
		getPrefs,
		setPrefs,
		saveTmpFileOrBlob,
		getTmpFile
	};

	for (let i in publicInterface) {
		PlatformTools[i] = publicInterface[i];
	}

	return;


	/**
	 * Export a component of the extension to make it available to the rest
	 * of the extension under a given name. If the component has a member
	 * "init", it will be called once the component is exported. In this
	 * call, the execution context ("this") will be set to the component
	 * itself.
	 * Note taht injected scripts cannot export components at this time.
	 * @param  {string} name
	 *         An identifier under which the component shall be exported.
	 *         Other parts of the system will be able to access the
	 *         component by passing this name to platform.getComponent().
	 * @param  {object} comp
	 *         The component object. This object's interface will be
	 *         made available to all other parts of the extension.
	 */
	function exportComponent(name, comp) {
		// On Google Chrome, each extension's background page runs in its
		// own execution context (window). So simply attach all exported
		// components to the background page's window object.
		chrome.runtime.getBackgroundPage(function(bgpage) {
			bgpage[name] = comp;
			if (typeof comp.init === "function") {
				comp.init.call(comp);
			}
		});
	}


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
	 * Asynchroneously get a single or several preferences.
	 * @param  {string or array of string or object} keys
	 *         Either a single key (as a string) or an array of keys
	 *         or an object with keys and default values.
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
		let fs = yield getTmpFilesystem();

		let entry = yield new Promise(function(resolve, reject) {
			fs.root.getFile(filename, {create: true}, resolve, reject);
		});

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


	function* getTmpFile(filename) {
		let fs = yield getTmpFilesystem();
		return new Promise(function(resolve, reject) {
			fs.root.getFile(filename, {create: false}, resolve, reject);
		});
	}


	function rmTmpFiles(filenames) {
		return new Promise(function(resolve, reject) {
			getTmpFilesystem().then(function(fs) {
				(function rmTmpFiles() {
					if (filenames.length === 0) {
						resolve();
					} else {
						let entry = filenames.pop();
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
}());
