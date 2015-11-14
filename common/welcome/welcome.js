"use strict";

$(function() {
	var dp = {};
	var Dontprint = null;

	PlatformTools.getMainComponentInternally("Dontprint", "@robamler.github.com/dontprint;1").then(function(val) {
		Dontprint = val;
		if (location.hash !== "#" + Dontprint.welcomeScreenId) {
			window.close();
			throw "Obsolete tab";
		}
		if (Dontprint.platformTools.platform === "firefox") {
			$("#stepcount").text("three");
			$("#transferMethodDirectoryChrome").hide();
			$("#transferMethodDirectoryLabel").text("Save documents to a directory (for e-readers that don't support e-mail transfer)");
		}

		return Dontprint.platformTools.getPrefs({
			ereaderModel: "",
			screenWidth: -1,
			screenHeight: -1,
			screenPpi: -1,
			transferMethod: "",
			recipientEmailPrefix: "",
			recipientEmailSuffix: "",
			recipientEmailOther: "",
			verifiedEmails: [],
			neverReportJournalSettings: false,
			otherEreaderModel: "",
			k2pdfoptParams: "",
			k2pdfoptPlatform: "",
			k2pdfoptPath: "",
			destDir: "",
			postTransferCommandEnabled: false,
			postTransferCommand: ""
		});
	}).then(function(prefs) {
		dp.prefs = prefs;
		return Dontprint.isTransferMethodValid(prefs);
	}).then(function(isvalid) {
		dp.transferMethodValid = isvalid;
		return Dontprint.getEreaderModelDefaults();
	}).then(function(modelDefaults) {
		dp.EREADER_MODEL_DEFAULTS = modelDefaults;
		stepDownload();
		if (Dontprint.platformTools.platform === "firefox") {
			$(".firefox-only").show();
		}
	});


	function stepDownload() {
		if (Dontprint.platformTools.platform !== "firefox" || dp.prefs.k2pdfoptPath !== "" || dp.prefs.k2pdfoptPlatform.substr(0,7) !== "unknown") {
			// If k2pdfoptPath is empty and k2pdfoptPlatform does
			// not start with "unknown", then dontprint.js will
			// already initiate a silent download.
			$("#stepDownloadHeader").text("Download external tools (done)").fadeTo(400, .4);
			stepModelPicker();
			return;
		}

		dp.progressArc = document.getElementById("progress-arc");
		dp.validK2pdfopt = false;

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

		$("#download-k2pdfopt-true").click(function() {
			$("#k2pdfopt-download-hint").slideDown();
			$("#k2pdfopt-nodownload-hint").slideUp();
		});

		$("#download-k2pdfopt-false").click(function() {
			$("#k2pdfopt-download-hint").slideUp();
			$("#k2pdfopt-nodownload-hint").slideDown();
		});

		$("#change-platform-link").click(function() {
			$("#autodetect-platform").hide();
			$("#select-platform").show();
		});

		$("#k2pdfopt-file-selector").change(k2pdfoptFileSelected);
		$("#acceptstep1").click(acceptDownload);

		$("#platform-selector").html(selectorhtml);
		$("#platform-selector").val(platformstring);
		$("#download-k2pdfopt-true").click();
		$("#stepDownloadBody").slideDown();
	}


	function k2pdfoptFileSelected() {
		dp.validK2pdfopt = false;
		
		if (this.files.length === 0) {
			$("#dontprint-version").text("Please select an executable file.");
			return;
		}
		dp.prefs.k2pdfoptPath = this.files[0].mozFullPath;
		
		$("#dontprint-version").text("Detecting k2pdfopt version...");
		
		Dontprint.detectK2pdfoptVersion(dp.prefs.k2pdfoptPath).then(
			function(versionString) {
				dp.validK2pdfopt = true;
				$("#dontprint-version").text('Detected k2pdfopt version ' + versionString + '. Click "accept" to continue.');
			},
			function(e) {
				$("#dontprint-version").text("An error occured. Maybe you selected the wrong file or you don't have the necessary execution rights for the file. Original error message: " + e.toString());
			}
		);
	}


	function acceptDownload() {
		var download = $("#download-k2pdfopt-true").prop("checked");
		if (!download && !dp.validK2pdfopt) {
			alert("Dontprint was unable to find a compatible version of k2pdfopt at the location you specified. Please make sure that you have a working version of k2pdfopt and that the specified location is correct. Alternatively, select the option to let Dontprint download k2pdfopt automatically.");
			return false;
		}
		
		if (download) {
			dp.prefs.k2pdfoptPlatform = $("#platform-selector").val();
			dp.prefs.k2pdfoptPath = "";
			Dontprint.platformTools.setPrefs({
				k2pdfoptPlatform: dp.prefs.k2pdfoptPlatform,
				k2pdfoptPath: ""
			});
			$("#stepDownloadHeader").text("Downloading k2pdfopt...");
			$("#download-progress").fadeIn();
			
			Dontprint.downloadK2pdfopt(
				dp.prefs,
				updateProgressBar
			).then(
				function() {
					$("#download-progress").fadeOut();
					$("#stepDownloadHeader").text("Download finished.");
				},
				function() {
					$("#download-progress").fadeOut();
					$("#stepDownloadHeader").text("Download failed.");
				}
			);
		} else {
			$("#stepDownloadHeader").text($("#stepDownloadHeader").text() + " (done)");
			Dontprint.platformTools.setPrefs({
				k2pdfoptPath: dp.prefs.k2pdfoptPath,
				k2pdfoptPlatform: "unknown-manual"
			});
		}
		
		$("#stepDownloadBody").slideUp();
		$("#stepDownloadHeader").fadeTo(400, 0.4);
		
		stepModelPicker();
	}


	function updateProgressBar(progress) {
		var angle = 2*Math.PI*progress;
		var newx = 15 + 14*Math.sin(angle);
		var newy = 15 - 14*Math.cos(angle);
		
		// If progress>50%, set an additional point at 50% to avoid
		// ambiguities at progress==0% and at progress==100%.
		dp.progressArc.setAttribute("d", 
			(progress > 0.5 ? "M 15,15 15,1 A 14,14 0 1 1 15,29 " : "M 15,15 15,1 ") +
			"A 14,14 0 0 1 " + newx + "," + newy + " z"
		);
	}


	function stepModelPicker() {
		if (dp.prefs.ereaderModel) {
			// This step is already completed due to sync
			$("#stepModelPickerBody").hide();
			$("#stepModelPicker").slideDown();
			stepTransferMethod();
			return;
		}

		$("#screensizeHelperLink").click(helpWithScreensize);
		$("#acceptStepModelPicker").click(acceptModelPicker);
		ModelPicker.init({
			selection: dp.prefs.ereaderModel,
			modelSelectListener: modelSelectListener
		});
		$("#stepModelPicker").slideDown();
	}


	function modelSelectListener(modelName) {
		var model = ModelPicker.models[modelName];
		if (model) {
			var modelDefaults = dp.EREADER_MODEL_DEFAULTS[modelName];
			$('#model-result-text').text(model.label);
			$('#widthinput').val(modelDefaults.screenWidth);
			$('#heightinput').val(modelDefaults.screenHeight);
			$('#ppiinput').val(modelDefaults.screenPpi);
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
			if (scrollpos > $('body').scrollTop()) {
				$('html, body').animate({
					scrollTop: scrollpos + 25
				}, 1000);
			}
			var left = model.node.position().left;
			scrollModelsTo(left, left+model.node.outerWidth());
		} else {
			$('#model-result').slideUp();
		}
	}


	function scrollModelsTo(left, right) {
		var width = $('#model-select-container').innerWidth();
		var scrollPos = $('#model-select-container').scrollLeft();
		if (left<0 && right<width-30) {
			$('#model-select-container').animate({
				scrollLeft: scrollPos - Math.min(width-right-30, 30-left)
			}, 1000);
		} else if (left>30 && right>width) {
			$('#model-select-container').animate({
				scrollLeft: scrollPos + Math.min(left-30, right-width+30)
			}, 1000);
		}
	}


	function helpWithScreensize(event) {
		event.preventDefault();

		if (!confirm("You can find out the exact screen size of your e-reader with the help of a small measurement document. Would you like to transfer this measurement document to your e-reader now?")) {
			return false;
		}

		var screensizeHelper = $("#screensizeHelper");
		screensizeHelper.text("Downloading measurement document...");

		var filename = "Dontprint measurement sheet";
		if (ModelPicker.selection !== "other") {
			filename += " for " + ModelPicker.models[ModelPicker.selection].label;
		}
		filename += ".pdf";

		if (Dontprint.platformTools.platform === "chrome") {
			chrome.downloads.download(
				{
					url: "http://dontprint.net/test-documents/chrome/measurement-only/" + ModelPicker.selection + ".pdf",
					filename,
					conflictAction: "uniquify",
					saveAs: true
				},
				function(downloadId) {
					if (downloadId === undefined) {
						screensizeHelper.text("Error while downloading an auxiliary file. Are you connected to the internet?");
					} else {
						var interval = setInterval(
							function() {
								chrome.downloads.search(
									{id: downloadId},
									function(downloadItems) {
										var item = downloadItems[0];
										if (item.state === "complete") {
											clearInterval(interval);
											screensizeHelper.text("Dontprint just downloaded the following file: \"" + item.filename.match(/[^\\/]+$/) + "\". Transfer this document to your e-reader in order to measure its screen size (you can also do this at a later time).");
										} else if (item.totalBytes > 0) {
											screensizeHelper.text("Downloading measurement document (" + Math.round(100*item.bytesReceived/item.totalBytes) + "% done)...");
										}
									}
								);
							},
							500
						);
					}
				}
			);
		} else if (Dontprint.platformTools.platform === "firefox") {
			Components.utils.import("resource://gre/modules/FileUtils.jsm");
			Components.utils.import("resource://gre/modules/Downloads.jsm");

			var destFile = FileUtils.getFile("Desk", [filename]);
			destFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);

			download = Downloads.createDownload({
				source: "http://dontprint.net/test-documents/firefox/measurement-only/" + ModelPicker.selection + ".pdf",
				target: destFile
			}).then(
				function success(download) {
					download.onchange = function() {
						screensizeHelper.text("Downloading measurement document (" + Math.round(download.progress) + "% done)...");
					};

					download.start().then(
						function succ() {
							download.onchange = undefined;
							screensizeHelper.text("Dontprint just downloaded the following file to your Desktop: \"" + destFile.leafName + "\". Transfer this document to your e-reader in order to measure its screen size (you can also do this at a later time).");
						},
						function err() {
							screensizeHelper.text("Error while downloading an auxiliary file. Are you connected to the internet?");
						}
					);
				}
			);
		}
	}


	function acceptModelPicker() {
		if (!ModelPicker.selection ||
			!$('#widthinput').val().match(/^\d+$/) ||
			!$('#heightinput').val().match(/^\d+$/) ||
			!$('#ppiinput').val().match(/^\d+$/)
		) {
			alert('Please insert valid numbers for width, height and pixels per inch.')
			return false;
		}

		var screenSettings = {
			screenWidth: parseInt($('#widthinput').val()),
			screenHeight: parseInt($('#heightinput').val()),
			screenPpi: parseInt($('#ppiinput').val()),
		};
		var modelDefaults = dp.EREADER_MODEL_DEFAULTS[ModelPicker.selection];
		var alldefaults = true;
		for (var key in screenSettings) {
			if (screenSettings[key] !== modelDefaults[key]) {
				alldefaults = false;
				break;
			}
		}
		var newvalues = alldefaults ? {
			screenWidth: -1,
			screenHeight: -1,
			screenPpi: -1
		} : screenSettings;
		newvalues.ereaderModel = ModelPicker.selection;

		Dontprint.platformTools.setPrefs(newvalues);

		stepTransferMethod();
	}


	function stepTransferMethod() {
		if (Dontprint.isTransferMethodValid(dp.prefs)) {
			showCongrats();
			return;
		}

		$('#stepModelPickerHeader').text($('#stepModelPickerHeader').text() + ' (done)').fadeTo(400, .4);
		$('#stepModelPickerBody').slideUp();

		$("#email-prefix").val(dp.prefs.recipientEmailPrefix);
		$("#email-suffix").val(dp.prefs.recipientEmailSuffix);
		$("#email-other").val(dp.prefs.recipientEmailOther);
		$("#email-suffix").change(emailSuffixChange);
		emailSuffixChange();
		$("#verifyEmailBtn").click(verifyEmail);
		$("#showDownloadsFolder").click(showDownloadsFolder);

		$("#transferMethodEmail").click(function() {
			$("#transferMethodEmailContainer").slideDown();
			$("#transferMethodDirectoryContainer").slideUp();
		});
		$("#transferMethodDirectory").click(function() {
			$("#transferMethodEmailContainer").slideUp();
			$("#transferMethodDirectoryContainer").slideDown();
		});
		if (dp.prefs.transferMethod === "email") {
			$("#transferMethodEmail").click();
		} else if (dp.prefs.transferMethod === "directory") {
			$("#transferMethodDirectory").click();
		} else {
			$("#transferMethodEmail,#transferMethodDirectory").prop("checked", false);
		}

		$("#kindle-email-question").click(function() {
			$("#kindle-email-help").slideDown();
			$(this).parent().fadeOut();
			return false; // makes sure location.hash won't be changed
		});

		if (Dontprint.platformTools.platform === "firefox") {
			if (dp.prefs.destDir === "") {
				// Use the user's desktop directory as default destination directory
				dp.prefs.destDir = Components.classes["@mozilla.org/file/directory_service;1"].
					getService(Components.interfaces.nsIProperties).
					get("Desk", Components.interfaces.nsIFile).
					path;
			}
			$("#destDirInput").val(dp.prefs.destDir);
			$("#postTransferCommandSwitch").click(function() {
				var enabled = $(this).prop("checked");
				$("#postTransferCommandInput").prop("disabled", !enabled);
				if (enabled) {
					$("#postTransferCommandInput").focus();
				}
			});
			$("#postTransferCommandSwitch").prop("checked", dp.prefs.postTransferCommandEnabled);
			$("#postTransferCommandInput").prop("disabled", !dp.prefs.postTransferCommandEnabled).val(dp.prefs.postTransferCommand);

			$("#destDirChooser").click(function() {
				var nsIFilePicker = Components.interfaces.nsIFilePicker;
				var nsILocalFile = Components.interfaces.nsILocalFile;
				var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
				fp.init(window, "Select directory to save converted PDF files", nsIFilePicker.modeGetFolder);
				try {
					var f = Components.classes["@mozilla.org/file/local;1"].createInstance(nsILocalFile);
					f.initWithPath($("#destDirInput").val());
					fp.displayDirectory = f;
				} catch (e) {}
				var rv = fp.show();
				if (rv === nsIFilePicker.returnOK || rv === nsIFilePicker.returnReplace) {
					$("#destDirInput").val(fp.file.path);
				}
			});
		}

		$("#stepTransferMethod").slideDown();

		$("#sendVerificationCodeBtn").click(sendVerificationCode);
		$("#acceptStepTransferMethod,#acceptStepEmail").click(acceptTransferMethod);
	}


	function emailSuffixChange() {
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
				$("#email-other").focus();
			});
		} else {
			$("#email-prefix").removeAttr("disabled").fadeTo(400, 1);
			$("#email-other-container").slideUp();
		}
	}


	function acceptTransferMethod() {
		var prefs = validateTransferMethodSettings();
		if (prefs) {
			if (Dontprint.platformTools.platform === "firefox") {
				prefs.destDir = $("#destDirInput").val();
				prefs.postTransferCommandEnabled = $("#postTransferCommandSwitch").prop("checked");
				prefs.postTransferCommand = $("#postTransferCommandInput").val();
			}
			Dontprint.platformTools.setPrefs(prefs);
			showCongrats();
		}
	}


	function sendVerificationCode() {
		var prefs = validateTransferMethodSettings();
		if (!prefs) {
			return false;
		}

		$("#sendVerificationCodeBtn").attr("disabled", "disabled");
		$("#verificationCodeProgress").text("Sending verification code. Please wait...").slideDown();
		$("#verificationCodeInputLine").slideDown();
		$("#verificationCode").val("").focus();

		Dontprint.sendVerificationCode(prefs).then(
			function(response) {
				if (response.returncode === 0) {
					$("#verificationCodeProgress").text('Verification code sent. Please wait until a document with a four-digit verification code arrives on your e-reader and then enter the code below. It may take a couple of minutes until the document arrives on your e-reader and you may have to manually select "Sync" on your device.');
					$("#sendVerificationCodeBtn").removeAttr("disabled").text("Resend verification code");
				} else if (response.returncode === 1) {
					$("#verificationCodeProgress").text('The e-mail address had already been verified before. There is no need to reverify. Click "Accept and finish" below to conclude the setup.');
					$("#verificationCodeInputLine").slideUp();
					$("#acceptEmailContainer").slideDown();
				}
			},
			function(error) {
				$("#sendVerificationCodeBtn").removeAttr("disabled");
				$("#verificationCodeProgress").text("Error: " + error);
			}
		);
	}


	function verifyEmail() {
		var code = $("#verificationCode").val();
		if (!/^\d{4}$/.test(code)) {
			alert("The verification code must consist of four digits.");
			$("#verificationCode").focus();
			return false;
		}
		$("#verifyEmailBtn").attr("disabled", "disabled");
		$("#verificationCodeProgress").text("Checking verification code. Please wait...").slideDown();

		Dontprint.verifyEmailAddress(code).then(
			showCongrats,
			function(error) {
				$("#verifyEmailBtn").removeAttr("disabled");
				$("#verificationCodeProgress").text("Error: " + error);
			}
		);
	}


	function testEmailCallback(newtab) { //TODO: where does this get called?
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


	function validateTransferMethodSettings() {
		var transferMethod = $("input[name='transferMethodChoice']:checked").val();

		switch (transferMethod) {
			case "email":
				var prefix = $("#email-prefix").val();
				var suffix = $("#email-suffix").val();
				var other = $("#email-other").val();
				if (
					(suffix !== "other" && (prefix === "" || prefix.match(/[@ "']/))) ||
					(suffix === "other" && !$("#email-other").get(0).validity.valid)
				) {
					alert("Please enter a valid e-mail address in the text box.");
					return false;
				}

				return {
					transferMethod,
					recipientEmailPrefix: prefix,
					recipientEmailSuffix: suffix,
					recipientEmailOther: other
				};

			case "directory":
				return {transferMethod};

			default:
				alert('Please choose whether you want to transfer PDF documents by e-mail or to save them to your "Donwnloads" directory.');
				return false;
		}
	}


	function showDownloadsFolder() {
		chrome.downloads.showDefaultFolder();
		return false;
	}


	function showCongrats() {
		$('#steps').slideUp();
		$('#congrats').slideDown();
		$("#acceptCongrats").click(function() {
			close();
		});
	}
});