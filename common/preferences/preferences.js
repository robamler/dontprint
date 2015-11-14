"use strict";

$(function() {
	var modelSettings = {};
	var marginsPaneInitialized = false;
	var marginsPaneInitializedSuccessfully = false;
	var journalFilters = null;
	var journalFilterMap = {};
	var journalFilterList = null;
	var selectedJournalFilter = null;
	var originalSelectedJournalFilter = null;
	var Dontprint = null;
	var dp = {};
	var k2pdfoptInstalledVersion = null;
	var k2pdfoptNewVersion = null;

	PlatformTools.getMainComponentInternally("Dontprint", "@robamler.github.com/dontprint;1").then(function(val) {
		Dontprint = val;
		return Dontprint.platformTools.getPrefs({
			ereaderModel: "other",
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
			k2pdfoptAdditionalParams: "",
			k2pdfoptPath: "",
			k2pdfoptPlatform: "unknown",
			postTransferCommandEnabled: false,
			postTransferCommand: "",
			destDir: ""
		});
	}).then(function(prefs) {
		dp.prefs = prefs;
		return Dontprint.isTransferMethodValid(prefs);
	}).then(function(isvalid) {
		dp.transferMethodValid = isvalid;
		return Dontprint.getEreaderModelDefaults();
	}).then(function(modelDefaults) {
		dp.EREADER_MODEL_DEFAULTS = modelDefaults;
		initTransferMethodPane();
		initDevicePane();
		initAdvancedPane();
		$(window).bind("hashchange", hashchange);
		if (Dontprint.platformTools.platform !== "firefox") {
			$(".firefox-only").hide();
		}
		hashchange();
	});


	function hashchange(e) {
		var pane = [];
		var m = location.hash.match(/^#(\w+)/);
		if (m) {
			pane = $("#pane-" + m[1]);
		}
		if (!pane.length) {
			pane = $(".pane:eq(0)");
		}

		pane.blur();
		var paneName = pane.attr("id").substr(5);
		$(".pane").not("#pane-" + paneName).removeClass("selected");
		pane.addClass("selected");
		$(".content").not("#content-" + paneName).removeClass("selected");
		$("#content-" + paneName).addClass("selected");

		if (paneName === "margins" && !marginsPaneInitialized) {
			initMarginsPane();
		}
	}


	function attachPref(property, prefName) {
		function handler() {
			Dontprint.platformTools.setPrefs({[prefName]: this[property]});
		}

		$("#" + prefName).prop(property, dp.prefs[prefName]).change(handler).keyup(handler);
	}


	function initTransferMethodPane() {
		attachPref("value", "recipientEmailPrefix");
		attachPref("value", "recipientEmailSuffix");
		attachPref("value", "recipientEmailOther");

		if (dp.prefs.transferMethod === "email") {
			$("#transferMethodDirectoryDetails").hide();
			$("#transferMethodEmail").prop("checked", true);
		} else {
			$("#transferMethodEmailDetails").hide();
			$("#transferMethodDirectory").prop("checked", true);
		}

		$("#recipientEmailSuffix").change(emailSuffixChange);
		$("#recipientEmailPrefix,#recipientEmailOther").change(checkEmailVerificationStatus).keyup(checkEmailVerificationStatus);
		emailSuffixChange();

		$("#transferMethodEmail").click(function() {
			$("#transferMethodEmailDetails").slideDown();
			$("#transferMethodDirectoryDetails").slideUp();
			Dontprint.platformTools.setPrefs({transferMethod: "email"});
		});
		$("#transferMethodDirectory").click(function() {
			$("#transferMethodEmailDetails").slideUp();
			$("#transferMethodDirectoryDetails").slideDown();
			Dontprint.platformTools.setPrefs({transferMethod: "directory"});
		});
		$("#showDownloadsFolder").click(function() {
			chrome.downloads.showDefaultFolder();
		});

		$("#sendVerificationCodeBtn").click(sendVerificationCode);
		$("#confirmVerificationCodeBtn").click(confirmVerificationCode);

		$("#testEmailSettingsBtn").click(function() {
			transferTestDocument(
				$(this),
				"email-test",
				"Dontprint can send a small test document to your e-reader's e-mail address. Would you like to send this document now?"
			)
		});

		if (Dontprint.platformTools.platform === "firefox") {
			$("#whereToSave").text("a directory");
			$("#whereIsMyDownloadsFolder").hide();

			$("#chooseDestDirButton").click(chooseDestDir);
			attachPref("value", "destDir");
			attachPref("checked", "postTransferCommandEnabled");
			attachPref("value", "postTransferCommand");
			$("#postTransferCommand").prop("disabled", !dp.prefs.postTransferCommandEnabled);
			$("#postTransferCommandEnabled").change(function() {
				$("#postTransferCommand").prop("disabled", !this.checked);
				if (this.checked) {
					$("#postTransferCommand").focus();
				}
			});
		}
	}


	function sendVerificationCode() {
		$("#sendVerificationCodeBtn").attr("disabled", "disabled");
		$("#verificationProgress").text("Sending verification code. Please wait...");
		Dontprint.sendVerificationCode().then(
			function(response) {
				if (response.returncode === 0) {
					$("#verificationProgress").text('Verification code sent. Please wait until a document with a four-digit verification code arrives on your e-reader and then enter the code below. It may take a couple of minutes until the document arrives on your e-reader and you may have to manually select "Sync" on your device.');
				} else if (response.returncode === 1) {
					// E-mail address already verified.
					Dontprint.platformTools.getPrefs({
						verifiedEmails: []
					}).then(function(prefs) {
						dp.prefs.verifiedEmails = prefs.verifiedEmails;
						checkEmailVerificationStatus();
						$("#verificationProgress").html('(Dontprint will send a small document with a four-digit verification code to your device. The e-mail will be sent from <em>noreply@dontprint.net</em>.)');
						$("#sendVerificationCodeBtn").removeAttr("disabled");
					});
				}
			},
			function(error) {
				$("#sendVerificationCodeBtn").removeAttr("disabled");
				$("#verificationProgress").text("Error: " + error);
			}
		);
	}


	function confirmVerificationCode() {
		var code = $("#verificationCode").val();
		if (!/^\d{4}$/.test(code)) {
			alert("The verification code must consist of four digits.");
			$("#verificationCode").focus();
			return false;
		}

		$("#confirmVerificationCodeBtn").attr("disabled", "disabled");
		$("#verificationProgress").text("Checking verification code. Please wait...");
		Dontprint.verifyEmailAddress(code).then(
			function() {
				Dontprint.platformTools.getPrefs({
					verifiedEmails: []
				}).then(function(prefs) {
					dp.prefs.verifiedEmails = prefs.verifiedEmails;
					checkEmailVerificationStatus();
					$("#verificationProgress").html('(Dontprint will send a small document with a four-digit verification code to your device. The e-mail will be sent from <em>noreply@dontprint.net</em>.)');
					$("#confirmVerificationCodeBtn").removeAttr("disabled");
				});
			},
			function(error) {
				$("#confirmVerificationCodeBtn").removeAttr("disabled");
				$("#verificationProgress").text("Error: " + error);
			}
		);
	}


	function chooseDestDir() {
		var nsIFilePicker = Components.interfaces.nsIFilePicker;
		var nsILocalFile = Components.interfaces.nsILocalFile;
		var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
		fp.init(window, "Select directory to save converted PDF files", nsIFilePicker.modeGetFolder);
		try {
			var f = Components.classes["@mozilla.org/file/local;1"].createInstance(nsILocalFile);
			f.initWithPath($("#destDir").val());
			fp.displayDirectory = f;
		} catch (e) {}
		var rv = fp.show();
		if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace) {
			$("#destDir").val(fp.file.path);
			Dontprint.platformTools.setPrefs({destDir: fp.file.path});
		}
	}


	function emailSuffixChange(element) {
		var suffix = $("#recipientEmailSuffix").val();
		if (suffix === "@kindle.com" || suffix === "@kindle.cn") {
			$("#warning-suffix").text(suffix);
			$("#warning-charges").show();
		} else {
			$("#warning-charges").hide();
		}

		$("#emailOtherContainer")[suffix==="other" ? "show" : "hide"]();
		$("#recipientEmailPrefix").prop("disabled", suffix==="other");

		checkEmailVerificationStatus();
	}


	function checkEmailVerificationStatus() {
		var email = "";
		var suffix = $("#recipientEmailSuffix").val();
		if (suffix === "other") {
			email = $("#recipientEmailOther").val();
		} else {
			email = $("#recipientEmailPrefix").val() + suffix;
		}

		var verified = dp.prefs.verifiedEmails.indexOf(email.toLowerCase()) !== -1;
		if (verified) {
			$("#verificationStatus").addClass("verificationStatusOk");
			$("#verificationProgress,#verificationCodeContainer").hide();
		} else {
			$("#verificationStatus").removeClass("verificationStatusOk");
			$("#verificationProgress,#verificationCodeContainer").show();
		}
	}


	function initDevicePane() {
		$("#sendScreenSettigns").prop("checked", false);
		$("#sendScreenSettingsOtherContainer").hide();
		attachPref("value", "otherEreaderModel");

		$("#sendTestEmailButton").click(function() {
			transferTestDocument(
				$(this),
				"measurement-only",
				"Dontprint can transfer a small document to your e-reader that will assist you in finding out its exact screen size. Would you like to send this document now?"
			)
		});

		modelSettings[dp.prefs.ereaderModel] = {
			screenWidth: dp.prefs.screenWidth,
			screenHeight: dp.prefs.screenHeight,
			screenPpi: dp.prefs.screenPpi
		};

		ModelPicker.init({
			selection: dp.prefs.ereaderModel,
			beforeModelSelectListener,
			modelSelectListener
		});
	}


	function initMarginsPane() {
		marginsPaneInitialized = true;
		$("#journalLongname,#journalShortname,#mindate,#maxdate").change(updateSelectedFilter).keyup(updateSelectedFilter);
		$("#mindateSwitch").change(dateSwitchClicked.bind(this, "min"));
		$("#maxdateSwitch").change(dateSwitchClicked.bind(this, "max"));
		$("#newFilterBtn").click(newJournalFilter);
		$("#deleteFilterBtn").click(deleteJournalFilter);
		$(window).on("unload", unload);

		Dontprint.getJournalFilters().then(
			function(sqlresult) {
				marginsPaneInitializedSuccessfully = true;

				var fields = ["id", "longname", "shortname", "minDate", "maxDate",  "coverpage", "k2pdfoptParams", "scale"];
				var floatFields = ["m1", "m2", "m3", "m4"];
				
				journalFilters = new Array(sqlresult.length);
				journalFilterList = $("#filterList");
				journalFilterList.empty();

				for (var i=0; i<sqlresult.length; i++) {
					var origfilter = sqlresult[i];
					var filter = {};
					filter.enabled = 1;
					fields.forEach(function(key) {
						filter[key] = origfilter.getResultByName(key);
					});
					floatFields.forEach(function(key) {
						filter[key] = parseFloat(origfilter.getResultByName(key));
					});
					journalFilterMap[filter.id] = i;
					journalFilters[i] = filter;
					var attr = {
					    value: i,
					    text: makeJournalFilterLabel(filter)
					};
					if (filter.id < 0) {
						attr.class = "builtin";
					}
					journalFilterList.append($("<option>", attr));
				}

				journalFilterList.change(journalFilterSelect);
				journalFilterList.val(0);
				journalFilterSelect();
			},
			function(error) {
				if (!marginsPaneInitializedSuccessfully) {
					$("#filterList>option:first").text("An error occured: " + error);
				}
				return;
			});
	}


	function unload() {
		saveOldJournalFilterSelection();
		if ($('#sendScreenSettigns').prop("checked")) {
			Dontprint.sendScreenSettings();
		}
	}


	function makeJournalFilterLabel(j) {
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
		var ret = parseFloat(datestr.replace(/^([+-]?\d{1,4})-(\d\d)-(\d\d)$/, "$1$2$3"));
		return isNaN(ret) ? 0 : ret;
	}


	function journalFilterSelect() {
		saveOldJournalFilterSelection();
		
		selectedJournalFilter = journalFilters[$("#filterList").val()];
		originalSelectedJournalFilter = {};
		for (var key in selectedJournalFilter) {
			originalSelectedJournalFilter[key] = selectedJournalFilter[key];
		};
		
		$("#journalLongname").val(selectedJournalFilter.longname);
		$("#journalShortname").val(selectedJournalFilter.shortname);
		$("#mindateSwitch").prop("checked", selectedJournalFilter.minDate!==0);
		$("#mindate").prop("disabled", selectedJournalFilter.minDate===0);
		if (selectedJournalFilter.minDate !== 0) {
			$("#mindate").val(formatDate(selectedJournalFilter.minDate));
		} else {
			$("#mindate").val("");
		}
		$("#maxdateSwitch").prop("checked", selectedJournalFilter.maxDate!==0);
		$("#maxdate").prop("disabled", selectedJournalFilter.maxDate===0);
		if (selectedJournalFilter.maxDate !== 0) {
			$("#maxdate").val(formatDate(selectedJournalFilter.maxDate));
		} else {
			$("#maxdate").val("");
		}
		$("#m1Input").val(selectedJournalFilter.m1);
		$("#m2Input").val(selectedJournalFilter.m2);
		$("#m3Input").val(selectedJournalFilter.m3);
		$("#m4Input").val(selectedJournalFilter.m4);
		$("#coverpage").prop("checked", selectedJournalFilter.coverpage);
		$("#scale").val(selectedJournalFilter.scale);
		$("#filterK2pdfoptParams").val(selectedJournalFilter.k2pdfoptParams);
	}


	function dateSwitchClicked(minmax) {
		$("#" + minmax + "date").prop("disabled", !$("#" + minmax + "dateSwitch").prop("checked"));
		updateSelectedFilter();
	}


	function updateSelectedFilter() {
		updateVisibleFilterData();
		$('#filterList>option[value="' + journalFilterMap[selectedJournalFilter.id] + '"]').text(makeJournalFilterLabel(selectedJournalFilter));
	}


	function updateVisibleFilterData(sel) {
		if (!sel) {
			sel = selectedJournalFilter;
		}
		sel.longname = $("#journalLongname").val().trim();
		sel.shortname = $("#journalShortname").val().trim();
		sel.minDate = $("#mindateSwitch").prop("checked") ? deformatDate($("#mindate").val()) : 0;
		sel.maxDate = $("#maxdateSwitch").prop("checked") ? deformatDate($("#maxdate").val()) : 0;
	}


	function saveOldJournalFilterSelection() {
		if (!selectedJournalFilter) {
			return;
		}
		
		updateVisibleFilterData(); // sets longname, shortname, minDate, maxDate
		selectedJournalFilter.m1 = parseFloat($("#m1Input").val()).toFixed(1);
		selectedJournalFilter.m2 = parseFloat($("#m2Input").val()).toFixed(1);
		selectedJournalFilter.m3 = parseFloat($("#m3Input").val()).toFixed(1);
		selectedJournalFilter.m4 = parseFloat($("#m4Input").val()).toFixed(1);
		selectedJournalFilter.coverpage = $("#coverpage").prop("checked");
		selectedJournalFilter.scale = $("#scale").val();
		selectedJournalFilter.k2pdfoptParams = $("#filterK2pdfoptParams").val();
		
		// see if anything has been changed (this is necessary because we would
		// otherwise delete builtin journals without a reason and also update
		// the lastModified timestamp.)
		var equal = true;
		for (var key in selectedJournalFilter) {
			// we really want != and not !== here
			if (originalSelectedJournalFilter[key] != selectedJournalFilter[key]) {
				equal = false;
				break;
			}
		}
		
		if (!equal) {
			$('#filterList>option[value="' + journalFilterMap[selectedJournalFilter.id] + '"]').removeClass("builtin");
			Dontprint.saveJournalSettings(selectedJournalFilter).then(function(val) {
				if (val.oldid === val.newid) {
					return;
				}
				var index = null;

				if (typeof val.oldid !== "number") {
					// New journal filter. Must be the one added last to the
					// list, unless several were added in quick succession
					index = journalFilters.length - 1;
				} else {
					index = journalFilterMap[val.oldid];
					delete journalFilterMap[val.oldid];
				}

				journalFilters[index].id = val.newid;
				journalFilterMap[val.newid] = index;
			});
		}
	}


	function newJournalFilter() {
		selectedJournalFilter = null;
		
		var filter = {
			enabled:1, longname:"", shortname:"", minDate:0, maxDate:0,
			m1:5, m2:5, m3:5, m4:5, coverpage:0, k2pdfoptParams:"", scale:"1"
		};

		journalFilters.push(filter);
		$("#filterList").prepend($(
			"<option>",
			{
				value: journalFilters.length-1,
				text: "(new filter)"
			}
		)).val(journalFilters.length-1);
		journalFilterSelect();
		$("#journalLongname").focus();
	}


	function deleteJournalFilter() {
		if (!selectedJournalFilter) {
			return;
		}
		
		Dontprint.deleteJournalSettings(selectedJournalFilter.id, null);
		delete journalFilterMap[selectedJournalFilter.id];
		journalFilters[$("#filterList").val()] = undefined; // Don't delete the entry from the array because we still want to reserve its index
		var oldsel = $("#filterList>:selected");
		var newsel = oldsel.next();
		if (!newsel.length) {
			newsel = oldsel.prev();
		}
		selectedJournalFilter = null;
		oldsel.remove();
		if (newsel.length) {
			$("#filterList").val(newsel.val());
		}

		journalFilterSelect();
	}


	function initAdvancedPane() {
		attachPref("checked", "neverReportJournalSettings");
		attachPref("value", "k2pdfoptAdditionalParams");

		if (Dontprint.platformTools.platform === "firefox") {
			attachPref("value", "k2pdfoptPath");

			$("#checkForK2pdfoptUpdateButton").click(checkForK2pdfoptUpdate);
			$("#updateK2pdfoptButton").click(updateK2pdfopt);
			$("#updateK2pdfoptManuallyButton").click(updateK2pdfoptManually);

			if (dp.prefs.k2pdfoptPlatform.substr(0,7) === "unknown") {
				dp.prefs.k2pdfoptPlatform = "src";
				$("#updateK2pdfoptButton").hide();
			}

			Dontprint.detectK2pdfoptVersion().then(
				function(versionString) {
					k2pdfoptInstalledVersion = versionString;
					$("#k2pdfoptInstalledVersion").text("version " + versionString);
					$("#checkForK2pdfoptUpdateButton").removeAttr("disabled");
				},
				function() {
					k2pdfoptInstalledVersion = "0";
					$("#k2pdfoptInstalledVersion").text("(Error: k2pdfopt not found)");
					checkForK2pdfoptUpdate();
				}
			);
		}
	}


	function checkForK2pdfoptUpdate() {
		$("#checkForK2pdfoptUpdateButton").attr("disabled", "disabled");
		$("#checkForK2pdfoptUpdateButton").text("Checking for updates...");
		
		function reqListener() {
			k2pdfoptNewVersion = this.response.k2pdfoptVersions[dp.prefs.k2pdfoptPlatform];
			if (Dontprint.compareVersionStrings(k2pdfoptNewVersion, k2pdfoptInstalledVersion) > 0) {
				$("#checkForK2pdfoptUpdateButton").hide();
				$("#k2pdfoptUpdateVersion_label").text("version " + k2pdfoptNewVersion);
				$("#k2pdfoptUpdateInformation").show();
			} else {
				$("#checkForK2pdfoptUpdateButton").text("No update available.");
			}
		}

		var req = Dontprint.platformTools.xhr();
		req.onload = reqListener;
		req.responseType = "json";
		req.open("get", "http://dontprint.net/k2pdfopt/versions.json", true);
		req.send();
	}


	function updateK2pdfopt() {
		$("#updateK2pdfoptButton, #updateK2pdfoptManuallyButton").hide();
		var statusDisplay = $("#k2pdfoptInstalledVersion");
		statusDisplay.text("K2pdfopt is being updated to version " + k2pdfoptNewVersion + "...");

		Dontprint.downloadK2pdfopt(
			dp.prefs,
			function(progress) {
				statusDisplay.text("K2pdfopt is being updated to version " + k2pdfoptNewVersion + " (" + Math.round(progress*100) + "% done)...");
			}
		).then(
			function() {
				statusDisplay.text("Update to version " + k2pdfoptNewVersion + " completed.");
			},
			function(e) {
 				statusDisplay.text("Error: The downloaded file seems to be currupted." + e.toString());
 			}
 		);
	}


	function updateK2pdfoptManually() {
		$("#updateK2pdfoptButton, #updateK2pdfoptManuallyButton").hide();
		$("#k2pdfoptUpdateManuallyInstructions, #k2pdfoptManualUpdatePathRow").show();
	}


	function beforeModelSelectListener(modelName) {
		if (modelName) {
			screenSettingsChange();  // remember user settings of old model
		}
		return true;
	}


	function modelSelectListener(modelName) {
		var model = ModelPicker.models[modelName];
		var res = $('#model-result');
		if (model) {
			var modelDefaults = dp.EREADER_MODEL_DEFAULTS[modelName];
			$('#model-result-text').text(model.label);
			if (modelName==="other") {
				$('#recomendations').hide();
				if ($('#sendScreenSettigns').prop("checked")) {
					$('#sendScreenSettingsOtherContainer').slideDown();
				}
			} else {
				$('#recommendedWidth').text(modelDefaults.screenWidth);
				$('#recommendedHeight').text(modelDefaults.screenHeight);
				$('#recommendedPpi').text(modelDefaults.screenPpi);
				$('#recomendations').show();
				$('#sendScreenSettingsOtherContainer').slideUp();
				$('#otherEreaderModel').val("");
			}
			var userSettings = modelSettings[modelName] ? modelSettings[modelName] : modelDefaults;
			for (var key in userSettings) {
				if (userSettings[key] === -1) {
					userSettings[key] = modelDefaults[key];
				}
			}
			$('#widthinput').val(userSettings.screenWidth);
			$('#heightinput').val(userSettings.screenHeight);
			$('#ppiinput').val(userSettings.screenPpi);
			
			Dontprint.platformTools.setPrefs({ereaderModel: modelName});
			screenSettingsChange();  // write new screen size settings to preferences
			
	 		res.slideDown(400);
			var left = model.node.position().left;
			scrollModelsTo(left, left+model.node.outerWidth());
		} else {
			res.slideUp();
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


	function screenSettingsChange() {
		var modname = ModelPicker.selection;
		var defs = dp.EREADER_MODEL_DEFAULTS[modname];
		if (!defs) {
			// nothing was selected
			return;
		}
		if (!modelSettings[modname]) {
			for (var key in defs) {
				modelSettings[modname] = {};
				modelSettings[modname][key] = defs[key];
			}
		}
		var alldefaults = true;
		function checkChange(el, preference) {
			if (el.get(0).validity.valid) {
				modelSettings[modname][preference] = parseInt(el.val(), 10);
			}
			if (modelSettings[modname][preference] != defs[preference]) {
				alldefaults = false;
			}
		}
		
		checkChange($('#widthinput'), 'screenWidth');
		checkChange($('#heightinput'), 'screenHeight');
		checkChange($('#ppiinput'), 'screenPpi');
		
		// Store -1 if ALL values are default. This way, they will implicitly be updated if defaults change.
		var newvalues = alldefaults ? {
			screenWidth: -1,
			screenHeight: -1,
			screenPpi: -1
		} : modelSettings[modname];
		Dontprint.platformTools.setPrefs(newvalues);
	}


	function transferTestDocument(button, directory, question) {
		if (confirm(question)) {
			var pdfurl = "http://dontprint.net/test-documents/" + Dontprint.platformTools.platform + "/" + directory + "/" + dp.prefs.ereaderModel + ".pdf";
			button.attr("disabled", "disabled");
			button.text("Please wait...");
			Dontprint.runJob({
				jobType: "test",
				title: "Dontprint test document",
				pdfurl,
				progressListener: function(job) {
					switch (job.state) {
						case "success":
							button.text("Done.");
							break;

						case "error":
							button.text("An error occured.");
							break;
					}
				}
			});
		}
	}


	$('#sendScreenSettingsDetails').click(function() {
		var model = ModelPicker.selection === "other" ? "other (" + ($('#otherEreaderModel').val() === "" ? "unknown" : $('#otherEreaderModel').val()) + ")" : ModelPicker.models[ModelPicker.selection].label;
		alert(
			"If you check this box then Dontprint will send the following data to its developer:" +
			"\n - e-reader model: " + model +
			"\n - width: " + $('#widthinput').val() +
			"\n - height: " + $('#heightinput').val() + 
			"\n - pixels per inch: " + $('#ppiinput').val() +
			"\n\nDontprint will NOT send any personal data (such as e-mail addresses). The above data will be sent as soon as you close this tab."
		);
		return false;
	});

	$('#sendScreenSettigns').change(function() {
		if (ModelPicker.selection === "other") {
			if ($(this).prop("checked")) {
				$('#sendScreenSettingsOtherContainer').slideDown();
			} else {
				$('#sendScreenSettingsOtherContainer').slideUp();
				$('#otherEreaderModel').val("");
			}
		}
		return false;
	});

	$('#widthinput,#heightinput,#ppiinput').change(screenSettingsChange).keyup(screenSettingsChange);
});