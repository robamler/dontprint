"use strict";

$(function() {
	var successMessage = {
		email: '<div class="success">Document successfully sent to your e-reader.</div>',
		directory: '<div class="success">Document successfully converted and saved.</div>'
	};
	var hashdata = location.hash.substr(1).split("|");
	var tabId = parseInt(hashdata[0]);
	var jobId = parseInt(hashdata[1]);
	var uistate = initUI();
	var returnHandlers = {//TODO
		// connect: onConnect,
		// dontprintArticleFromPage: onPopupConnected,
		// connectPopupToJob: onPopupConnected
	};
	var exportedFunctions = {//TODO
		updateJob
	};

	var Dontprint = null;

	PlatformTools.getComponentInternally("Dontprint").then(function(dp) {
		console.log(dp);
		console.log(jobId);
		console.log(tabId);
		Dontprint = dp;
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
				Dontprint.dontprintArticleFromPage(tab.url, tabId, tab.windowId, updateJob);
			}
		);
	}


	function connectToJob() {
		Dontprint.connectPopupToJob(jobId);
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
		updateJobUi(job, uistate, function(){}, window.close, onDone);
	}


	function onDone() {
		$("#hideLink").attr("title", "");
		$("#abortLinkContainer").hide();
	}
});