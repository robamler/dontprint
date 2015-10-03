"use strict";

(function() {
	var items = {};
	var wasRemoved = {};
	var queue = null;
	var successMessage = {
		email: '<div class="success">The document has been successfully sent to your e-reader.</div>',
		directory: '<div class="success">The document has been successfully converted and saved.</div>'
	};

	var returnHandlers = {
		connect: onConnect
	};
	var exportedFunctions = {
		updateJob
	};
	var connector = chrome.runtime.connect({name: "progress"});
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


	function onConnect(jobs) {
		queue = $("#queue");
		queue.empty();
		for (var id in jobs) {
			addJob(jobs[id]);
		}
	};


	function addJob(job) {
		var jobNode = $('<div class="job"><a href="#" class="del" title="click to abort job"></a><div class="jtitle">Retrieving article meta data...</div><table class="tasks"><tr><td><div class="task"><div class="bar"></div><div class="tlabel">download</div></div></td><td><div class="task">crop</div></td><td><div class="task"><div class="bar"></div><div class="tlabel">convert</div></div></td>' + (job.transferMethod==="email" ? '<td><div class="task"><div class="bar"></div><div class="tlabel">send</div></div></td>' : '') + '</tr></table></div>');

		var tasks = jobNode.find('.task');
		var bars = jobNode.find('.bar');
		var item = {
			jobNode:		jobNode,
			titleNode:		jobNode.find(".jtitle"),
			delBtn:			jobNode.find('.del'),
			tasksNode:		jobNode.find(".tasks"),
			downloadNode:	tasks.eq(0),
			cropNode:		tasks.eq(1),
			convertNode:	tasks.eq(2),
			sendNode:		tasks.eq(3),
			downloadBar:	bars.eq(0),
			convertBar:		bars.eq(1),
			sendBar:		bars.eq(2)
		};

		item.delBtn.click(function() {
			callRemote("abortJob", job.id);
			return false;
		});

		items[job.id] = item; // add item to items *before* calling updateJob
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

		updateJobUi(job, item, hideSoon, removeItem, function(){});
	}


	function removeItem(jobId) {
		var item = items[jobId];
		if (item !== undefined) {
			delete items[jobId];
			wasRemoved[jobId] = true;
			setTimeout(function() {
				delete wasRemoved[jobId];
			}, 600000); // 10 minutes

			item.jobNode.fadeTo(400, 0).delay(400).slideUp(400, function() {
				item.jobNode.remove()
			});
		}
	}


	function hideSoon(jobId) {
		setTimeout(function() {
			removeItem(jobId);
		}, 60000);
	}
}());