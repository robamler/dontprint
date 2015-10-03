"use strict";

function updateJobUi(job, uistate, hideSoon, removeItem, onDone) {
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
			uistate.jobNode.find("input").click(callRemote.bind("raiseErrorTab", this, job.id));
			onDone(job.id);
			break;

		case "success":
			uistate.jobNode.addClass("complete");
			uistate.jobNode.append($(successMessage[job.transferMethod]));
			onDone(job.id);
			hideSoon(job.id);
			break;

		case "canceled":
			uistate.jobNode.addClass("complete");
			uistate.jobNode.append($('<div class="canceled">The job has been canceled on your request.</div>'));
			onDone(job.id);
			hideSoon(job.id);
			break;

		case "closed":
			onDone(job.id);
			removeItem(job.id);
			break;

		default:
			break;
	}
}