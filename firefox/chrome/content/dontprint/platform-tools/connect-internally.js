"use strict";

if (typeof PlatformTools === "undefined") {
	var PlatformTools = {};
}


PlatformTools.getMainComponentInternally = function(name, contractId) {
	return Promise.resolve(Components.classes[contractId].getService().wrappedJSObject);
};
