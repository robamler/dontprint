$(function() {
var Dontprint = Components.classes['@robamler.github.com/dontprint;1'].getService().wrappedJSObject;

if (location.hash !== '#' + Dontprint.welcomeScreenId) {
	close();
}

var prefs = Components.classes["@mozilla.org/preferences-service;1"]
				.getService(Components.interfaces.nsIPrefService)
				.getBranch("extensions.dontprint.");

var progressArc = document.getElementById("progress-arc");
var validK2pdfopt = false;
var k2pdfoptPath;

var platforms = [
	["win_32bit",	"32bit Windows"],
	["win_64bit",	"64bit Windows"],
	["mac_32bit",	"32bit Mac OS X"],
	["mac_64bit",	"64bit Mac OS X"],
	["linux_32bit",	"32bit Linux"],
	["linux_64bit",	"64bit Linux"]
];

var architecture = window.navigator.oscpu.match(/\b(win64|wow64|x86_64)\b/i) ? "64bit" : "32bit";
var osvariant = "win";
var m = window.navigator.oscpu.match(/(PPC|Intel) Mac OS X (\d+)\.(\d+)/i);
if (m) {
	osvariant = "mac";
	// Assume 64bit processor if Mac OS X version is >= 10.6
	if (m[1] === "Intel" && 10000*m[2]+m[3] >= 100006) {
		architecture = "64bit";
	}
} else if (window.navigator.oscpu.match(/linux/i)) {
	osvariant = "linux";
}

var platformstring = osvariant + "_" + architecture;
var selectorhtml = "";
for (var i=0; i<platforms.length; i++) {
	selectorhtml += "<option value='" + platforms[i][0] + "'>" + platforms[i][1] +
	(platforms[i][0]===platformstring ? " (detected)" : "") + "</option>";
	if (platforms[i][0] === platformstring) {
		$("#platform").text(platforms[i][1]);
	}
}
$("#platform-selector").html(selectorhtml);
$("#platform-selector").val(platformstring);

function modelSelectListener(modelName) {
	var model = ModelPicker.models[modelName];
	if (model) {
		var modelDefaults = Dontprint.EREADER_MODEL_DEFAULTS[modelName];
		$('#model-result-text').text(model.label);
		$('#widthinput').val(modelDefaults.w);
		$('#heightinput').val(modelDefaults.h);
		$('#ppiinput').val(modelDefaults.ppi);
		var res = $('#model-result');
		var resheight = null;
		if (res.is(':visible')) {
			resheight = res.outerHeight();
		} else {
			res.css('position', 'absolute')
			res.css('visibility', 'hidden');
			res.css('display', 'block')
			resheight = res.outerHeight() + parseFloat(res.css('margin-top'));
			res.css('display', 'none')
			res.css('visibility', 'visible');
			res.css('position', 'static')
		}
		res.slideDown();
		var scrollpos = res.offset().top + resheight - $(window).height();
		if (scrollpos > $('html, body').scrollTop()) {
			$('html, body').animate({scrollTop: scrollpos+10}, 1000);
		}
	} else {
		$('#model-result').slideUp();
	}
}

ModelPicker.init({
	selection: prefs.getCharPref("kindleModel"),
	modelSelectListener: modelSelectListener
});


// check if we already have k2pdfopt (and skip step 1 in that case)
$("#k2pdfopt-file-selector").val("");
$("#dontprint-version").text("");
k2pdfoptPath = prefs.getCharPref("k2pdfoptPath");
if (k2pdfoptPath) {
	Dontprint.detectK2pdfoptVersion(
		k2pdfoptPath,
		function() {
			$("#step1header").text($("#step1header").text() + " (done)");
			skipStep1();
		},
		function() { },
		function() { },
		function() { }
	);
} else if (prefs.getCharPref("k2pdfoptPlatform").substr(0,7)!=="unknown") {
	// user has already decided to download k2pdfopt
	$("#step1header").text("Step 1: Downloading k2pdfopt...");
	$("#download-progress").fadeIn();
	skipStep1();
	
	Dontprint.downloadK2pdfopt(
		updateProgressBar,
		function downloadSuccess() {
			$("#download-progress").fadeOut();
			$("#step1header").text("Step 1: Download finished.");
		}
	);
}


function skipStep1() {
	$("#step1body").hide();
	$("#step1header").css('opacity', 0.4);
	
	if (prefs.getCharPref("kindleModel")) {
		$("#step2body").hide();
		$("#step2header").text($("#step2header").text() + " (done)").css('opacity', .4);
		
		var transferMethod = prefs.getCharPref("transferMethod");
		if (
			transferMethod==="email" ||
			(transferMethod==="directory" && prefs.getCharPref("destDir"))
		) {
			$('#steps').hide();
			$('#congrats').show();
		}
		
		$("#step3").show();
	}
	
	$("#step2").show();
}


// prefill e-mail address if already set (e.g. thru sync)
$("#email-prefix").val(prefs.getCharPref("recipientEmailPrefix"));
$("#email-suffix").val(prefs.getCharPref("recipientEmailSuffix"));
$("#email-other").val(prefs.getCharPref("recipientEmailOther"));

emailSuffixChange();


$("#download-k2pdfopt-true").click(function() {
	$("#k2pdfopt-download-hint").slideDown();
	$("#k2pdfopt-nodownload-hint").slideUp();
});

$("#download-k2pdfopt-false").click(function() {
	$("#k2pdfopt-download-hint").slideUp();
	$("#k2pdfopt-nodownload-hint").slideDown();
});
$("#download-k2pdfopt-true").click();


$("#change-platform-link").click(function() {
	$("#autodetect-platform").hide();
	$("#select-platform").show();
});


$("#k2pdfopt-file-selector").change(function() {
	validK2pdfopt = false;
	
	if (this.files.length === 0) {
		$("#dontprint-version").text("Please select an executable file.");
		return;
	}
	k2pdfoptPath = this.files[0].mozFullPath;
	
	$("#dontprint-version").text("Detecting k2pdfopt version...");
	
	Dontprint.detectK2pdfoptVersion(
		k2pdfoptPath,
		function onSuccess(versionString) {
			validK2pdfopt = true;
			$("#dontprint-version").text('Detected k2pdfopt version ' + versionString + '. Click "accept" to continue.');
		},
		function onOutdated(versionString) {
			$("#dontprint-version").text('Detected k2pdfopt version ' + versionString + '. This version is too old to work with Dontprint. Please download a more recent version or allow Dontprint to download k2pdfopt automatically.');
		},
		function onNotFound() {
			$("#dontprint-version").text("Error: Dontprint was unable to detect k2pdfopt. Make sure that you selected the correct file and that you have execution rights for the file.");
		},
		function onError(errstr) {
			$("#dontprint-version").text("Error: " + errstr);
		}
	);
});


$("#acceptstep1").click(function() {
	var download = $("#download-k2pdfopt-true").prop("checked");
	if (!download && !validK2pdfopt) {
		alert("Dontprint was unable to find a compatible version of k2pdfopt at the location you specified. Please make sure that you have a working version of k2pdfopt and that the specified location is correct. Alternatively, select the option to let Dontprint download k2pdfopt automatically.");
		return false;
	}
	
	if (download) {
		prefs.setCharPref("k2pdfoptPlatform", $("#platform-selector").val());
		$("#step1header").text("Step 1: Downloading k2pdfopt...");
		$("#download-progress").fadeIn();
		
		Dontprint.downloadK2pdfopt(
			updateProgressBar,
			function downloadSuccess() {
				$("#download-progress").fadeOut();
				$("#step1header").text("Step 1: Download finished.");
			}
		);
	} else {
		$("#step1header").text($("#step1header").text() + " (done)");
		prefs.setCharPref("k2pdfoptPath", k2pdfoptPath);
		prefs.setCharPref("k2pdfoptPlatform", "unknown-manual");
	}
	
	
	$("#step1body").slideUp();
	$("#step1header").fadeTo(400, 0.4);
	
	// check if step 2 is already completed due to sync
	if (prefs.getCharPref("kindleModel")) {
		goToStep3();
	} else {
		$("#step2").slideDown();
	}
});

$("#acceptstep2").click(function() {
	if (
		!ModelPicker.selection ||
		!$('#widthinput').val().match(/^\d+$/) ||
		!$('#heightinput').val().match(/^\d+$/) ||
		!$('#ppiinput').val().match(/^\d+$/)
	) {
		alert('Please insert valid numbers for width, height and pixels per inch.')
		return false;
	}
	
	prefs.setCharPref("kindleModel", ModelPicker.selection);
	
	var screenSettings = {
		w: $('#widthinput').val(),
		h: $('#heightinput').val(),
		ppi: $('#ppiinput').val(),
	};
	var modelDefaults = Dontprint.EREADER_MODEL_DEFAULTS[ModelPicker.selection];
	var alldefaults = true;
	for (var key in screenSettings) {
		if (screenSettings[key] != modelDefaults[key]) {
			alldefaults = false;
			break;
		}
	}
	var newvalues = alldefaults ? {w:-1, h:-1, ppi:-1} : screenSettings;
	Dontprint.getPrefs().setIntPref('screenWidth', newvalues.w);
	Dontprint.getPrefs().setIntPref('screenHeight', newvalues.h);
	Dontprint.getPrefs().setIntPref('screenPpi', newvalues.ppi);
	
	$('#step2header').text($('#step2header').text() + ' (done)').fadeTo(400, .4);
	$('#step2body').slideUp();
	goToStep3();
});

function goToStep3() {
	// check if step 3 is already completed due to sync
	// (only possible if transferMethod==="email")
	if (prefs.getCharPref("transferMethod")==="email") {
		$("#steps").slideUp();
		$("#congrats").slideDown();
	} else {
		$("#step3").slideDown();
	}
}

$("#transferMethodEmail,#transferMethodDirectory").prop("checked", false);
$("#transferMethodEmail").click(function() {
	$("#transferMethodEmailContainer").slideDown();
	$("#transferMethodDirectoryContainer").slideUp();
	$("#acceptstep3").removeAttr("disabled");
});
$("#transferMethodDirectory").click(function() {
	$("#transferMethodEmailContainer").slideUp();
	$("#transferMethodDirectoryContainer").slideDown();
	$("#acceptstep3").removeAttr("disabled");
});
$("#acceptstep3").prop("disabled", true);


$("#email-suffix").change(emailSuffixChange);

function emailSuffixChange() {
	$("#test-email").removeAttr("disabled");
	var v = $('#email-suffix').val();
	if (v === "@free.kindle.com" || v === "other") {
		$("#warning-charges").slideUp();
	} else {
		$("#warning-suffix").text(v);
		$("#warning-charges").slideDown();
	}
	
	if (v === "other") {
		$("#email-prefix").attr("disabled", "disabled").fadeTo(400, .5);
		var startval = $("#email-other").val();
		if (startval === "") {
			startval = $("#email-prefix").val();
			if (startval) {
				startval = startval + "@";
			}
			$("#email-other").val(startval);
		}
		$("#email-other-container").slideDown(400, function() {
			$("#email-other").get(0).setSelectionRange(startval.length, startval.length);
			$("#email-other").focus();
 		});
	} else {
		$("#email-prefix").removeAttr("disabled").fadeTo(400, 1);
		$("#email-other-container").slideUp();
	}
}

$("#email-prefix").on("input", function() {
	$("#test-email").removeAttr("disabled");
});


$("#kindle-email-question").click(function() {
	$("#kindle-email-help").slideDown();
	$(this).parent().fadeOut();
	return false;  // makes sure location.hash won't be changed
});


// Use the user's desktop directory as default destination directory
$("#destDirInput").val(Components.classes["@mozilla.org/file/directory_service;1"].
	getService(Components.interfaces.nsIProperties).
	get("Desk", Components.interfaces.nsIFile).
	path
);

$("#postTransferCommandSwitch").click(function() {
	var enabled = $(this).prop("checked");
	$("#postTransferCommandInput").prop("disabled", !enabled);
	if (enabled) {
		$("#postTransferCommandInput").focus();
	}
});
$("#postTransferCommandSwitch").prop("checked", false);
$("#postTransferCommandInput").prop("disabled", true);


$("#destDirChooser").click(function() {
	const nsIFilePicker = Components.interfaces.nsIFilePicker;
	const nsILocalFile = Components.interfaces.nsILocalFile;
	var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
	fp.init(window, "Select directory to save converted PDF files", nsIFilePicker.modeGetFolder);
	try {
		var f = Components.classes["@mozilla.org/file/local;1"].createInstance(nsILocalFile);
		f.initWithPath($("#destDirInput").val());
		fp.displayDirectory = f;
	} catch (e) {}
	var rv = fp.show();
	if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace) {
		$("#destDirInput").val(fp.file.path);
	}
});


function updateProgressBar(progress) {
	var angle = 2*Math.PI*progress;
	var newx = 15 + 14*Math.sin(angle);
	var newy = 15 - 14*Math.cos(angle);
	
	// If progress>50%, set an additional point at 50% to avoid
	// ambiguities at progress==0% and at progress==100%.
	progressArc.setAttribute("d", 
		(progress > 0.5 ? "M 15,15 15,1 A 14,14 0 1 1 15,29 " : "M 15,15 15,1 ") +
		"A 14,14 0 0 1 " + newx + "," + newy + " z"
	);
}

$("#acceptstep3").click(function() {
	if (!saveStep3Prefs()) {
		return false;
	}
	
	$('#steps').slideUp();
	$('#congrats').slideDown();
});

$("#acceptcongrats").click(function() {
	close();
});

$("#test-email").click(function() {
	if (!saveStep3Prefs()) {
		return false;
	}
	Dontprint.sendTestEmail(testEmailCallback);
	$("#test-email").attr("disabled", "disabled");
	$("#test-email-address").text(Dontprint.getRecipientEmail());
	$("#test-email-done").slideUp();
	$("#test-email-waiting").slideDown();
});


function testEmailCallback(newtab) {
	try {
		$("#test-email-showresult").show();
		newtab.tab.addEventListener("TabClose", function() {
			$("#test-email-showresult").fadeOut();
		}, true);
		$("#test-email-showresult").off("click");
		$("#test-email-showresult").click(function() {
			newtab.gBrowser.selectedTab = newtab.tab;
			return false;
		});
	} catch (e) {
		$("#test-email-showresult").hide();
	}
	
	$("#test-email-waiting").slideUp();
	$("#test-email-done").slideDown();
}


function saveStep3Prefs() {
	var transferMethod = $("input[name='transferMethodChoice']:checked").val();
	
	switch (transferMethod) {
		case "email":
			var prefix = $("#email-prefix").val();
			var suffix = $("#email-suffix").val();
			var other = $("#email-other").val();
			if (
				(suffix!=="other" && (prefix==="" || prefix.match(/[@ "']/))) ||
				(suffix==="other" && !$("#email-other").get(0).validity.valid)
			) {
				alert("Please enter a valid e-mail address in the text box.");
				return false;
			}
			
			prefs.setCharPref("recipientEmailPrefix", prefix);
			prefs.setCharPref("recipientEmailSuffix", suffix);
			prefs.setCharPref("recipientEmailOther", other);
			break;
		
		case "directory":
			var destDir = $("#destDirInput").val().trim();
			var enabled = $("#postTransferCommandSwitch").prop("checked");
			var comm = $("#postTransferCommandInput").val().trim();
			if (destDir==="") {
				alert("Please choose a destination directory where the PDF files will be saved.");
				$("#destDirInput").focus();
				return false;
			}
			if (enabled && comm==="") {
				alert("Please enter a command or uncheck the box to execute a command.");
				$("#postTransferCommandInput").focus();
				return false;
			}
			prefs.setCharPref("destDir", destDir);
			prefs.setBoolPref("postTransferCommandEnabled", enabled);
			prefs.setCharPref("postTransferCommand", comm);
			break;
		
		default:
			alert("Please choose whether you want to transfer PDF documents by e-mail or to save them to a directory of your choice");
			return false;
	}
	
	prefs.setCharPref("transferMethod", transferMethod);
	return true;
}


});