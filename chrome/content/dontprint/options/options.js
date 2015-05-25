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
var verifiedEmails = JSON.parse(Dontprint.getPrefs().getCharPref("verifiedEmails"));

if (platform.substr(0,7) === "unknown") {
	platform = "src";
	document.getElementById("updateK2pdfoptButton").style.display = "none";
}


function onLoad() {
	updateTransferTab();
	getK2pdfoptVersion();
}


function onUnload() {
	var savePromise = saveOldSelection();
	if (savePromise !== undefined) {
		// Just passing conn.close() won't work (throws: "this" is undefined)
		savePromise.then(function() {conn.close();}, function() {conn.close();});
	} else {
		try {
			conn.close();
		} catch (e) { }
	}
	document.getElementById("deviceIframe").contentWindow.screenSettingsChange();
	if (document.getElementById("deviceIframe").contentWindow.document.getElementById("sendScreenSettigns").checked) {
		var modelname = null;
		if (Dontprint.getPrefs().getCharPref("kindleModel") === "other") {
			modelname = "other:" + document.getElementById("deviceIframe").contentWindow.document.getElementById("otherEreaderModelInput").value;
		}
		Dontprint.reportScreenSettings(modelname);
	}
	journalFilters = null;	// free memory
	return true;
}


function onBeforeAccept() {
	let textbox = document.getElementById("verificationCode");
	if (textbox.getAttribute("focused") && /^\d{4}$/.test(textbox.value)) {
		// It is likely that the user did not want to close the dialog but instead
		// hit the enter key after typing in the verification code.
		// TODO: Test with FF29 (because of Mozilla bug 474527)
		sendVerificationCodeBtn.focus();
		verifyEmailAddress();
		return false;
	}
	
	return true;
}



// TRANSFER TAB ===================================================

/**
 * Needs to be called before sending test e-mails so that current changes
 * are saved on Windows.
 */
function saveEmailSettings() {
	Dontprint.getPrefs().setCharPref("recipientEmailPrefix", document.getElementById("emailPrefix_control").value);
	Dontprint.getPrefs().setCharPref("recipientEmailSuffix", document.getElementById("emailSuffix_control").value);
	Dontprint.getPrefs().setCharPref("recipientEmailOther", document.getElementById("otherEmail_control").value);
}

function sendTestPage() {
	var response = confirm(
		"Dontprint can send a small document to your e-reader to test your e-mail settings. Would you like to send this document now?"
	);
	if (response) {
		var btn = document.getElementById("sendTestPageButton");
		btn.disabled = true;
		btn.label = "Sending document...";
		saveEmailSettings();
		Dontprint.sendTestEmail(function() {
			btn.label = "Document sent.";
		});
	}
}

