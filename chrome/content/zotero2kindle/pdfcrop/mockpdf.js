PDFJS = (function() {

var mockPage = {
	getViewport: function(scale) {
		return {width:10*scale, height:14*scale};
	},

	render: function(params) {
		var ctx = params.canvasContext;
		var vp = params.viewport;
		ctx.fillStyle="#aaaaaa";
		ctx.fillRect(
			0.3 * vp.width,
			0.3 * vp.height,
			0.4 * vp.width,
			0.4 * vp.height
		);
		ctx.fillStyle="#000000";
		ctx.font="20px Arial";
		ctx.fillText("MockPDF",0.5*vp.width-50,0.5*vp.height-5);
	}
};

return {
	getDocument: function(url) {
		return {
			then: function(callback) {
				callback({
					getPage: function(i) {
						return { then: function(cb) {cb(mockPage);} };
					}
				});
			}
		};
	}
};

}());

