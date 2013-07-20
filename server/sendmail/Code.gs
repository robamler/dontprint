/**
 * The client makes a dummy GET request before uploading a file with a separate POST
 * request. The dummy GET request serves two purposes
 * 1) If the user is not yet signed in with Google or has not yet authorized Dontprint
 *    to send e-mails, Google will automatically redirect the request thru an
 *    authorization flow. This authorization flow does not work with POST requests.
 * 2) Dontprint returns an HTML page in response to the GET request which contains
 *    some random code in a hidden input field. Subsequent calls to doPost() will
 *    fail unless the same code is given in a URL parameter to the POST request.
 *    This procedure makes sure that this sendmail script is not abused by third party
 *    web sites to send spam e-mails from the active user's Gmail account without
 *    their knowledge. Due to the way Google encapsulates HTML responses, the input
 *    field with the random code is only accessible by priviliged JavaScript code,
 *    meaning that usual web sites cannot access it but Dontprint can.
 */
function doGet(e) {
  var date = Math.floor((new Date()).getTime());
  var rnd = Math.floor(100000000 * Math.random());
  var authtoken = "x" + date + "x" + rnd;
  CacheService.getPrivateCache().put(authtoken, "1", 1800);  // 30 minutes
  
  var t = HtmlService.createTemplateFromFile('wait.html');
  t.authtoken = authtoken;
  return t.evaluate().setTitle("Sending Document to e-reader... (Dontprint)");
}


function doPost(e) {
  try {
    var authtoken = e.parameter.authtoken;
    if (authtoken === undefined) {
      throw 'You are using an outdated version of Dontprint. Update to the latest version of the "testing" branch.';
    }
    var authtime = authtoken.split("x")[1];
    var timediff = (new Date()).getTime() - authtime;
    var cache = CacheService.getPrivateCache();
    if (cache.get(authtoken) !== "1" || timediff < -10000 || timediff > 1800000) {
      throw "Dontprint authorization failed. Auth token is " + authtoken + ". Timediff is " + timediff + ".";
    }
    cache.remove(authtoken);

    var filename = e.parameter.filename;
    var itemKey = e.parameter.itemKey;		
    var recipientEmail = e.parameter.recipientEmail;
	var ccEmails = e.parameter.ccEmails;
    if (ccEmails === "") {
      ccEmails = undefined;
    }
    
    var fileBytes = e.postData.getBytes();
        
    var emailOptions = {
      attachments: [{fileName: filename, content:fileBytes, mimeType:'application/pdf'}],
      cc: ccEmails
    };
    
    // Get convenient unit for file size and display result with at most one decimal but at least two significant digits
    var filesize = fileBytes.length
    sizeunits = ["bytes", "KiB", "MiB"];
    for (var i=0; i<sizeunits.length-1 && filesize>=999.5; i++) {
      filesize /= 1024;
    }
    filesize = filesize.toFixed(filesize >= 9.5 ? 0 : 1) + " " + sizeunits[i];
    
    var messageBody = '';
    if (ccEmails !== undefined) {
      messageBody = 'File Name: ' + filename + '\n' +
      'File Size: ' + filesize + '\n' +
      'E-reader address: ' + recipientEmail + '\n' +
      'Copy sent to: ' + ccEmails + '\n\n' +
      'The document that is attached to this e-mail has been sent to your\n' +
      'e-book reader. Select "Sync" on your e-book reader to download the\n' +
      'document. You may have to wait for a few minutes before the\n' +
      'download is available.\n\n' +
      '-- \n' +
      'Dontprint\n' +
      'https://github.com/robamler/dontprint';
    }
    
    MailApp.sendEmail(
      recipientEmail,
      'Dontprint sent this document to your e-reader (' + itemKey + ")",
      messageBody,
      emailOptions
    );
    
    return ContentService.createTextOutput(JSON.stringify({
      error: false,
      params: e.parameter,
      filesize: filesize,
    }));
  }
  catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      error: true,
      errorString: err.toString()
    }));
  }
}