function updateTransferTab(focus) {
	let tmethod = document.getElementById("transferMethodSelect").selectedIndex;
	let emailtransfer = tmethod === 0;
	let directorytransfer = tmethod === 1;
	
	// Enable/disable controls
	// Always disable hidden elements so that setting focus works propperly
	let othersuffix = document.getElementById("emailSuffix_control").value === "other";
	let postTransferCommandChecked = document.getElementById("postTransferCommand_switch").checked;
	document.getElementById("emailExplanationLabel").disabled = !emailtransfer;
	document.getElementById("emailExplanationLink").disabled = !emailtransfer;
	document.getElementById("emailPrefixLabel").disabled = !emailtransfer;
	document.getElementById("emailPrefix_control").disabled = othersuffix || !emailtransfer;
	document.getElementById("emailSuffix_control").disabled = !emailtransfer;
	document.getElementById("otherEmail_control").disabled = !othersuffix || !emailtransfer;
	// Disabling a <description> element unfortunately shows no visible effect
	document.getElementById("sendTestPageButton").disabled = !emailtransfer;
	document.getElementById("destDirLabel").disabled = !directorytransfer;
	document.getElementById("destDir_control").disabled = !directorytransfer;
	document.getElementById("destDirChooser").disabled = !directorytransfer;
	document.getElementById("postTransferCommand_switch").disabled = !directorytransfer;
	document.getElementById("postTransferCommand_control").disabled = !postTransferCommandChecked || !directorytransfer;
	document.getElementById("postTransferCommandLabel").disabled = !directorytransfer;

	// Display/hide controls and set default values;
	document.getElementById("otherEmailRow").style.display = othersuffix ? "" : "none";
	if (othersuffix) {
		window.sizeToContent();
	}
	
	let curEmail = (othersuffix ?
		document.getElementById("otherEmail_control").value :
		document.getElementById("emailPrefix_control").value + document.getElementById("emailSuffix_control").value
	);
	let verified = verifiedEmails.indexOf(curEmail.toLocaleLowerCase()) !== -1;
	if (!verified) {
		document.getElementById("verificaionProgressLabel1").value = "(Dontprint will send a small document with a four-digit code to your device.";
		document.getElementById("verificaionProgressLabel2").value = "The e-mail will be sent from noreply@dontprint.net.)";
		document.getElementById("sendVerificationCodeBtn").disabled = false;
		document.getElementById("sendVerificationCodeBtn").label = "Send verification code now.";
	}
	document.getElementById("verificationStatusLabel").className = verified ? "verificationOk" : "verificationNotOk";
	document.getElementById("verificationStatusLabel").value = verified ? "E-mail address verified." : "Verification required.";
	document.getElementById("sendVerificationCodeBtn").style.visibility = verified ? "hidden" : "visible";
	document.getElementById("verificationProgressRow").style.visibility = verified ? "hidden" : "visible";
	document.getElementById("verificationCodeRow").style.visibility = verified ? "hidden" : "visible";
	document.getElementById("sendVerificationCodeBtn").disabled = false;
	
	// Set Focus
	let focusedElement = undefined;
	if (focus !== undefined) {
		let focusarr = focus.split(',');
		for (let i=0; i<focusarr.length; i++) {
			let el = document.getElementById(focusarr[i]);
			if (!el.disabled) {
				focusedElement = focusarr[i];
				document.getElementById(focusedElement).focus();
				break;
			}
		}
	}
	
	// Give a hint for the format required by "otherEmail_control" and set cursor position
	if (focusedElement === "otherEmail_control" && !document.getElementById("otherEmail_control").value) {
		let startval = document.getElementById("emailPrefix_control").value;
		if (startval) {
			document.getElementById("otherEmail_control").value = startval + "@";
			document.getElementById("otherEmail_control").setSelectionRange(startval.length+1, startval.length+1);
		}
	}
	
	// Use the user's desktop directory as default destination directory
	if (document.getElementById("destDir_control").value === "") {
		let path = Components.classes["@mozilla.org/file/directory_service;1"].
					getService(Components.interfaces.nsIProperties).
					get("Desk", Components.interfaces.nsIFile).
					path;
		document.getElementById("destDir_control").value = path;
		// The preference isn't updated automatically when the corresponding
		// control is set programatically. We have to update it manually.
		document.getElementById("destDir_symbol").value = path;
	}
}

