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
	var returnHandlers = {
		connect: onConnect,
		dontprintArticleFromPage: onPopupConnected,
		connectPopupToJob: onPopupConnected
	};
	var exportedFunctions = {
		updateJob
	};
	var connector = chrome.runtime.connect({name: "popup"});
	connector.onMessage.addListener(onMessage);


	function onMessage(message) {
		if (message.call) {
			exportedFunctions[message.call].apply(this, message.args);
		} else if (message.returnFrom) {
			returnHandlers[message.returnFrom].apply(this, message.args);
		}
	}


	function callRemote(funcName) {
		connector.postMessage({
			call: funcName,
			args: Array.prototype.slice.call(arguments, 1)
		});
	}


	function initUI() {
		$("#hideLink").click(function() {
			window.close();
			return false;
		});
		$("#showallLink").click(function() {
			callRemote("showProgress", tabId);
			return false;
		});
		$("#settingsLink").click(function() {
			callRemote("openSettings", tabId);
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


	function onConnect() {
		if (isNaN(jobId)) {
			runNewJob();
		} else {
			connectToJob();
		}
	}


	function runNewJob() {
		chrome.pageAction.setTitle({
			tabId,
			title: "Dontprint in progress (click for details)..."
		});
		chrome.pageAction.setIcon({
			tabId,
			path: {
				"19": "../images/dontprint-working-19px.png",
				"38": "../images/dontprint-working-38px.png"
			}
		});

		chrome.tabs.get(
			tabId,
			function (tab) {
				callRemote("dontprintArticleFromPage", tab.url, tabId, tab.windowId);
			}
		);
	}


	function connectToJob() {
		callRemote("connectPopupToJob", jobId);
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
			window.setTimeout(
				callRemote.bind(this, "abortJob", job.id),
				0
			);
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