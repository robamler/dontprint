// Only create main object once
if (!Zotero.Zotero2kindle) {
	const loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
					.getService(Components.interfaces.mozIJSSubScriptLoader);
	loader.loadSubScript("chrome://zotero2kindle/content/zotero2kindle.js");
}
