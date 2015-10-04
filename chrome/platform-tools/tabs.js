"use strict";

if (window.PlatformTools === undefined) {
	window.PlatformTools = {};
}


(function() {
	var publicInterface = {
		openTab,
		openSingletonTab
	};

	for (let i in publicInterface) {
		PlatformTools[i] = publicInterface[i];
	}

	return;


	/**
	 * Open a tab with a given URL.
	 * @param  {string} url
	 *         The url to open. This may be an absolute or a relative URL.
	 * @param  {integer} openerTabId
	 *         Optional. Id of a tab from which the request to open a new
	 *         originated. If provided, the new tab will be opened in the
	 *         same browser window and displayed next to the opener tab.
	 * @return {Promise}
	 *         A promise that will be resolved with the opened tab.
	 */
	function openTab(url, windowId, openerTabId, active) {
		return new Promise(function(res, rej) {
			chrome.tabs.get(openerTabId, res);
		}).then(function(openertab) {
			let openargs = {windowId, active, url};
			if (openertab) {
				openargs.index = openertab.index + 1;
			}
			return new Promise(function(res, rej) {
				chrome.tabs.create(openargs, res);
			});
		});
	}


	/**
	 * Open a tab with a given URL. If a tab with the given URL is already
	 * open, highlight the existing tab instead.
	 * @param  {string} url
	 *         The url to open. This may be an absolute or a relative URL.
	 * @param  {integer} openerTabId
	 *         Optional. Id of a tab from which the request to open a new
	 *         originated. If provided, the new tab will be opened in or
	 *         moved to the same browser window and displayed next to the
	 *         opener tab.
	 * @param  {boolean} globalSingleton
	 *         Optional. Set to true if there should be only one tab with
	 *         this URL in the entire browser application. Set to false if
	 *         several tabs with this URL distributed over different
	 *         browser windows are allowed. Defaults to false if
	 *         openerTabId is provided and true otherwise.
	 * @return {Promise}
	 *         A promise that will be resolved with the ID of the opened
	 *         (or moved) tab.
	 */
	function openSingletonTab(url, openerTabId, globalSingleton) {
		return PlatformTools.spawn(function*() {
			let openargs = {url};
			let openerTab = null;

			if (openerTabId !== undefined) {
				openerTab = yield new Promise(function(res, rej) {
					chrome.tabs.get(openerTabId, res);
				});
			}

			if (openerTab || globalSingleton) {
				// check if we can reuse an existing progress tab in this window
				let existing = yield new Promise(function(res, rej) {
					let absUrl = chrome.extension.getURL(url);
					let queryargs = {
						url: [absUrl, absUrl + "#*"]
					};
					if (openerTab && !globalSingleton) {
						queryargs.windowId = openerTab.windowId;
					}
					chrome.tabs.query(queryargs, res);
				});

				if (existing.length) {
					console.log(existing[0]);
					if (openerTab && existing[0].windowId !== openerTab.windowId) {
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
					chrome.tabs.highlight({
						windowId: existing[0].windowId,
						tabs: existing[0].index
					});
					return existing[0].id;
				}
			}

			if (openerTab) {
				openargs.windowId = openerTab.windowId;
				openargs.index = openerTab.index + 1;
			}

			return new Promise(function(reject, resolve) {
				chrome.tabs.create(
					openargs,
					function(tab) {
						resolve(tab.id);
					}
				);
			});
		});
	}
}());
