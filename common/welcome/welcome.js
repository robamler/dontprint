"use strict";

$(function() {
	var dp = {};
	var Dontprint = null;

	PlatformTools.getComponentInternally("Dontprint").then(function(val) {
		Dontprint = val;
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
			k2pdfoptParams: ""
		});
	}).then(function(prefs) {
		dp.prefs = prefs;
		return Dontprint.isTransferMethodValid(prefs);
	}).then(function(isvalid) {
		dp.transferMethodValid = isvalid;
		return Dontprint.getEreaderModelDefaults();
	}).then(function(modelDefaults) {
		dp.EREADER_MODEL_DEFAULTS = modelDefaults;
		stepModelPicker();
	});


	function stepModelPicker() {
		if (dp.prefs.ereaderModel) {
			// This step is already completed due to sync
			stepTransferMethod();
			return;
		}

		$("#screensizeHelperLink").click(helpWithScreensize);
		$("#acceptStepModelPicker").click(acceptModelPicker);
		ModelPicker.init({
			selection: dp.prefs.ereaderModel,
			modelSelectListener: modelSelectListener
		});
		$("#stepModelPickerBody").slideDown();
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
		} else {
			$('#model-result').slideUp();
		}
	}


	function helpWithScreensize(event) {
		event.preventDefault();

		if (!confirm("You can find out the exact screen size of your e-reader with the help of a small measurement document. Would you like to transfer this measurement document to your e-reader now?")) {
			return false;
		}

		let screensizeHelper = $("#screensizeHelper");
		screensizeHelper.text("Downloading measurement document...");

		let filename = "Dontprint measurement sheet";
		if (ModelPicker.selection !== "other") {
			filename += " for " + ModelPicker.models[ModelPicker.selection].label;
		}
		filename += ".pdf";

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
					let interval = setInterval(
						function() {
							chrome.downloads.search(
								{id: downloadId},
								function(downloadItems) {
									let item = downloadItems[0];
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
			screenWidth: $('#widthinput').val(),
			screenHeight: $('#heightinput').val(),
			screenPpi: $('#ppiinput').val(),
		};
		var modelDefaults = dp.EREADER_MODEL_DEFAULTS[ModelPicker.selection];
		var alldefaults = true;
		for (var key in screenSettings) {
			if (screenSettings[key] != modelDefaults[key]) {
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
		let prefs = validateTransferMethodSettings();
		if (prefs) {
			Dontprint.platformTools.setPrefs(prefs);
			showCongrats();
		}
	}


	function sendVerificationCode() {
		let prefs = validateTransferMethodSettings();
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