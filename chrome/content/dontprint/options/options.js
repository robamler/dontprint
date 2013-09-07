Components.utils.import("resource://gre/modules/Task.jsm");
try {
	// Gecko >= 25
	Components.utils.import("resource://gre/modules/Promise.jsm");
} catch (e) {
	try {
		// Gecko 21 to 24
		Components.utils.import("resource://gre/modules/commonjs/sdk/core/promise.js");
	} catch (e) {
		// Gecko 17 to 20
		Components.utils.import("resource://gre/modules/commonjs/promise/core.js");
	}
}
var Dontprint = Components.classes['@robamler.github.com/dontprint;1'].getService().wrappedJSObject;

var conn = null;
var k2pdfoptInstalledVersion = "0";
var k2pdfoptNewVersion = "0";
var platform = Dontprint.getPrefs().getCharPref("k2pdfoptPlatform");
var journalFilters = null;
var selectedFilter = null;
var originalSelectedFilter = null;
var journalFilterList;
var nextJournalFilterNumber = 0;

if (platform.substr(0,7) === "unknown") {
	platform = "src";
	document.getElementById("updateK2pdfoptButton").style.display = "none";
}


function onLoad() {
	emailSuffixChange();
	ccEmailsCheckboxChange();
	getK2pdfoptVersion();
}


function onUnload() {
	saveOldSelection().then(conn.close, conn.close);
	
	document.getElementById("deviceIframe").contentWindow.screenSettingsChange();
	if (
		Dontprint.getPrefs().getCharPref("kindleModel") !== "other" &&
		document.getElementById("deviceIframe").contentWindow.document.getElementById("sendScreenSettigns").checked
	) {
		Dontprint.reportScreenSettings();
	}
}


// E-MAIL TAB =====================================================

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


// ADVANCED TAB ===================================================

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
	req.open("get", "http://robamler.github.com/dontprint/k2pdfopt/versions.json", true);
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


// MARGINS TAB ====================================================


function marginsPaneLoad() {
	journalFilterList = document.getElementById("journal-list");
	Task.spawn(loadJournalFilters);
}


function loadJournalFilters() {
	conn = yield Dontprint.getDB();
	var sqlresult = yield conn.execute("SELECT id, longname, shortname, minDate, maxDate, m1, m2, m3, m4, coverpage, k2pdfoptParams FROM journals WHERE enabled=1 ORDER BY priority DESC, lastModified DESC");
	
	var fields = ["id", "longname", "shortname", "minDate", "maxDate",  "coverpage", "k2pdfoptParams"];
	var floatFields = ["m1", "m2", "m3", "m4"];
	
	nextJournalFilterNumber = 0;
	journalFilters = {};
	sqlresult.forEach(function(sqlentry) {
		var j = {enabled:1};
		fields.forEach(function(key) {
			j[key] = sqlentry.getResultByName(key);
		});
		floatFields.forEach(function(key) {
			j[key] = parseFloat(sqlentry.getResultByName(key)).toFixed(1);
		});
		journalFilterList.appendItem(getJournalFilterLabel(j), nextJournalFilterNumber);
		journalFilters[nextJournalFilterNumber] = j;
		nextJournalFilterNumber++;
	});
	
	journalFilterList.selectItem(journalFilterList.getItemAtIndex(0));
}


function getJournalFilterLabel(j) {
	var ret;
	if (j.longname) {
		if (j.shortname) {
			ret = j.longname + " (" + j.shortname + ")";
		} else {
			ret = j.longname;
		}
	} else {
		if (j.shortname) {
			ret = j.shortname;
		} else {
			return "(invalid filter)";
		}
	}
	
	if (j.minDate) {
		if (j.maxDate) {
			ret += " [from " + formatDate(j.minDate) + " to " + formatDate(j.maxDate) + "]";
		} else {
			ret += " [since " + formatDate(j.minDate) + "]";
		}
	} else {
		if (j.maxDate) {
			ret += " [until " + formatDate(j.maxDate) + "]";
		}
	}
	
	return ret;
}


function formatDate(dateint) {
	if (!dateint) {
		return null;
	} else {
		return dateint.toString().replace(/^([+-]?\d{1,4})(\d\d)(\d\d)$/, "$1-$2-$3");
	}
}


function deformatDate(datestr) {
	return parseFloat(datestr.replace(/^([+-]?\d{1,4})-(\d\d)-(\d\d)$/, "$1$2$3"));
}


