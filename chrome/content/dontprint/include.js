// Only create main object once
if (!Zotero.Dontprint) {
	const loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
					.getService(Components.interfaces.mozIJSSubScriptLoader);
	loader.loadSubScript("chrome://dontprint/content/dontprint.js");
}
