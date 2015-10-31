"use strict";

/**
 * Assumes that the state never moves backward.
 */
function updateJobUi(job, uistate, hideSoon, removeItem, onDone, Dontprint) {
	if (job.state === "closed") {
		removeItem(job.id);
	}

	if (uistate.jobNode.hasClass("complete")) {
		return;
	}

	uistate.titleNode.text(job.title);

	switch (job.state) {
		case "downloading":
			uistate.downloadBar.width(100 * job.downloadProgress + "%");
			uistate.downloadNode.addClass("current");
			break;

		case "cropping":
			uistate.downloadNode.addClass("done");
			uistate.cropNode.addClass("current");
			break;

		case "converting":
			uistate.convertBar.width(100 * job.convertProgress + "%");
			uistate.downloadNode.addClass("done");
			uistate.cropNode.addClass("done");
			uistate.convertNode.addClass("current");
			break;

		case "sending":
			uistate.sendBar.width(100 * job.uploadProgress + "%");
			uistate.downloadNode.addClass("done");
			uistate.cropNode.addClass("done");
			uistate.convertNode.addClass("done");
			uistate.sendNode.addClass("current");
			break;

		case "error":
			uistate.jobNode.addClass("complete");
			uistate.jobNode.append($('<div class="error">An error occured. <input type="button" value="details"></div>'));
			uistate.jobNode.find("input").click(function() {
				// Don't use ".click(Dontprint.platformTools.highlightTab.bind(job.resultTab))"
				// because job.resultTab will probably be set
				// only after execution of this code.
				Dontprint.platformTools.highlightTab(job.resultTab);
			});
			onDone(job.id);
			break;

		case "success":
			uistate.jobNode.addClass("complete");
			if (job.transferMethod === "email") {
				uistate.jobNode.append($('<div class="success">The document has been successfully sent to your e-reader.</div>'));
			} else {
				uistate.jobNode.append($('<div class="success">The document has been successfully converted and saved.</div>'));
			}
			onDone(job.id);
			hideSoon(job.id);
			break;

		case "canceled":
			uistate.jobNode.addClass("complete");
			uistate.jobNode.append($('<div class="canceled">The job has been canceled on your request.</div>'));
			onDone(job.id);
			hideSoon(job.id);
			break;

		default:
			break;
	}
}