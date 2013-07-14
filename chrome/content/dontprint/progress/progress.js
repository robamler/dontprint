// global variables
var items = {};
var wasRemoved = {};
var queue = null;
var progressId = null;
var donptrint = null;

function init(jobs, aProgressId, aDontprint) {
// 	alert(!!Dontprint);
	queue = $("#queue");
	progressId = aProgressId;
	dontprint = aDontprint;
	queue.empty();
	for (var id in jobs) {
		addJob(jobs[id]);
	}
}


/**
 * Don't call addJob() from outside. Call updateJob() instead.
 */
function addJob(job) {
	var jobNode = $('<div class="job"><a href="#" class="del" title="click to abort job"></a><div class="jtitle"></div><table class="tasks"><tr><td><div class="task"><div class="bar"></div><div class="tlabel">download</div></div></td><td><div class="task">crop</div></td><td><div class="task"><div class="bar"></div><div class="tlabel">convert</div></div></td><td><div class="task"><div class="bar"></div><div class="tlabel">upload</div></div></td><td><div class="task">send</div></td></tr></table></div>');
	
	var item = {
		jobNode:		jobNode,
		titleNode:		jobNode.find('.jtitle'),
		delBtn:			jobNode.find('.del'),
		tasksNode:		jobNode.find('.tasks'),
		downloadNode:	jobNode.find('.task').eq(0),
		cropNode:		jobNode.find('.task').eq(1),
		convertNode:	jobNode.find('.task').eq(2),
		uploadNode:		jobNode.find('.task').eq(3),
		sendNode:		jobNode.find('.task').eq(4),
		downloadBar:	jobNode.find('.bar').eq(0),
		convertBar:		jobNode.find('.bar').eq(1),
		uploadBar:		jobNode.find('.bar').eq(2)
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
	var item = items[job.id];
	if (item === undefined && wasRemoved[job.id] === undefined) {
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
		
	case "authorizing":
	case "uploading":
		item.uploadBar.width(100*job.uploadProgress + "%");
		item.downloadNode.addClass("done");
		item.cropNode.addClass("done");
		item.convertNode.addClass("done");
		item.uploadNode.addClass("current");
		break;
		
	case "sending":
		item.downloadNode.addClass("done");
		item.cropNode.addClass("done");
		item.convertNode.addClass("done");
		item.uploadNode.addClass("done");
		item.sendNode.addClass("current");
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
			item.jobNode.append($('<div class="success">The document has been sent to your e-reader.</div>'));
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
	dontprint.abortJob(jobid);
}


function hideSoon(jobid) {
	setTimeout(function() {
		removeItem(jobid);
	}, 60000);
}
