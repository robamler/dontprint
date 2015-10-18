"use strict";

if (window.PlatformTools === undefined) {
	window.PlatformTools = {};
}


/**
 * Get a reference to a component of the same extension that has previously
 * been exported with PlatformTools.registerMainComponent(). Use this
 * function only outside of injected scripts.
 * @param  {string} name
 *         The name of the component to connect to. Must be the same name
 *         that was passed to PlatformTools.registerMainComponent() when
 *         the component was exported.
 * @param  {string} contractId
 *         The contract ID where the component can be reached on the
 *         Mozilla Firefox platform. This has to be registered in the
 *         the chrome.manifest file.
 * @return {Promise}
 *         A promise that will be resolved with the requested component.
 */
PlatformTools.getMainComponentInternally = function(name, contractId) {
	return new Promise(function(resolve, reject) {
		chrome.runtime.getBackgroundPage(function(bgpage) {
			resolve(bgpage[name]);
		});
	});
};
