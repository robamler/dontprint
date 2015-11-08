"use strict";

$(function() {
	var successMessage = {
		email: '<div class="success">Document successfully sent to your e-reader.</div>',
		directory: '<div class="success">Document successfully converted and saved.</div>'
	};
	var hashdata = location.hash.substr(1).split("|");
	var tabId = parseInt(hashdata[0], 10);
	var jobType = hashdata[1];
	var jobId = parseInt(hashdata[2], 10);
	var uistate = null;
	var exportedFunctions = {//TODO
		updateJob
	};

	var Dontprint = null;

	PlatformTools.getMainComponentInternally("Dontprint", "@robamler.github.com/dontprint;1").then(function(dp) {
		Dontprint = dp;

		uistate = initUI();

		if (isNaN(jobId)) {
			runNewJob();
		} else {
			connectToJob();
		}
	});


	function initUI() {
		$("#hideLink").click(function() {
			window.close();
			return false;
		});
		$("#showallLink").click(function() {
			Dontprint.showProgress(tabId);
			return false;
		});
		$("#settingsLink").click(function() {
			Dontprint.openSettings(tabId);
			return false;
		});

		let tasks = $(".task");
		let bars = $(".bar");
		return {
			jobNode:		$(".job"),
			titleNode:		$(".jtitle"),
			tasksNode:		$(".tasks"),
			downloadNode:	tasks.eq(0),
			cropNode:		tasks.eq(1),
			convertNode:	tasks.eq(2),
			sendNode:		tasks.eq(3),
			downloadBar:	bars.eq(0),
			convertBar:		bars.eq(1),
			sendBar:		bars.eq(2)
		};
	}


	function runNewJob() {
		chrome.pageAction.setTitle({
			tabId,
			title: "Dontprint in progress (click for details)..."
		});
		chrome.pageAction.setIcon({
			tabId,
			path: {
				"19": "dontprint-busy-19px.png",
				"38": "dontprint-busy-38px.png"
			}
		});

		chrome.tabs.get(
			tabId,
			function (tab) {
				let job = {
					jobType,
					pageurl: tab.url.split("#")[0],
					tabId,
					windowId: tab.windowId,
					progressListener: updateJob,
					popupConnector: onPopupConnected
				};

				if (jobType === "page") {
					job.title = "Retrieving article meta data...";
				} else if (jobType === "pdfurl") {
					let m = tab.url.match(/\/([^/]+?)(\.pdf)?\/?([#?].*)?$/);
					job.title = m ? m[1] : "Unknown title";
					job.forceCropWindow = true;
					job.pdfurl = tab.url;
				}

				Dontprint.runJob(job);
			}
		);
	}


	function connectToJob() {
		Dontprint.connectPopupToJob(jobId, onPopupConnected, updateJob);
	}


	function onPopupConnected(job) {
		if (!job) {
			uistate.jobNode.text("Dontprint is done processing this page. If you would like to run Dontprint on this page again, please reload the page.");
			$("#hideLink").attr("title", "");
			$("#abortLink").hide();
			$("#reloadLink").click(function() {
				chrome.tabs.reload();
				window.close();
				return false;
			}).show();

			return;
		}

		jobId = job.id;
		$("#abortLink").click(function() {
			$("#abortLink").text("Aborting...");
			Dontprint.abortJob(job.id);
			return false;
		});
		if (job.transferMethod === "directory") {
			$("#sendtask").hide();
		}

		updateJob(job);
	}


	function updateJob(job) {
		if (job.state === "error") {
			// Work around a curious issue (error tab won't be opened until
			// we close the popup; success tab works, though.)
			window.close();
		} else {
			updateJobUi(job, uistate, noop, noop, onDone, Dontprint);
		}
	}


	function noop() {}


	function onDone() {
		$("#hideLink").attr("title", "");
		$("#abortLinkContainer").hide();
	}
});