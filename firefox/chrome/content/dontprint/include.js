// Only create main object once
if (window.DontprintBrowser === undefined) {
	const loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
					.getService(Components.interfaces.mozIJSSubScriptLoader);
	loader.loadSubScript("chrome://dontprint/content/dontprint-browser.js");
}
