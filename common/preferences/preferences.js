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
		initTransferMethodPane();
		initDevicePane();
		initAdvancedPane();
		$(window).bind("hashchange", hashchange);
		hashchange();
	});


	function hashchange(e) {
		let pane = [];
		let m = location.hash.match(/^#(\w+)/);
		if (m) {
			pane = $("#pane-" + m[1]);
		}
		if (!pane.length) {
			pane = $(".pane:eq(0)");
		}

		let paneName = pane.attr("id").substr(5);
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

		// $("#sendVerificationCodeBtn).click(TODO)
		// TODO: confirmVerificationCodeBtn

		$("#testEmailSettingsBtn").click(transferTestDocument.bind(this, "TODO:congrat.pdf", "Dontprint can send a small test document to your e-reader's e-mail address. Would you like to send this document now?"));
	}


	function emailSuffixChange(element) {
		let suffix = $("#recipientEmailSuffix").val();
		if (suffix === "@kindle.com" || suffix === "@kindle.cn") {
			$("#warning-suffix").text(suffix);
			$("#warning-charges").show();
		} else {
			$("#warning-charges").hide();
		}

		$("#emailOtherContainer")[suffix==="other" ? "show" : "hide"]();

		checkEmailVerificationStatus();
	}


	function checkEmailVerificationStatus() {
		let email = "";
		let suffix = $("#recipientEmailSuffix").val();
		if (suffix === "other") {
			email = $("#recipientEmailOther").val();
		} else {
			email = $("#recipientEmailPrefix").val() + suffix;
		}

		let verified = dp.prefs.verifiedEmails.indexOf(email) !== -1;
		if (verified) {
			$("#verificationStatus").addClass("verificationStatusOk");
			$("#verificationProgress,#verificationCodeContainer").hide();
		} else {
			$("#verificationStatus").removeClass("verificationStatusOk");
			$("#verificationProgress,#verificationCodeContainer").show();
		}
	}


	function initDevicePane() {
		attachPref("checked", "sendScreenSettigns");
		$("#sendScreenSettingsOtherContainer").hide();
		attachPref("value", "otherEreaderModel");

		$("#sendTestEmailButton").click(transferTestDocument.bind(this, "TODO:measurement.pdf", "Dontprint can transfer a small document to your e-reader that will assist you in finding out its exact screen size. Would you like to send this document now?"));

		modelSettings[dp.prefs.ereaderModel] = {
			screenWidth: dp.prefs.screenWidth,
			screenHeight: dp.prefs.screenHeight,
			screenPpi: dp.prefs.screenPpi
		};

		ModelPicker.init({
			selection: dp.prefs.ereaderModel,
			beforeModelSelectListener,
			modelSelectListener,
			filterChangeListener,
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
		$(window).on("unload", saveOldJournalFilterSelection);

		Dontprint.getJournalFilters().then(
			function(sqlresult) {
				marginsPaneInitializedSuccessfully = true;

				var fields = ["id", "longname", "shortname", "minDate", "maxDate",  "coverpage", "k2pdfoptParams", "scale"];
				var floatFields = ["m1", "m2", "m3", "m4"];
				
				journalFilters = sqlresult;
				journalFilterList = $("#filterList");
				journalFilterList.empty();

				for (let i=0; i<journalFilters.length; i++) {
					let filter = journalFilters[i];
					journalFilterMap[filter.id] = i;
					filter.enabled = 1;
					floatFields.forEach(function(key) {
						filter[key] = parseFloat(filter[key]);
					});
					let attr = {
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
		let ret = parseFloat(datestr.replace(/^([+-]?\d{1,4})-(\d\d)-(\d\d)$/, "$1$2$3"));
		return isNaN(ret) ? 0 : ret;
	}


	function journalFilterSelect() {
		saveOldJournalFilterSelection();
		
		selectedJournalFilter = journalFilters[$("#filterList").val()];
		originalSelectedJournalFilter = {};
		for (let key in selectedJournalFilter) {
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
		$("#filterList>:selected").text(makeJournalFilterLabel(selectedJournalFilter));
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
				let index = null;

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
		
		let filter = {
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
		let oldsel = $("#filterList>:selected");
		let newsel = oldsel.next();
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
		attachPref("value", "k2pdfoptParams");
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
			for (let key in userSettings) {
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


	function filterChangeListener() {
		let left = null;
		let right = null;
		let count = 0;
		let otherAllowed = ModelPicker.models[ModelPicker.questions['START'].filter[1]].enabled;
		for (let mod in ModelPicker.models) {
			if (ModelPicker.models[mod].enabled) {
				count++;
				if (otherAllowed || mod!=="other") {
					let l = ModelPicker.models[mod].node.position().left;
					let r = l + ModelPicker.models[mod].node.outerWidth();
					if (left===null || l<left) {
						left = l;
					}
					if (right===null || r>right) {
						right = r;
					}
				}
			}
		}
		if (count>1) {
			// if count===1, scrollModelsTo will be called from beforeModelSelectListener()
			scrollModelsTo(left, right);
		}
	}


	function scrollModelsTo(left, right) {
		let width = $('#model-select-container').innerWidth();
		let scrollPos = $('#model-select-container').scrollLeft();
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
		let modname = ModelPicker.selection;
		let defs = dp.EREADER_MODEL_DEFAULTS[modname];
		if (!defs) {
			// nothing was selected
			return;
		}
		if (!modelSettings[modname]) {
			for (let key in defs) {
				modelSettings[modname] = {};
				modelSettings[modname][key] = defs[key];
			}
		}
		let alldefaults = true;
		function checkChange(el, preference) {
			if (el.get(0).validity.valid) {
				modelSettings[modname][preference] = el.val();
			}
			if (modelSettings[modname][preference] != defs[preference]) {
				alldefaults = false;
			}
		}
		
		checkChange($('#widthinput'), 'screenWidth');
		checkChange($('#heightinput'), 'screenHeight');
		checkChange($('#ppiinput'), 'screenPpi');
		
		// Store -1 if ALL values are default. This way, they will implicitly be updated if defaults change.
		let newvalues = alldefaults ? {
			screenWidth: -1,
			screenHeight: -1,
			screenPpi: -1
		} : modelSettings[modname];
		Dontprint.platformTools.setPrefs(newvalues);
	}


	function transferTestDocument(button, url, question) {
		if (confirm(question)) {
			button.prop("disabled", true);
			button.text("Please wait...");
			// Dontprint.testDocument(function() {
			// 	that.textContent = "Document transferred.";
			// }); TODO
		}
	}


	$('#sendScreenSettingsDetails').click(function() {
		let model = ModelPicker.selection === "other" ? "other (" + ($('#otherEreaderModel').val() === "" ? "unknown" : $('#otherEreaderModel').val()) + ")" : ModelPicker.models[ModelPicker.selection].label;
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