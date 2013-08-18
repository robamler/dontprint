var Dontprint = Components.classes["@mozilla.org/appshell/window-mediator;1"]
				.getService(Components.interfaces.nsIWindowMediator)
				.getMostRecentWindow("navigator:browser").Dontprint;
var k2pdfoptInstalledVersion = "0";
var k2pdfoptNewVersion = "0";
var platform = Dontprint.getPrefs().getCharPref("k2pdfoptPlatform");
if (platform.substr(0,7) === "unknown") {
	platform = "src";
	document.getElementById("updateK2pdfoptButton").style.display = "none";
}


// GENERAL TAB ====================================================

function emailSuffixChange() {
	let other = document.getElementById("emailSuffix_control").value === "other";
	document.getElementById("emailPrefix_control").disabled = other;
	document.getElementById("otherEmailRow").style.display = other ? "" : "none";
	
	if (other) {
		window.sizeToContent();
		if (!document.getElementById("otherEmail_control").value) {
			let startval = document.getElementById("emailPrefix_control").value;
			if (startval) {
				document.getElementById("otherEmail_control").value = startval + "@";
				document.getElementById("otherEmail_control").setSelectionRange(startval.length+1, startval.length+1);
			}
		}
		document.getElementById("otherEmail_control").focus();
	}
}


function ccEmailsCheckboxChange() {
	var checked = document.getElementById("ccEmails_switch").checked;
	document.getElementById("ccEmails_control").disabled = !checked;
	if (checked) {
		document.getElementById("ccEmails_control").focus();
	}
}


function sendTestPage() {
	var response = confirm(
		"Dontprint can send a small document to your Kindle to test your e-mail settings. Would you like to send this document now?"
	);
	if (response) {
		var btn = document.getElementById("sendTestPageButton");
		btn.disabled = true;
		btn.label = "Sending document...";
		Dontprint.sendTestEmail(function() {
			btn.label = "Document sent.";
		});
	}
}


function getK2pdfoptVersion() {
	function onFound(versionString) {
		k2pdfoptInstalledVersion = versionString;
		document.getElementById("k2pdfoptInstalledVersion").value = "version " + versionString;
		document.getElementById("checkForK2pdfoptUpdateButton").disabled = false;
	};
	function onNotFound() {
		k2pdfoptInstalledVersion = "0";
		document.getElementById("k2pdfoptInstalledVersion").value = "(Error: k2pdfopt not found)";
		checkForK2pdfoptUpdate();
	};
	
	// have to set style.display programmatically; if it's set in css file, resetting it by JavaScript later on fails.
	document.getElementById("k2pdfoptUpdateInformation").style.display = "none";
	document.getElementById("k2pdfoptUpdateManuallyInstructions").style.display = "none";
	
	Dontprint.detectK2pdfoptVersion(null, onFound, onNotFound, onNotFound, onNotFound);
}


function checkForK2pdfoptUpdate() {
	document.getElementById("checkForK2pdfoptUpdateButton").disabled = true;
	document.getElementById("checkForK2pdfoptUpdateButton").label = "Checking for updates...";
	
	function reqListener() {
		k2pdfoptNewVersion = JSON.parse(this.responseText).k2pdfoptVersions[platform];
		if (Dontprint.compareVersionStrings(k2pdfoptNewVersion, k2pdfoptInstalledVersion) > 0) {
			document.getElementById("checkForK2pdfoptUpdateButton").style.display = "none";
			document.getElementById("k2pdfoptUpdateVersion_label").value = "version " + k2pdfoptNewVersion;
			document.getElementById("k2pdfoptUpdateInformation").style.display = "";
			sizeToContent();
		} else {
			document.getElementById("checkForK2pdfoptUpdateButton").label = "No update available.";
		}
	}
	
	var req = new XMLHttpRequest();
	req.onload = reqListener;
	req.open("get", "http://robamler.github.com/dontprint/k2pdfopt/versions.json", true);	//TODO: url
	req.send();
}


function updateK2pdfopt() {
	document.getElementById("updateK2pdfoptButton").style.display = "none";
	document.getElementById("updateK2pdfoptManuallyButton").style.display = "none";
	let statusDisplay = document.getElementById("k2pdfoptInstalledVersion");
	statusDisplay.value = "K2pdfopt is being updated to version " + k2pdfoptNewVersion + " in the background...";
	
	try {
		// This can only be reached if platform is not "unknown.*". Therefore,
		// the old version of k2pdfopt must have been originally downloaded
		// by Dontprint, so we may delete it.
		Dontprint.deleteFile(Dontprint.getPrefs().getCharPref("k2pdfoptPath"));
	} catch (e) {
		// ignore
	}
	// set k2pdfoptPath to "" to make sure download continues on browser restart
	Dontprint.getPrefs().setCharPref("k2pdfoptPath", "");
	
	Dontprint.downloadK2pdfopt(
		function onProgress(prog) {
			statusDisplay.value = "K2pdfopt is being updated to version " + k2pdfoptNewVersion + " in the background (" + Math.round(prog*100) + "%)...";
			console.log(statusDisplay.value);
		},
		function onSuccess() {
			statusDisplay.value = "Update to version " + k2pdfoptNewVersion + " completed.";
		}
	);
}


function updateK2pdfoptManually() {
	document.getElementById("updateK2pdfoptButton").style.display = "none";
	document.getElementById("updateK2pdfoptManuallyButton").style.display = "none";
	document.getElementById("k2pdfoptUpdateManuallyInstructions").style.display = "";	
	sizeToContent();
}


function onLoad() {
	emailSuffixChange();
	ccEmailsCheckboxChange();
	getK2pdfoptVersion();
}


function onUnload() {
	document.getElementById("deviceIframe").contentWindow.screenSettingsChange();
	if (
		Dontprint.getPrefs().getCharPref("kindleModel") !== "other" &&
		document.getElementById("deviceIframe").contentWindow.document.getElementById("sendScreenSettigns").checked
	) {
		Dontprint.reportScreenSettings();
	}
}