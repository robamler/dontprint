/**
 * The client makes a dummy GET request before uploading a file with a separate POST
 * request in order to make sure that the user is authorized.
 */
function doGet(e) {
  var t = HtmlService.createTemplateFromFile('wait.html');
  return t.evaluate().setTitle("Sending Document to e-reader... (Dontprint)");
}


function doPost(e) {
  var i;
  var ret = [];
  for (i in e.postData) {
    ret.push(i);
  }
  
  var fileBytes = e.postData.getBytes();
  var attach = {fileName: e.parameter.filename, content:fileBytes, mimeType:'application/pdf'};
  
  var emailOptions = {
    attachments: [attach]
  };
  
  
  try {
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
