/*
Dontprint -- Web browser plugin to send scientific articles to your e-book reader in an optimized layout.
Copyright (C) 2013  Robert Bamler	

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License, version 3 (AGPLv3),
as published by the Free Software Foundation.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

A copy of the GNU Affero General Public License version 3 is available at
http://www.gnu.org/licenses/agpl-3.0
*/

function doPost(e) {
  return doGet(e);
}

function doGet(e) {
  try {
    var SENTSTRING = "Dontprint plugin for Zotero: sent";
    var fileId = e.parameter.fileId;
    var file = DocsList.getFileById(fileId);
    var filename = file.getName();

    var description = file.getDescription();
    if (description === SENTSTRING) {
      var t = HtmlService.createTemplateFromFile('warning.html');
      t.filename = filename;
      return t.evaluate().setTitle("Outdated tab. (Dontprint plugin for Zotero)");
    }
    
    var metadata = JSON.parse(description);
    if (metadata.recipientEmail === undefined)
      throw "No recipient email specified. Dontprint plugin for Zotero does not know to which email address to send the document.";

    var pdf = file.getAs('application/pdf').getBytes();
    var attach = {fileName: filename, content:pdf, mimeType:'application/pdf'};
    
    var emailOptions = {attachments:[attach]};
    if (metadata.copyToMe) {
      emailOptions.cc = Session.getActiveUser().getEmail();
    }
    
    MailApp.sendEmail(
      metadata.recipientEmail,
      'Dontprint plugin for Zotero: item ' + metadata.itemKey,
      'see attachment',
      emailOptions
    );
    
    file.setDescription(SENTSTRING);
    if (!metadata.copyInGoogleDrive) {
      file.setTrashed(true);
    }
    
    // Get convenient unit for file size and display result with at most one decimal but at least two significant digits
    filesize = file.getSize();
    sizeunits = ["bytes", "KiB", "MiB"];
    for (var i=0; i<sizeunits.length-1 && filesize>=999.5; i++) {
      filesize /= 1024;
    }
    filesize = filesize.toFixed(filesize >= 9.5 ? 0 : 1) + " " + sizeunits[i];
    
    var t = HtmlService.createTemplateFromFile('success.html');
    t.fileId = fileId;
    t.filename = filename;
    t.metadata = metadata;
    t.cc = emailOptions.cc;
    t.driveurl = file.getUrl();
    t.filesize = filesize;
    return t.evaluate().setTitle("Success: Document sent to your e-reader. (Dontprint plugin for Zotero)");
  }
  catch (e) {
    var t = HtmlService.createTemplateFromFile('error.html');
    t.errstring = e.toString();
    return t.evaluate().setTitle("Error sending document. (Dontprint plugin for Zotero)");
  }
}