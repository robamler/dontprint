"use strict";

if (window.PlatformTools === undefined) {
	window.PlatformTools = {};
}


(function() {
	var publicInterface = {
		extensionScriptUrl,
		openTab
	};

	for (let i in publicInterface) {
		PlatformTools[i] = publicInterface[i];
	}

	return;


	function stripHash(url) {
		let m = url.match(/^(.*)#/);
		if (m) {
			return m[1];
		} else {
			return url;
		}
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
	 * Open a tab with a given URL. If a tab with the given URL already
	 * exists, then, depending on parameters, either another tab with
	 * the same URL is opened or the existing tab is reused.
	 * @param  {object} options
	 *         An object with the following parameters:
	 *         * url: A (relative or absolute) URL to display in the
	 *           new tab
	 *         * openerTab: [optional] Tab (on chrome: tab id) from
	 *           which the action that provoked this call was initiated.
	 *           If a new tab will be opened, then it will be placed
	 *           in the same window as the existing one. Defaults to the
	 *           last active tab.
	 *         * singleton: [optional] Boolean value. If set to true,
	 *           then no new tab will be opened if a tab with the same
	 *           url (up to hash strings) is already opened in the same
	 *           browser window. Defaults to false.
	 *         * globalSingleton: [optional] Boolean value. Only
	 *           effective if singleton is true. Extends the search for
	 *           existing tabs with the requested URL to all browser
	 *           windows. Defaults to false.
	 *         * inBackground: [optional] If set to true, then the new
	 *           tab will be opened in the background (if singleton is
	 *           true and a tab exists, then setting inBackground to
	 *           true prevents the existing tab from being activated.)
	 *           Defaults to false.
	 * @return {Promise}
	 *         A promise that will be resolved with the opened tab.
	 */
	function openTab(options) {
		return PlatformTools.spawn(function*() {
			let absUrl = PlatformTools.extensionScriptUrl(options.url);

			let openerTab = yield new Promise(function(res, rej) {
				if (typeof options.openerTab !== "undefined") {
					chrome.tabs.get(options.openerTab, res); 
				} else {
					chrome.tabs.getCurrent(res);
				}
			});

			if (options.singleton) {
				let existing = yield new Promise(function(res, rej) {
					let queryUrl = stripHash(absUrl);
					let queryargs = {
						url: [queryUrl, queryUrl + "#*"]
					};
					if (openerTab && !options.globalSingleton) {
						queryargs.windowId = openerTab.windowId;
					}
					chrome.tabs.query(queryargs, res);
				});

				if (existing.length) {
					if (!options.inBackground && openerTab && existing[0].windowId !== openerTab.windowId) {
						existing[0] = yield new Promise(function(res, rej) {
							chrome.tabs.move(
								existing[0].id,
								{
									windowId: openerTab.windowId,
									index: openerTab.index + 1
								},
								res
							);
						});
					}

					if (!options.inBackground) {
						chrome.tabs.highlight({
							windowId: existing[0].windowId,
							tabs: existing[0].index
						});
					}
					return existing[0].id;
				}
			}

			let openargs = {
				url: absUrl,
				active: !options.inBackground,
			};
			if (openerTab) {
				openargs.index = openerTab.index + 1;
				openargs.windowId = openerTab.windowId;
			}
			return new Promise(function(res, rej) {
				chrome.tabs.create(openargs, res);
			});
		});
	}
}());