function sendVerificationCode() {
	saveEmailSettings();
	document.getElementById("sendVerificationCodeBtn").disabled = true;
	document.getElementById("verificaionProgressLabel1").value = "Sending verification code. Please wait...";
	document.getElementById("verificaionProgressLabel2").value = "";
	document.getElementById("verificationCode").value = "";
	document.getElementById("verificationCode").focus();
	Dontprint.sendVerificationCode(
		function success(email, returncode, message) {
			if (returncode === 0) {
				document.getElementById("verificaionProgressLabel1").value = "Verification code sent. Please wait until the document arrives on";
				document.getElementById("verificaionProgressLabel2").value = "your e-reader and then enter the code below.";
				document.getElementById("sendVerificationCodeBtn").disabled = false;
				document.getElementById("sendVerificationCodeBtn").label = "Resend verification code.";
			} else if (returncode === 1) {
				Dontprint.rememberVerifiedEmail(email);
				verifiedEmails.unshift(email.toLocaleLowerCase());
				updateTransferTab();
			}
		},
		function error(email, errno, message) {
			document.getElementById("sendVerificationCodeBtn").disabled = false;
			document.getElementById("verificaionProgressLabel1").value = "Error: " + message;
			document.getElementById("verificaionProgressLabel2").value = "";
		},
		function failure(email, xhr) {
			document.getElementById("sendVerificationCodeBtn").disabled = false;
			document.getElementById("verificaionProgressLabel1").value = "Error: unable to connect to the Dontprint server."
			document.getElementById("verificaionProgressLabel2").value = "Are you connected to the internet?";
		}
	);
}

function verifyEmailAddress() {
	let code = document.getElementById("verificationCode").value;
	if (! /^\d{4}$/.test(code)) {
		alert("The verification code must consist of four digits.");
		document.getElementById("verificationCode").focus();
		return;
	}
	saveEmailSettings()
	document.getElementById("verificationConfirmBtn").disabled = true;
	document.getElementById("verificaionProgressLabel1").value = "Checking verification code. Please wait...";
	document.getElementById("verificaionProgressLabel2").value = "";
	Dontprint.verifyEmailAddress(
		code,
		function success(email, returncode, message) {
			document.getElementById("verificationCode").value = "";
			document.getElementById("verificationConfirmBtn").disabled = false;
			Dontprint.rememberVerifiedEmail(email);
			verifiedEmails.unshift(email.toLocaleLowerCase())
			updateTransferTab();
		},
		function error(email, errno, message) {
			document.getElementById("verificationConfirmBtn").disabled = false;
			document.getElementById("verificaionProgressLabel1").value = "Error: " + message;
			document.getElementById("verificaionProgressLabel2").value = "";
		},
		function failure(email, xhr) {
			document.getElementById("verificationConfirmBtn").disabled = false;
			document.getElementById("verificaionProgressLabel1").value = "Error: unable to connect to the Dontprint server."
			document.getElementById("verificaionProgressLabel2").value = "Are you connected to the internet?";
		}
	);
}


function chooseDestDir() {
	const nsIFilePicker = Components.interfaces.nsIFilePicker;
	const nsILocalFile = Components.interfaces.nsILocalFile;
	let fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
	fp.init(window, "Select directory to save converted PDF files", nsIFilePicker.modeGetFolder);
	try {
		let f = Components.classes["@mozilla.org/file/local;1"].createInstance(nsILocalFile);
		f.initWithPath(document.getElementById("destDir_control").value);
		fp.displayDirectory = f;
	} catch (e) {}
	let rv = fp.show();
	if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace) {
		document.getElementById("destDir_control").value = fp.file.path;
		// The preference isn't updated automatically when the corresponding
		// control is set programatically. We have to update it manually.
		document.getElementById("destDir_symbol").value = fp.file.path;
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
	req.open("get", "http://dontprint.net/k2pdfopt/versions.json", true);
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
		var el = journalFilterList.appendItem(getJournalFilterLabel(j), nextJournalFilterNumber);
		if (j.id < 0) {
			el.className = "builtin";
		}
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
	// set timeout to work around bug 799 of Firefox
	setTimeout(function() {
		updateVisibleFilterData(thenselectedFilter);
		var item = journalFilterList.getItemAtIndex(thenindex);
		item.label = getJournalFilterLabel(thenselectedFilter);
		item.className = "";  // the filter was changed by the user, so it's not going to be saved as a builtin filter any more
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
	for (var key in selectedFilter) {
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
		enabled:1, longname:"", shortname:"", minDate:0, maxDate:0,
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
