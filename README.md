Dontprint
===============================

What's This?
-------------------------------

Dontprint is going to be a plugin for Firefox. It is currently in development.

Dontprint will make it easy to send scientific articles in an optimized layout to your e-book reader, e.g., the amazon Kindle.
Open the website of any major publisher, log in, navigate to a page that describes a specific article and a Dontprint icon (![Dontprint icon](http://robamler.github.com/dontprint/webapp/favicon.png)) will appear in the address bar.
With a single click on that icon, Dontprint downloads the PDF file of the article, reformats it to optimize for the e-book reader's screen size, and sends it to the device.

Dontprint will also integrate with the [Zotero](http://www.zotero.org/) literature database.
Select an item in Zotero that has an attached PDF file and, with a single click, it's reformatted and on your e-book reader.

Here's a more verbose list of planned features:

* Automatically detect supported web sites of publisher groups and find and download the requested PDF file. Dontprint reuses code from Zotero for this functionality.
* Rearrange text flow to optimize for the e-book reader's screen size (using willus.com's awesome [K2pdfopt](http://www.willus.com/k2pdfopt/) utility). This works great even with multi-column pages that include figures and equations.
* Automatically cut off page headers and footers before the conversion. These would otherwise appear at random positions in the re-flowed output pages. Dontprint will infer the correct margins based on the journal name, or provide a simple graphical tool for you to set the margins if the journal is unknown.
* Optionally, send the optimized PDF document to your Amazon Kindle's email address. For other e-book readers, Dontprint will place the output PDF in a directory of your choice.


Installation
-------------------------------

This is just some small gadged I'm writing in my spare time. On Linux, the core functionality mostly works but it's missing some front-end for configurations and I might still change the implementation in a way that is not backward compatible. I'll publish Dontprint on addons.mozilla.org as soon as it's more stable. If you're adventurous, here's how to install the development version of Dontprint on a Linux machine.

1. Create a Google account on http://gmail.com if you don't already have one.
Dontprint sends emails to your Kindle from your Gmail address.
This eliminates server costs so that Dontprint can stay free of charge.
Dontprint uses OAuth for authorization so you never have to give any passwords to Dontprint.
Also, the only permission Dontprint will ask for is to send Emails from your Gmail account.
Dontprint won't get access to any of your existing e-mails or even your e-mail address.
Since both the client and the server part of Dontprint are open source, you can be sure that Dontprint doesn't abuse your trust to send out e-mails you didn't request.
2. On your country's Amazon website, go to "Manage Your Kindle" and make sure that your Gmail address is white-listed to send documents to your Kindle.
3. Download K2pdfopt from http://www.willus.com/k2pdfopt.
4. Install the Zotero plugin for Firefox from http://zotero.org.
   (Dontprint currently requires Zotero to be installed but this dependency will be removed soon.)
5. Open a terminal, `cd` to the directory where you want to clone the Dontprint repository, and type

 ```bash
 you@yourmachine:~$ git clone -b testing git://github.com/robamler/dontprint.git
 you@yourmachine:~$ cd dontprint
 you@yourmachine:~/dontprint$ pwd > `echo ~/.mozilla/firefox/*.default/extensions`/dontprint@robamler.github.com
 ```
6. Restart Firefox. It will greet you with a warning about a new extension. Select the checkbox to accept the installation and restart again.
7. Type `about:config` in the location bar and create the following string preferences by right-clicking --> New --> String:

 | Preference Name                             | Value                        |
 | ------------------------------------------- | ---------------------------- |
 | extensions.dontprint.k2pdfoptpath           | /path/to/k2pdfopt/executable |
 | extensions.dontprint.recipientEmailPrefix   | the part of your Kindle e-mail address before the "@" sign |
 | extensions.dontprint.recipientEmailSuffix   | usually, `@free.kindle.com` (including the @ sign) |
 
 If you want files to be sent also over the 3G network when no WiFi is available, set the e-mail suffix to `@kindle.com`.
 Be warned, however, that Amazon might charge for this service.
8. Open the website of your favorite publisher and make sure you have access to their articles. When you load a page that shows information about a specific article, a Dontprint icon (![Dontprint icon](http://robamler.github.com/dontprint/webapp/favicon.png)) will most likely appear in the address bar. Click it!
 Alternatively, you can open Zotero, select an item that has an attached PDF document, and click the Dontprint button in the Zotero pane (![Dontprint icon](http://robamler.github.com/dontprint/webapp/favicon.png)).
 
**The following should happen:**
Dontprint will download the PDF file of the article (or use the one attached to the Zotero entry).
Then, a new tab should pop up where you can set the margins to crop headers and footers (Dontprint remembers margins for each journal, so you will usually skip this step).
When you confirm with the green button, the document will be optimized by k2pdfopt (this may take some time).
Dontprint will then send the optimized version of the article to your Kindle and display a confirmation.
The first time you run Dontprint, you have to authorize it to send Emails from your Gmail account.
Dontprint will remember both the crop settings (for each journal) and the authorization.
So the next time you dontprint an article from the same journal it should be done with a single click on the Dontprint button.

You can see the current progress of all Dontprint jobs by right-clicking on the ![Dontprint icon](http://robamler.github.com/dontprint/webapp/favicon.png) icon.
If you experience any problems, please [contact me](http://www.thp.uni-koeln.de/~rbamler/) or [create an issue](https://github.com/robamler/dontprint/issues/new).


License & Copyright
-------------------------------

Dontprint &ndash; Web browser plugin to send scientific articles to your e-book reader in an optimized layout.<br>
Copyright &copy; 2013  Robert Bamler

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License, version 3 (AGPLv3),
as published by the Free Software Foundation.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

A copy of the GNU Affero General Public License version 3 is available in the
file named "COPYING" in this directory, as well as [online](http://www.gnu.org/licenses/agpl-3.0).

A small part of Donptrint is implemented as a script that runs on a web server. The statements in this section ("License & Copyright") also apply to the server-side part of Dontprint. The current version of the server-side source code can be accessed [on Google Drive](https://script.google.com/d/1WVbKmBpq492ElgBVDWQj5mOKAy_pO51Q0HtYYSIYcWMEmBd6UpAJeCpW/edit?usp=sharing) by registered Google users. A static copy of the server-side source code that can be accessed anonymously is available in the directory "server".


Legal
-------------------------------
Amazon and Kindle are trademarks or registered trademarks of Amazon.com, Inc. or its affiliates.
Zotero is the trademark of George Mason University.
Google and Gmail are trademarks or registered trademarks of Google Inc.