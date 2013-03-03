PDFCrop = (function() {
	// Constants
	const voidfunction = function() {};
	const outputtext = [0,0,0,0];
	const dirLength = ['width', 'height', 'width', 'height'];
	const dirPos = ['left', 'top', 'right', 'bottom'];
	const dirMousecoord = ['pageX', 'pageY', 'pageX', 'pageY'];
	const dirFactor = [1, 1, -1, -1];

	// variables that represent DOM elements
	var region , doccontainer, filepathDisplay, pagenumDisplay, pagecountDisplay, canvas, context, magnifycanvas, magnifycontext, viewcontainer, turnpagesheight, magnifyer, prevbtn, nextbtn;

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
	var dpi = 1;
	var inmargins = [0.25,0.25,0.25,0.25];
	var pxdimensions = [0,0];
	var pagecount = 0;
	var pagenum = 1;
	var availw, origw, availh, origh;
	var pdf, pdfpage;
	var documentData, callback, attachmentIndex;

	// private methods
	var loadpage = function(thepagenum) {
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
	};

	var donePageLoading = function() {
		pageloading = false;
		if (pageLoadingDeferred) {
			pageLoadingDeferred = false;
			refreshpage();
		}
	}

	var refreshpage = function() {
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

		dpi = 72*scale;
		for (var i=0; i<4; i++)
			setMargin[i](inmargins[i]);
	};

	var resize = function(inPdfRendering) {
		availw = Math.max(100, viewcontainer.offsetWidth - 380);
		availh = Math.max(100, viewcontainer.offsetHeight - 45 - turnpagesheight);
		refreshpage();
	}

	var begindrag = function(event, direction) {
		enddrag();
		region.addClass('dragging');

		// resetting the dragfunction in begindrag() avoids lookups in arrays[dir] each time dragfunction is called
		dragfunction = (function(dir) {
			return function(event) {
				var pxvalue = Math.max(0, dirFactor[dir] * (event[dirMousecoord[dir]] - dirReference[dir]));
				setMargin[dir](pxvalue/dpi);
			};
		}(direction));

		dragfunction(event);
		magnifyfunction(event)
	};

	var showMagnifier = function(event, direction) {
		hideMagnifier();
		magnifyer.addClass('dir' + (direction%2));

		// resetting the magnifyfunction in begindrag() avoids lookups in arrays[dir] each time dragfunction is called
		magnifyfunction = (function(dir) {
			return function(event) {
				var pxvalue = inmargins[dir]*dpi;
				var pxvalue2 = Math.max(0, dirFactor[(dir+1)%2] * (event[dirMousecoord[(dir+1)%2]] - dirReference[(dir+1)%2]));
				var pos2 = pxvalue2-85;
				if (pos2 < -5)  pos2 += 100;
				magnifyer.css(dirPos[dir], pxvalue-75);
				magnifyer.css(dirPos[(dir+1)%2], pos2);
				magnifycanvas.style[dirPos[dir]] = 75-3*pxvalue + "px";
				magnifycanvas.style[dirPos[(dir+1)%2]] = 35-3*pxvalue2 + "px";
			};
		}(direction));

		magnifyfunction(event);
	};

	var hideMagnifier = function() {
		magnifyer.removeClass('dir0');
		magnifyer.removeClass('dir1');
		for (var i=0; i<4; i++) {
			magnifyer.css(dirPos[i], "auto");
			magnifycanvas.style[dirPos[i]] = "auto";
		}
		magnifyfunction = voidfunction;
	};

	var enddrag = function () {
		if (dragfunction !== voidfunction) {
			dragfunction = voidfunction;
			region.removeClass('dragging');
		}
	};

	var mousemove = function (event) {
		dragfunction(event);
		magnifyfunction(event)
	}

	var textChange = function(dir, block) {
		var invalue = parseFloat(inputs[dir].val());

		if (setMargin[dir](invalue, block)) {
			inputs[dir].removeClass("invalid");
		} else {
			inputs[dir].addClass("invalid");
		}
	}

	var loadpdf = function(path) {
	//    PDFJS.disableWorker = true;
		filepathDisplay.text(path);

		PDFJS.workerSrc = 'combined-pdf.js'
		PDFJS.getDocument("file://" + path).then(function(loadedpdf) {
			pdf = loadedpdf;
			pagecount = pdf.numPages;
			pagecountDisplay.text(pagecount);
			loadpage(1);
		});
	};

	var startConversion = function() {
		callback(documentData, attachmentIndex, inmargins);
		window.close();
	};

	var abortConversion = function() {
		window.close();
	};

	var doInit = function(theDocumentData, theAttachmentIndex, theCallback) {
		// process parameters
		documentData = theDocumentData;
		attachmentIndex = theAttachmentIndex;
		callback = theCallback;
		$('#journalname').text(
			documentData.journalShortname !== undefined ? documentData.journalShortname : (
				documentData.journalLongname !== undefined ? documentData.journalLongname :
					'unknown journal'
		));

		// Initialize DOM elements
		region = $('#region');
		doccontainer = $('#document-container');
		filepathDisplay = $("#textFilepath");
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

		// Set up event handlers
		// This hack avoids lookups in the arrays[direction] each time dragfunction is called.
		for (var i=0; i<4; i++) {
			setMargin[i] = (function(direction) {
				return function(invalue, blocktext) {
					var pxvalue = dpi*invalue;
					if (isNaN(pxvalue) || pxvalue<0 || pxvalue + dpi*inmargins[(direction+2)%4] > pxdimensions[direction%2]-70) {
						return false;
					}
					margins[direction].css(dirLength[direction], pxvalue);
					inmargins[direction] = invalue;
					region.css(dirPos[direction], pxvalue);
					outputtext[direction].text(invalue.toFixed(2));
					if (!blocktext)
						inputs[direction].val(invalue.toFixed(2));
					return true;
				};
			}(i));
		};

		for (var i=0; i!=4; i++) {
			margins[i] = $("#m"+i);
			handles[i] = $("#h"+i);
			inputs[i] = $("#i"+i);
			outputtext[i] = $("#text"+i);

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

		resize();

		// Load the page
		loadpdf(documentData.attachments[attachmentIndex]);
	};

	// public methods
	return {
		init: function(theDocumentData, theAttachmentIndex, theCallback) {
			$(function() {
				doInit(theDocumentData, theAttachmentIndex, theCallback);
			});
		}
	};
}());

