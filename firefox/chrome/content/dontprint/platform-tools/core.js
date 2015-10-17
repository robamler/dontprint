"use strict";

if (typeof PlatformTools === "undefined") { //TODO
	var PlatformTools = {};
}


(function() {
	var publicInterface = {
		platform: "firefox",
		exportComponent,
		getExportedComponent,
		debug
	};

	for (let i in publicInterface) {
		PlatformTools[i] = publicInterface[i];
	}

	var exportedComponents = {};

	var console = Components.utils.import("resource://gre/modules/devtools/Console.jsm", {}).console;
	//var prefs = Components.classes["@mozilla.org/preferences-service;1"]
	// 				.getService(Components.interfaces.nsIPrefService)
	// 				.getBranch("extensions.dontprint.");

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
	 * @param  {function} builder
	 *         A function that, when invoked without parameters, returns
	 *         the component object. This object's interface will be
	 *         made available to all other parts of the extension.
	 */
	function exportComponent(name, builder) {
		exportedComponents[name] = builder();
	}


	function getExportedComponent(name) {
		return exportedComponents[name];
	}


	function debug(msg) {
		console.log(msg);
	}
}());
