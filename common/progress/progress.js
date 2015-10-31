"use strict";

$(function() {
	var items = {};
	var wasRemoved = {};
	var queue = null;
	var Dontprint = null;


	PlatformTools.getMainComponentInternally("Dontprint", "@robamler.github.com/dontprint;1").then(function(dp) {
		Dontprint = dp;

		var jobs = Dontprint.getAllRunningJobs();
		queue = $("#queue");
		queue.empty();
		for (var id in jobs) {
			addJob(jobs[id]);
		}

		Dontprint.addProgressListener(updateJob);
		$(window).unload(function(event) {
			Dontprint.removeProgressListener(updateJob);
		});

		$("#settingsBtn").click(function() {
			Dontprint.openSettings();
		});

		if (Dontprint.platformTools.platform === "firefox") {
			Dontprint.platformTools.getPrefs({
				autoShowProgress: true
			}).then(function(prefs) {;
				$("#autoShowProgress").prop("checked", prefs.autoShowProgress).change(
					function() {
						Dontprint.platformTools.setPrefs({
							autoShowProgress: this.checked
						});
					}
				);
				$("#footer").show();
			});
		}
	});


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
			Dontprint.abortJob(job.id);
			return false;
		});

		items[job.id] = item; // add item to items *before* calling updateJob
		updateJob(job);

		queue.append(jobNode);
	}


	function updateJob(job) {
		if (wasRemoved[job.id]) {
			return;
		}
		var item = items[job.id];
		if (item === undefined) {
			if (job.state !== "closed") {
				addJob(job);
			}
			return;
		}

		updateJobUi(job, item, hideSoon, removeItem, function(){}, Dontprint);
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
});