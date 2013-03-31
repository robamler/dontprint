Zotero.Dontprint.OauthService = function(serviceName, authURL, clientID, clientSecret, redirectURI, scope, tokenURL, DB, authOpener) {
	this.serviceName = serviceName;
	this.authURL = authURL;
	this.clientID = clientID;
	this.clientSecret = clientSecret;
	this.redirectURI = redirectURI;
	this.scope = scope;
	this.tokenURL = tokenURL;
	this.DB = DB;
	this.authOpener = authOpener;
	this.exponentialBackup = 120000;
	
	var sqlresult = this.DB.query("SELECT * FROM oauth WHERE service = ?", [this.serviceName]);
	if (sqlresult !== false) {
		//TODO: check what happens with sqlite's "NULL" data type
		this.accessToken = sqlresult[0].access_token;
		if (this.accessToken === "")
			this.accessToken = undefined;
		this.refreshToken = sqlresult[0].refresh_token;
		if (this.refreshToken === "")
			this.refreshToken = undefined;
		this.expirationDate = parseFloat(sqlresult[0].expiration_date);
	} else {
		this.expirationDate = 0;
		// leave accessToken and refreshToken undefined
	}
	
	this.lastAuthorization = 0;
	this.lastRefresh = 0;
	this.queue = [];
	
	this.setIdle();
}

Zotero.Dontprint.OauthService.prototype.buildURL = function(main, params) {
	if (main === null)
		main = "";
	var firstsep = (main === "" ? '' : (main.indexOf("?") === -1 ? '?' : '&'));
	var i = 0;
	for (j in params) {
		main += (i++ === 0 ? firstsep : '&') + encodeURIComponent(j) + '=' + encodeURIComponent(params[j]);
	}
	return main;
};

//TODO: documentation
Zotero.Dontprint.OauthService.prototype.makeFunctionInContext = function(func, ctx) {
	return function() {
		args = Array.prototype.slice.call(arguments);
		args.unshift(this);
		func.apply(ctx, args);
	}
};

Zotero.Dontprint.OauthService.prototype.storeValuesInDb = function() {
	//TODO check whether storing undefined values stores sqlite's "NULL" type
	this.DB.query("INSERT INTO oauth VALUES (?, ?, ?, ?)", [
		this.serviceName,
		this.accessToken === undefined ? "" : this.accessToken,
		"" + this.expirationDate,
		this.refreshToken === undefined ? "" : this.refreshToken
	]);
};

Zotero.Dontprint.OauthService.prototype.getRetryTimeoutExponentialBackup = function() {
	var old = this.exponentialBackup;
	this.exponentialBackup = Math.min(old*2, 600000); // maximum: 10 minutes
	return old;
};

Zotero.Dontprint.OauthService.prototype.retryAfterError = function() {
	if (this.state === "error") {
		this.setIdle();
	}
};

Zotero.Dontprint.OauthService.prototype.setIdle = function() {
	this.state = "idle";
	clearTimeout(this.retryOnErrorTimeout);
	if (this.queue.length !== 0) {
		setTimeout(this.makeFunctionInContext(this.dispatchJobs, this), 0);
	}
};

Zotero.Dontprint.OauthService.prototype.setError = function(err) {
	this.state = "error";
	clearTimeout(this.retryOnErrorTimeout);
	this.retryOnErrorTimeout = setTimeout(
		this.makeFunctionInContext(this.retryAfterError, this),
		this.getRetryTimeoutExponentialBackup()
	);
	throw err;
};

Zotero.Dontprint.OauthService.prototype.apicall = function(doTheCall) {
	this.queue.push(doTheCall);
	if (this.state === "idle") {
		this.dispatchJobs();
	}
};

Zotero.Dontprint.OauthService.prototype.dispatchJobs = function() {
// 	alert("dispjobs");
	if (this.queue.length === 0 || this.state !== "idle") {
		return;
	}
	this.state = "dispatching";
	
	this.runFirstJob();
};

Zotero.Dontprint.OauthService.prototype.runFirstJob = function(job) {
// 	alert("runfirst:");
// 	alert(this.expirationDate);
	if (this.state !== "dispatching") {
		throw "OauthService.runFirstJob: wrong state.";
	}
	
	if (this.expirationDate > (new Date()/1000)) {
// 	alert("1");
		// Access token is valid.
		this.state = "executingJob";
		this.queue[0](
			this.accessToken,
			this.makeFunctionInContext(this.onJobSuccess, this),
			this.makeFunctionInContext(this.onJobFail, this),
			this.makeFunctionInContext(this.onJobAuthFail, this)
		);
	} else {
		// Access token expired.
		if (this.refreshToken !== undefined) {
// 	alert(this.refreshToken);
			// Access token expired but refresh token available.
			// Use the refresh token to get a new access token.
			this.refreshAccessToken();
		} else {
			// No refresh token available. Need to authorize.
// 	alert("3");
			this.authorize();
		}
	}
};

