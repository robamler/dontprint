"use strict";


if (window.PlatformTools === undefined) {
	window.PlatformTools = {};
}


/**
 * Get a reference to a component of the same extension that has previously
 * been exported with PlatformTools.exportComponent(). Use this function
 * only outside of injected scripts. 
 * @param  {string} name
 *         The name of the 
 * @return {Promise}
 *         A promise that will be resolved with the requested component.
 */
PlatformTools.getComponentInternally = function(name) {
	return new Promise(function(resolve, reject) {
		chrome.runtime.getBackgroundPage(function(bgpage) {
			resolve(bgpage[name]);
		});
	});
};
