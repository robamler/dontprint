$(function() {
	// Constants
	const voidfunction = function() {};
	const dirLength = ['width', 'height', 'width', 'height'];
	const dirPos = ['left', 'top', 'right', 'bottom'];
	const dirMousecoord = ['pageX', 'pageY', 'pageX', 'pageY'];
	const dirFactor = [1, 1, -1, -1];

	// variables that represent DOM elements
	var region, doccontainer, pagenumDisplay, pagecountDisplay, canvas, context, magnifycanvas, magnifycontext, viewcontainer, turnpagesheight, magnifyer, prevbtn, nextbtn;

	// status variables
	var handles = [0,0,0,0];
	var margins = [0,0,0,0];
	var inputs = [0,0,0,0];
	var pageloading = false;
	var pageLoadingDeferred = false;
	var dirReference = [0, 0, 0, 0];
	var setMargin = [0,0,0,0];
	var dragfunction = voidfunction;
	var magnifyfunction = voidfunction;
	var dpmm = 1;
	var mmmargins = [0,0,0,0];
	var pxdimensions = [0,0];
	var pagecount = 0;
	var pagenum = 1;
	var availw, origw, availh, origh;
	var pdf, pdfpage;
	var job, builtinJournal;
	var successState = false;
	var Dontprint = null;
	
	PlatformTools.getMainComponentInternally("Dontprint", "@robamler.github.com/dontprint;1").then(function(dp) {
		Dontprint = dp;
		job = Dontprint.getJobFromId(parseInt(location.hash.substr(1), 10));

		if (!job || job.state !== "cropping") {
			// tab was reloaded from session restore or reopened after it was already closed.
			close();
		}
		
		// Initialize DOM elements
		region = $('#region');
		doccontainer = $('#document-container');
		pagenumDisplay = $("#pagenum");
		pagecountDisplay = $("#pagecount");
		canvas = document.getElementById('pdfcanvas');
		context = canvas.getContext('2d');
		magnifycanvas = document.getElementById('magnifycanvas');
		magnifycontext = magnifycanvas.getContext('2d');
		viewcontainer = document.getElementById("view-container");
		turnpagesheight = $("#turnpages").height();
		magnifyer = $("#magnifyer");
		prevbtn = $("#prevbtn");
		nextbtn = $("#nextbtn");

		// set presets
		document.title = "Dontprint: " + job.title;
		builtinJournal = job.crop.id < 0;
		if (job.crop.coverpage) {
			$("#coverpage").prop("checked", true);
		} else {
			$("#allpages").prop("checked", true);
		}
		$("#pagestart").val("1");
		for (var i=1; i<=4; i++) {
			mmmargins[i-1] = parseFloat(job.crop['m'+i]);
		}

		$("#scaleselect").val(job.crop.scale);

		if (!job.crop.longname && !job.crop.shortname) {
			job.prohibitSaveJournalSettings = true;
		}
		if (job.prohibitSaveJournalSettings) {
			$("#remember-display,#sendsettings-display").hide();
			$("#savetemplate,#sendsettings").prop("checked", false);
		} else {
			$('#journalname').text(job.crop.shortname ? job.crop.shortname : job.crop.longname);
			$('#savetemplate').prop("checked", job.crop.rememberPreset);
			if (job.neverReportJournalSettings) {
				$("#sendsettings-display").hide();
			} else {
				$("#sendsettings").prop("checked", true).prop("disabled", !job.crop.rememberPreset);
				$("#sendsettings-display").css("opacity", job.crop.rememberPreset ? 1 : 0.3);
				if (!job.crop.rememberPreset) {
					$('#privacyLink').removeAttr('href');
				}
			}
		}
		$('#additionalParamsCheckbox').prop("checked", job.crop.k2pdfoptParams!=="");
		$('#k2pdfoptParams').prop("disabled", job.crop.k2pdfoptParams==="").val(job.crop.k2pdfoptParams);
		
		// Set up event handlers
		// This hack avoids lookups in the arrays[direction] each time dragfunction is called.
		for (var i=0; i<4; i++) {
			setMargin[i] = (function(direction) {
				return function(mmvalue, blocktext) {
					var pxvalue = dpmm*mmvalue;
					if (isNaN(pxvalue) || pxvalue<0 || pxvalue + dpmm*mmmargins[(direction+2)%4] > pxdimensions[direction%2]-70) {
						return false;
					}
					margins[direction].css(dirLength[direction], pxvalue);
					mmmargins[direction] = mmvalue;
					region.css(dirPos[direction], pxvalue);
					if (!blocktext) {
						inputs[direction].val(mmvalue.toFixed(1));
					}
					return true;
				};
			}(i));
		};

		for (var i=0; i!=4; i++) {
			margins[i] = $("#m"+i);
			handles[i] = $("#h"+i);
			inputs[i] = $("#i"+i);

			handles[i].mouseenter((function(j) {
				return function(event) {
					showMagnifier(event, j);
				};
			}(i))).mouseleave(
				hideMagnifier
			).mousedown((function(j) {
				return function(event) {
					begindrag(event, j);
				};
			}(i)));

			inputs[i].keypress((function(j) {
				return function(event) {
					window.setTimeout(function () {
						textChange(j, true);
					});
				};
			}(i))).blur((function(j) {
				return function(event) {
					textChange(j, false);
				};
			}(i)));
		}

		$(document).mouseup(enddrag);
		$(document).mousemove(mousemove);
		$(window).resize(resize);

		prevbtn.click(function() {
			loadpage(pagenum-1);
			return false;
		});
		nextbtn.click(function() {
			loadpage(pagenum+1);
			return false;
		});

		$("#startbtn").click(startConversion);
		$("#abortbtn").click(abortConversion);
		$("#allpages,#coverpage").click(function() {
			$("#pagestart,#pageend").prop("disabled", true);
			$("#savetemplate").prop("disabled", false);
			$("#remember-display").css("opacity", 1);
			$("#sendsettings").prop("disabled", !$("#savetemplate").prop("checked"));
			$("#sendsettings-display").css("opacity", $("#savetemplate").prop("checked") ? 1 : 0.3);
			if ($("#savetemplate").prop("checked")) {
				$('#privacyLink').attr('href', '#');
			} else {
				$('#privacyLink').removeAttr('href');
			}
		});
		$("#pagerange").click(function() {
			$("#pagestart,#pageend").prop("disabled", false);
			$("#pagestart").focus();
			$("#pagestart").get(0).setSelectionRange(0, $("#pagestart").val().length);
			$("#savetemplate").prop("disabled", true);
			$("#remember-display").css("opacity", 0.3);
			$("#sendsettings").prop("disabled", true);
			$("#sendsettings-display").css("opacity", 0.3);
			$('#privacyLink').removeAttr('href');
		});
		$("#savetemplate").click(function() {
			$("#sendsettings").prop("disabled", !this.checked);
			$("#sendsettings-display").css("opacity", this.checked ? 1 : 0.3);
			if (this.checked) {
				$('#privacyLink').attr('href', '#');
			} else {
				$('#privacyLink').removeAttr('href');
			}
		});
		$("#additionalParamsCheckbox").click(function() {
			$("#k2pdfoptParams").prop("disabled", !this.checked);
			if (this.checked) {
				var paramsTextLen = $("#k2pdfoptParams").focus().val().length;
				$("#k2pdfoptParams").get(0).setSelectionRange(paramsTextLen, paramsTextLen);
			}
		});
		$("#privacyLink").click(showPrivacyTooltip);
		$("#overlay,#closePrivacyTooltip").click(hidePrivacyTooltip);
		$("#privacySettingsLink").click(function(e) {
			e.preventDefault();
			Dontprint.openSettings(undefined, "advanced");
		});
		$(window).unload(windowUnload);

		resize();

		// Load the page
		loadpdf(job.origPdfFile.toURL());
	});

	// private methods
	function loadpage(thepagenum) {
		if (pageloading || thepagenum < 1 || thepagenum > pagecount)
			return false;
	
		pagenum = thepagenum;
		prevbtn.toggleClass("disabled", pagenum === 1);
		nextbtn.toggleClass("disabled", pagenum === pagecount);

		pagenumDisplay.text(pagenum);
		pdf.getPage(pagenum).then(function(page) {
			pdfpage = page;
			// get original size of page
			var viewport = pdfpage.getViewport(1);
			origw = Math.max(1, viewport.width);
			origh = Math.max(1, viewport.height);

			refreshpage();
		});
		return true;
	}

	function donePageLoading() {
		pageloading = false;
		if (pageLoadingDeferred) {
			pageLoadingDeferred = false;
			refreshpage();
		}
	}

	function refreshpage() {
		if (pdfpage === undefined)
			return;
		if (pageloading) {
			pageLoadingDeferred = true;
			return;
		}
		pageloading = true;

		var scale = Math.min(availw/origw, availh/origh);
		var viewport = pdfpage.getViewport(scale);
		pxdimensions = [viewport.width, viewport.height];
		canvas.width = viewport.width;
		canvas.height = viewport.height;
		doccontainer.height(viewport.height);
		doccontainer.width(viewport.width);

		var viewport2 = pdfpage.getViewport(3*scale);
		magnifycanvas.width = viewport2.width;
		magnifycanvas.height = viewport2.height;

		dirReference[0] = dirReference[2] = doccontainer.offset().left;
		dirReference[1] = dirReference[3] = doccontainer.offset().top;
		dirReference[2] += doccontainer.width();
		dirReference[3] += doccontainer.height();


		//
		// Render PDF page into canvas context
		//
		var job1running = true;
		var job2running = true;
		pdfpage.render({canvasContext: context, viewport: viewport}).then(function() {
			job1running = false;
			if (!job2running)
				donePageLoading();
		});
		pdfpage.render({canvasContext: magnifycontext, viewport: viewport2}).then(function() {
			job2running = false;
			if (!job1running)
				donePageLoading();
		});

		dpmm = 72/25.4*scale;
		for (var i=0; i<4; i++)
			setMargin[i](mmmargins[i]);
	}

	function resize(inPdfRendering) {
		availw = Math.max(100, viewcontainer.offsetWidth - 390);
		availh = Math.max(100, viewcontainer.offsetHeight - 55 - turnpagesheight);
		refreshpage();
	}

	function begindrag(event, direction) {
		enddrag();
		region.addClass('dragging');

		// resetting the dragfunction in begindrag() avoids lookups in arrays[dir] each time dragfunction is called
		dragfunction = (function(dir) {
			return function(event) {
				var pxvalue = Math.max(0, dirFactor[dir] * (event[dirMousecoord[dir]] - dirReference[dir]));
				setMargin[dir](pxvalue/dpmm);
			};
		}(direction));

		dragfunction(event);
		magnifyfunction(event)
	}

	function showMagnifier(event, direction) {
		hideMagnifier();
		magnifyer.addClass('dir' + (direction%2));

		// resetting the magnifyfunction in begindrag() avoids lookups in arrays[dir] each time dragfunction is called
		magnifyfunction = (function(dir) {
			return function(event) {
				var pxvalue = mmmargins[dir]*dpmm;
				var pxvalue2 = Math.max(0, dirFactor[(dir+1)%2] * (event[dirMousecoord[(dir+1)%2]] - dirReference[(dir+1)%2]));
				var pos2 = pxvalue2-115;
				if (pos2 < -5 || dir%2===1)  pos2 += 130;
				magnifyer.css(dirPos[dir], pxvalue-75);
				magnifyer.css(dirPos[(dir+1)%2], pos2);
				magnifycanvas.style[dirPos[dir]] = 75-3*pxvalue + "px";
				magnifycanvas.style[dirPos[(dir+1)%2]] = 35-3*pxvalue2 + "px";
			};
		}(direction));

		magnifyfunction(event);
	}

	function hideMagnifier() {
		magnifyer.removeClass('dir0');
		magnifyer.removeClass('dir1');
		for (var i=0; i<4; i++) {
			magnifyer.css(dirPos[i], "auto");
			magnifycanvas.style[dirPos[i]] = "auto";
		}
		magnifyfunction = voidfunction;
	}

	function enddrag() {
		if (dragfunction !== voidfunction) {
			dragfunction = voidfunction;
			region.removeClass('dragging');
		}
	}

	function mousemove(event) {
		dragfunction(event);
		magnifyfunction(event)
	}

	function textChange(dir, block) {
		var mmvalue = parseFloat(inputs[dir].val().trim().replace(",", "."));
		setMargin[dir](mmvalue, block);
	}

	function loadpdf(url) {
		PDFJS.getDocument(url).then(function(loadedpdf) {
			pdf = loadedpdf;
			pagecount = pdf.numPages;
			pagecountDisplay.text(pagecount);
			$('#pagestart').attr("max", pagecount);
			$('#pageend').val(pagecount).attr("max", pagecount);
			loadpage(1);
		});
	}

	function startConversion() {
		if ($("#pagerange").prop("checked")) {
			job.crop.pagerange = $("#pagestart").val().trim() + "-" + $("#pageend").val().trim()
			job.prohibitSaveJournalSettings = true;
		}
		job.crop.enabled        = $("#savetemplate").prop("checked");
		job.crop.coverpage      = $("#coverpage").prop("checked");
		job.crop.scale          = $("#scaleselect").val();
		job.crop.k2pdfoptParams = $("#additionalParamsCheckbox").prop("checked") ? $("#k2pdfoptParams").val().trim() : "";
		job.crop.sendsettings   = $("#sendsettings").prop("checked") && $("#savetemplate").prop("checked") && !job.prohibitSaveJournalSettings && !job.neverReportJournalSettings;
		job.crop.m1             = mmmargins[0];
		job.crop.m2             = mmmargins[1];
		job.crop.m3             = mmmargins[2];
		job.crop.m4             = mmmargins[3];
		
		successState = true;
		window.close();
	}

	function abortConversion() {
		window.close();		// implicitly calls windowUnload()
	}
	
	function windowUnload() {
		Dontprint.cropPageDone(job.id, successState, job.crop);
	}

	function getHostFromUrl(url) {
		var m = url.match(/^([^#/?:]+:[^#/?:]*\/+)?([^#/?]+\.[^#/?]+)([#/?].*)?$/);
		return m ? m[2] : "unknown";
	}

	function showPrivacyTooltip() {
		if (!this.href) {
			// link is disabled
			return false;
		}
		
		var tooltip = $('#privacyTooltip');
		tooltip.css('visibility', 'hidden');
		
		$('#tooltipTitle').text(job.title);
		$('#tooltipJournal').text(
			job.crop.longname ? (
				job.crop.shortname ? job.crop.longname + ' (' + job.crop.shortname + ')'
				: job.crop.longname
			) : job.crop.shortname
		);
		$('#tooltipDoi').text(job.doi ? job.doi : "(unknown)");
		$('#tooltipWebsite').text(getHostFromUrl(job.pageurl));
		$('#tooltipDate').text(job.articleDate);
		$('#tooltipMargins').text(mmmargins.map(function(val) {
			return val.toFixed(1) + "mm";
		}).join(", "));
		$('#tooltipPages').text($("#coverpage").prop("checked") ? "All except first page" : "All pages");
		var params = $("#additionalParamsCheckbox").prop("checked") ? $("#k2pdfoptParams").val().trim() : "";
		$('#tooltipScale').text(Math.round(parseFloat($("#scaleselect").val()) * 100) + "%");
		$('#tooltipParameters').text(params ? params : "(none)");
		
		tooltip.show();
		var box = $('#sendsettings');
		var off = box.offset();
		tooltip.offset({
			left: off.left + box.outerWidth()/2 - tooltip.outerWidth() + 45,
			top:  off.top - tooltip.outerHeight()+10
		});
		
		tooltip.hide();
		tooltip.css('visibility', 'visible');
		tooltip.fadeIn();
		$('#overlay').fadeIn();
		
		return false;
	}
	
	function hidePrivacyTooltip() {
		$('#privacyTooltip,#overlay').fadeOut();
	}
});
