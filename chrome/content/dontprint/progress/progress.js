// global variables
var Dontprint = Components.classes['@robamler.github.com/dontprint;1'].getService().wrappedJSObject;
var listenerId = null;
var items = {};
var wasRemoved = {};
var queue = null;
var successMessage = {
	email: '<div class="success">The document has been successfully sent to your e-reader.</div>',
	directory: '<div class="success">The document has been successfully converted and saved.</div>'
};


// initialization
$(function() {
	$('#autoShowProgress').prop(
		'checked', Dontprint.getPrefs().getBoolPref("autoShowProgress")
	).click(function() {
		Dontprint.getPrefs().setBoolPref("autoShowProgress", this.checked)
	});
	
	queue = $("#queue");
	queue.empty();
	listenerId = Dontprint.registerProgressListener(updateJob);
	var jobs = Dontprint.getRunningJobs();
	for (var id in jobs) {
		addJob(jobs[id]);
	}
});


$(window).unload(function() {
	Dontprint.unregisterProgressListener(listenerId);
});


/**
 * Don't call addJob() from outside. Call updateJob() instead.
 */
function addJob(job) {
	var tmethod = Dontprint.getPrefs().getCharPref("transferMethod");
	var jobNode = $('<div class="job"><a href="#" class="del" title="click to abort job"></a><div class="jtitle"></div><table class="tasks"><tr><td><div class="task"><div class="bar"></div><div class="tlabel">download</div></div></td><td><div class="task">crop</div></td><td><div class="task"><div class="bar"></div><div class="tlabel">convert</div></div></td><td><div class="task"><div class="bar"></div><div class="tlabel">' + (tmethod==="email" ? "send" : "transfer") + '</div></div></td></tr></table></div>');
	
	var tasks = jobNode.find('.task');
	var bars = jobNode.find('.bar');
	var item = {
		jobNode:		jobNode,
		titleNode:		jobNode.find('.jtitle'),
		delBtn:			jobNode.find('.del'),
		tasksNode:		jobNode.find('.tasks'),
		downloadNode:	tasks.eq(0),
		cropNode:		tasks.eq(1),
		convertNode:	tasks.eq(2),
		lastStepNode:	tasks.eq(3),	// ("send" or "transfer")
		downloadBar:	bars.eq(0),
		convertBar:		bars.eq(1),
		sendBar:		bars.eq(2)
	};
	
	var jobid = job.id;	// use dummy variable so that delBtn.click doesn't need to keep a reference to job
	item.delBtn.click(function() {
		abortJob(jobid);
		return false;
	});
	
	items[job.id] = item;  // add item to items *before* calling updateJob
	updateJob(job);
	
	queue.append(jobNode);
}


/**
 * Assumes that the state never moves backward.
 */
function updateJob(job) {
	if (wasRemoved[job.id]) {
		return;
	}
	var item = items[job.id];
	if (item === undefined) {
		addJob(job);
		return;
	}
	if (item.canceled) {
		return;
	}
	
	item.titleNode.text(job.title);
	
	switch (job.state) {
	case "downloading":
		item.downloadBar.width(100*job.downloadProgress + "%");
		item.downloadNode.addClass("current");
		break;
		
	case "cropping":
		item.downloadNode.addClass("done");
		item.cropNode.addClass("current");
		break;
		
	case "converting":
		item.convertBar.width(100*job.convertProgress + "%");
		item.downloadNode.addClass("done");
		item.cropNode.addClass("done");
		item.convertNode.addClass("current");
		break;
		
	case "sending":
		item.sendBar.width(100*job.uploadProgress + "%");
		// fallthrough
	case "moving":
	case "postTransferCommand":
		item.downloadNode.addClass("done");
		item.cropNode.addClass("done");
		item.convertNode.addClass("done");
		item.lastStepNode.addClass("current");
		break;
		
	case "error":
		if (!item.jobNode.hasClass("complete")) {
			item.jobNode.addClass("complete");
			item.jobNode.append($('<div class="error">An error occured. <input type="button" value="details"></div>'));
		}
		// job.raiseErrorTab may only be set the second time control flow comes here, therefore set clickhandler as soon as raiseErrorTab is set
		if (job.raiseErrorTab !== undefined  &&  !item.raiseErrorTabSet) {
			item.raiseErrorTabSet = true;
			item.jobNode.find('input').click(job.raiseErrorTab);
		}
		break;
		
	case "success":
		if (!item.jobNode.hasClass("complete")) {
			item.jobNode.addClass("complete");
			item.jobNode.append($(successMessage[Dontprint.getPrefs().getCharPref("transferMethod")]));
		}
		hideSoon(job.id);
		break;
	
	case "canceled":
		item.canceled = true;
		if (!item.jobNode.hasClass("complete")) {
			item.jobNode.addClass("complete");
			item.jobNode.append($('<div class="canceled">The job has been canceled on your request.</div>'));
		}
		hideSoon(job.id);
		break;
	
	case "closed":
		removeItem(job.id);
		break;
	
	default:
		break;
	}
}


function removeItem(jobid) {
	var item = items[jobid];
	if (item !== undefined) {
		delete items[jobid];
		wasRemoved[jobid] = true;
		setTimeout(function() {
			delete wasRemoved[jobid];
		}, 600000);	// 10 minutes
		
		item.jobNode.fadeTo(400, 0).delay(400).slideUp(400, function() {
			item.jobNode.remove()
		});
	}
}


function abortJob(jobid) {
	Dontprint.abortJob(jobid);
}


function hideSoon(jobid) {
	setTimeout(function() {
		removeItem(jobid);
	}, 60000);
}
