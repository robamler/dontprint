"use strict";

/**
 * Implementations of common interfaces for Google Chrome extensions.
 */
var PlatformTools = (function() {
	var tmpFilesystem = null;
	var exportedFunctions = {};
	var rpcPromises = {};
	var rpcCount = 0;
	var connection = null;

	chrome.runtime.onMessage.addListener(onMessageWithoutPort);
	chrome.runtime.onConnect.addListener(onConnect);

	return {
		extensionScriptUrl,
		getPrefs,
		setPrefs,
		saveTmpFileOrBlob,
		getTmpFile,
		exportFunctions,
		callRemote
	};


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
		let fs = yield this.getTmpFilesystem();

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
		let fs = yield this.getTmpFilesystem();
		job.finalFile = yield new Promise(function(resolve, reject) {
			fs.root.getFile(filename, {create: false}, resolve, reject);
		});
	}


	/**
	 * Export one or more functions so that they can be used from other
	 * scripts within the *same* extensions. To call a previously exported
	 * function, use callRemote();
	 * @param  {object} functions
	 *         An object that contains only fields of type "function".
	 *         These functions will be exported and the key will be used
	 *         as their function name.
	 */
	function exportFunctions(functions) {
		for (let key in functions) {
			exportedFunctions[key] = functions[key];
		}
	}


	/**
	 * Call a function that is defined in a diferent part of the extension
	 * and that has been exported using exportFunctions().
	 * @param  {string} funcName
	 *         The name of the function to call. This must be the same as
	 *         the key in the object that was passed to exportFunctions()
	 * @param  {zero or more values} args
	 *         Parameters to pass the function. Only Parameters that can
	 *         be JSONified are allowed.
	 * @return {Promise}
	 *         A promise that will be resolved with the return value of
	 *         the remote function.
	 */
	function callRemote(funcName, args) {
		if (connection === null) {
			connection = new Promise(function(resolve, reject) {
				let port = chrome.runtime.connect();
				// Wait until we receive a dummy message to be be sure
				// that the port is connected.
				port.onMessage.addListener(function onFirstMessage() {
					port.onMessage.removeListener(onFirstMessage);
					port.onMessage.addListener(onMessageOnPort);
					resolve(port);
					// Ignore the contenst of the message (it should
					// be a dummy message).
				});
			});
		}

		// Construct message outside of promise constructor so that
		// "arguments" refers to the correct object.
		let rpcId = rpcCount++;
		let message = {
			call: funcName,
			args: Array.prototype.slice.call(arguments, 1),
			callId: rpcId
		};
		return connection.then(function(port) {
			return new Promise(function(resolve, reject) {
				rpcPromises[rpcId] = {resolve, reject};
				port.postMessage(message);
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
	 * Called when a message is received on a port. This can be triggered
	 * by calling callRemote() from a different execution context;
	 * @private
	 */
	function onMessageOnPort(message, port) {
		if (typeof message === "object") {
			if (message.returnFrom !== undefined) {
				if (message.success) {
					rpcPromises[message.returnFrom].resolve(message.value);
				} else {
					rpcPromises[message.returnFrom].reject(message.error);
				}
				delete rpcPromises[message.returnFrom];
			} else if (message.call !== undefined && exportedFunctions[message.call]) {
				let p = new Promise(function(resolve, reject) {
					try {
						resolve(exportedFunctions[message.call].apply(undefined, message.args));
					} catch (e) {
						reject(e);
					}
				});
				p.then(
					function(value) {
						port.postMessage({
							returnFrom: message.callId,
							success: true,
							value
						});
					},
					function(error) {
						port.postMessage({
							returnFrom: message.callId,
							success: false,
							error: error.toString()
						});
					}
				);
			}
		}
	}


	/**
	 * Called when a message was received. TODO: This may be obsolete.
	 * @private
	 */
	function onMessageWithoutPort(message, sender, sendResponse) {
		if (sender.id === chrome.runtime.id) {
			onMessageOnPort(message, {postMessage: sendResponse});
		}
	};
}());