function journalFilterSelect() {
	saveOldSelection();
	
	selectedFilter = journalFilters[journalFilterList.value];
	originalSelectedFilter = {};
	var fields = ["id", "enabled", "longname", "shortname", "minDate", "maxDate", "m1", "m2", "m3", "m4", "coverpage", "k2pdfoptParams"];
	fields.forEach(function(key) {
		originalSelectedFilter[key] = selectedFilter[key];
	});
	
	document.getElementById("longname_control").value = selectedFilter.longname;
	document.getElementById("shortname_control").value = selectedFilter.shortname;
	document.getElementById("minDate_switch").checked = selectedFilter.minDate!==0;
	document.getElementById("minDate_control").disabled = selectedFilter.minDate===0;
	if (selectedFilter.minDate !== 0) {
		document.getElementById("minDate_control").value = formatDate(selectedFilter.minDate);
	} else {
		document.getElementById("minDate_control").dateValue = new Date();
	}
	document.getElementById("maxDate_switch").checked = selectedFilter.maxDate!==0;
	document.getElementById("maxDate_control").disabled = selectedFilter.maxDate===0;
	if (selectedFilter.maxDate !== 0) {
		document.getElementById("maxDate_control").value = formatDate(selectedFilter.maxDate);
	} else {
		document.getElementById("maxDate_control").dateValue = new Date();
	}
	document.getElementById("m1_control").value = selectedFilter.m1;
	document.getElementById("m2_control").value = selectedFilter.m2;
	document.getElementById("m3_control").value = selectedFilter.m3;
	document.getElementById("m4_control").value = selectedFilter.m4;
	document.getElementById("coverpage_control").checked = selectedFilter.coverpage;
	document.getElementById("k2pdfoptParams_control").value = selectedFilter.k2pdfoptParams;
}


function dateSwitchClicked(minmax, checked) {
	document.getElementById(minmax + "Date_control").disabled = !checked;
	updateSelectedFilter();
}


function updateSelectedFilter() {
	var thenindex = journalFilterList.currentIndex;
	var thenselectedFilter = selectedFilter;
	// set timeout to work around bug 799
	setTimeout(function() {
		updateVisibleFilterData(thenselectedFilter);
		journalFilterList.getItemAtIndex(thenindex).label = getJournalFilterLabel(thenselectedFilter);
	}, 0);
}


function updateVisibleFilterData(sel) {
	if (!sel) {
		sel = selectedFilter;
	}
	sel.longname = document.getElementById("longname_control").value.trim();
	sel.shortname = document.getElementById("shortname_control").value.trim();
	sel.minDate = document.getElementById("minDate_switch").checked ? deformatDate(document.getElementById("minDate_control").value) : 0;
	sel.maxDate = document.getElementById("maxDate_switch").checked ? deformatDate(document.getElementById("maxDate_control").value) : 0;
}


function saveOldSelection() {
	if (!selectedFilter) {
		return;
	}
	
	updateVisibleFilterData(); // sets longname, shortname, minDate, maxDate
	selectedFilter.m1 = document.getElementById("m1_control").valueNumber.toFixed(1);
	selectedFilter.m2 = document.getElementById("m2_control").valueNumber.toFixed(1);
	selectedFilter.m3 = document.getElementById("m3_control").valueNumber.toFixed(1);
	selectedFilter.m4 = document.getElementById("m4_control").valueNumber.toFixed(1);
	selectedFilter.coverpage = document.getElementById("coverpage_control").checked;
	selectedFilter.k2pdfoptParams = document.getElementById("k2pdfoptParams_control").value;
	
	// see if anything has been changed (this is necessary because we would
	// otherwise delete builtin journals without a reason and also update
	// the lastModified timestamp.)
	var equal = true;
	for (key in selectedFilter) {
		// we really need != and not !== here because Sqlite returns everything as string
		if (originalSelectedFilter[key] != selectedFilter[key]) {
			equal = false;
			break;
		}
	}
	
	if (!equal) {
		return Dontprint.saveJournalSettings(conn, selectedFilter);
	} else {
		return Promise.resolve();
	}
}


function newJournalFilter() {
	saveOldSelection();
	selectedFilter = null;
	
	journalFilters[nextJournalFilterNumber] = {
		id:0, enabled:1, longname:"", shortname:"", minDate:0, maxDate:0,
		m1:5, m2:5, m3:5, m4:5, coverpage:0, k2pdfoptParams:""
	};
	journalFilterList.insertItemAt(0, "(new filter)", nextJournalFilterNumber);
	nextJournalFilterNumber++;
	journalFilterList.selectItem(journalFilterList.getItemAtIndex(0));
	journalFilterSelect();
	document.getElementById("longname_control").focus();
}


function deleteJournalFilter() {
	if (!selectedFilter) {
		return;
	}
	
	Dontprint.deleteJournalSettings(conn, selectedFilter.id, false);
	selectedFilter = null;
	var index = journalFilterList.currentIndex;
	delete journalFilters[journalFilterList.value];
	journalFilterList.removeItemAt(index);
	journalFilterList.selectItem(journalFilterList.getItemAtIndex(0));
	journalFilterSelect();
}