Zotero.Dontprint.OauthService.prototype.onJobSuccess = function() {
	this.queue.shift();
	this.setIdle();
};

//TODO: find a better implementation for onJobFail
Zotero.Dontprint.OauthService.prototype.onJobFail = Zotero.Dontprint.OauthService.prototype.onJobSuccess;

Zotero.Dontprint.OauthService.prototype.onJobAuthFail = function() {
	// Apparently, the access token is no longer valid. Set expirationDate
	// to distant path and retry. This will first initiate a (silent) refresh
	// of the access token. If that fails, it will initiate a new authorization.
	this.expirationDate = 0;
	this.storeValuesInDb();
	this.setIdle();
};

Zotero.Dontprint.OauthService.prototype.authorize = function() {
	// TODO: what happens if user clicks "cancel" on authorization page? (or closes tab)
	this.state = "authorizing";
	
	if (this.lastAuthorization > (new Date()/1000)-120) {
		// already tried to authorize less than two minutes ago. Doesn't seem to work.
		this.setError("OauthService.authorize: Authorization failure");
		return;
	}
	
	this.accessToken = undefined;
	this.refreshToken = undefined;
	this.lastRefresh = 0;
	this.expirationDate = 0;
	this.storeValuesInDb();
	
	this.authOpener(
		this.buildURL(
			this.authURL,
			{
				response_type: "code",
				client_id: this.clientID,
				redirect_uri: this.redirectURI,
				scope: this.scope,
				state: "authorize-" + this.serviceName
			}
		),
		this.makeFunctionInContext(this.receiveAuthCode, this)
	);
};

Zotero.Dontprint.OauthService.prototype.receiveAuthCode = function(oldContext, authCode) {
	if (this.state !== "authorizing") {
		throw "OauthService.receiveAuthCode: wrong state.";
	}
	this.state = "exchanging";
// 	alert("received auth code: " + authCode);
	
	this.lastAuthorization = new Date() / 1000;
	
	var req = new XMLHttpRequest();
	var that = this;
	req.onload = this.makeFunctionInContext(this.receiveAccessToken, this);
	req.open("post", this.tokenURL, true);
	req.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
	var message = this.buildURL(null,
		{
			code: authCode,
			client_id: this.clientID,
			client_secret: this.clientSecret,
			redirect_uri: this.redirectURI,
			grant_type: "authorization_code"
		}
	);
// 	alert(message);
	req.send(message);
};


Zotero.Dontprint.OauthService.prototype.receiveAccessToken = function(req) {
	//TODO: catch error, in which case set refreshToken = undefined, save to db and call setIdle()
	if (this.state !== "exchanging" && this.state !== "refreshing") {
		throw "OauthService.receiveAuthCode: wrong state.";
	}
	
// 	alert("receiveAccessToken");
// 	alert(req);
// 	alert(req.responseText);
	
	this.lastRefresh = new Date() / 1000;
	
	var response = JSON.parse(req.responseText);
	if (response.error !== undefined) {
		this.refreshToken = undefined;
		this.expirationDate = 0;
		this.storeValuesInDb();
		this.setIdle();
		return;
	}
	
	if (response.expires_in === undefined)
		response.expires_in = 60;
	
	// subtract 10 seconds from expiration date to be on the save side
	this.expirationDate = parseFloat(response.expires_in) + (new Date()/1000) - 10;
	this.accessToken = response.access_token;
	if (response.refresh_token) {
		// A refresh token is only sent upon initial exchange of session code.
		// No refresh token is sent when refreshing the access token using an
		// existing refresh token.
		this.refreshToken = response.refresh_token;
	}
	
	this.storeValuesInDb();
	
	this.setIdle(); // this will automatically re-run the first job if there is any.
};

Zotero.Dontprint.OauthService.prototype.refreshAccessToken = function(req) {
// 	alert("refreshAccessToken");
	this.state = "refreshing";
	
	this.accessToken = undefined;	
	this.storeValuesInDb();
	
// 	alert("lastRefresh: " + this.lastRefresh);
	if (this.lastRefresh > (new Date()/1000)-60) {
		// already tried to refresh less than a minute ago.
		// Doesn't seem to work. Need to reauthorize.
// 		alert("not again");
		this.refreshToken = undefined;
		this.storeValuesInDb();
		this.setIdle();
		return;
	}
	
	var req = new XMLHttpRequest();
	req.onload = this.makeFunctionInContext(this.receiveAccessToken, this);
	req.open("post", this.tokenURL, true);
	req.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
	var message = this.buildURL(null,
		{
			refresh_token: this.refreshToken,
			client_id: this.clientID,
			client_secret: this.clientSecret,
			grant_type: "refresh_token"
		}
	);
// 	alert(message);
	req.send(message);
}