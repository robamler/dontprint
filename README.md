Dontprint
===============================

What's This?
-------------------------------

Dontprint is going to be an add-on for Firefox. It is currently in development.

Dontprint will make it easy to send scientific articles in an optimized layout to your e-book reader, e.g., the amazon Kindle.
Open the website of any major publisher, log in, navigate to a page that represents a specific article and a Dontprint icon (![Dontprint icon](http://robamler.github.com/dontprint/webapp/favicon.png)) will appear in the address bar.
With a single click on that icon, Dontprint downloads the PDF file of the article, reformats it to optimize for the e-book reader's screen size, and sends it to the device.

Dontprint will also integrate with the [Zotero](http://www.zotero.org/) literature database, if Zotero is installed.
Select an item in Zotero that has an attached PDF file and, with a single click, it's reformatted and on your e-book reader.

Here's a more verbose list of planned features:

* Automatically detect supported web sites of publisher groups and find and download the requested PDF file. Dontprint reuses code from Zotero for this functionality.
* Rearrange text flow to optimize for the e-book reader's screen size (using willus.com's awesome [K2pdfopt](http://www.willus.com/k2pdfopt/) utility). This works great even with multi-column pages that include figures and equations.
* Automatically cut off page headers and footers before the conversion. These would otherwise appear at random positions in the re-flowed output pages. Dontprint will infer the correct margins based on the journal name, or provide a simple graphical tool for you to set the margins if the journal is unknown.
* Optionally, send the optimized PDF document to your Amazon Kindle's email address. For other e-book readers, Dontprint will place the output PDF in a directory of your choice.


Installation
-------------------------------

This is just some small gadged I'm writing in my spare time. The core functionality mostly works but it's missing some front-end for configurations and I might still change the implementation in a way that is not backward compatible. I'll publish Dontprint on addons.mozilla.org as soon as it's more stable. If you're adventurous, here's how to install the development version of Dontprint.

1. Open a terminal, `cd` to the directory where you want to clone the Dontprint repository, and type

 ```bash
 you@yourmachine:~$ git clone -b testing git://github.com/robamler/dontprint.git
 you@yourmachine:~$ dontprint/install
 ```
6. Restart Firefox. It will greet you with a warning about a new extension. Select the checkbox to accept the installation and restart again.
7. Dontprint will automatically open a new tab with a welcome page. Follow the instructions on that page to finish the installation.


Usage
-------------------------------

Open the website of your favorite publisher or preprint server and make sure you have access to their articles. When you load a page that shows information about a specific article, a Dontprint icon (![Dontprint icon](http://robamler.github.com/dontprint/webapp/favicon.png)) will most likely appear in the address bar. Click it!

If you use [Zotero](http://www.zotero.org/), you can also dontprint attached PDF documents directly from the Zotero pane.
 
**The following should happen:**
Dontprint will download the PDF file of the article.
Then, a new tab should pop up where you can set the margins to crop headers and footers (Dontprint remembers margins for each journal, so you will usually skip this step).
When you confirm with the green button, the document will be optimized by k2pdfopt (this may take some time).
Dontprint will then send the optimized version of the article to your Kindle and display a confirmation.
The first time you run Dontprint, you have to authorize it to send Emails from your Gmail account.
Dontprint will remember both the crop settings (for each journal) and the authorization.
So the next time you dontprint an article from the same journal it should be done with a single click on the Dontprint button.

You can see the current progress of all Dontprint jobs by right-clicking on the ![Dontprint icon](http://robamler.github.com/dontprint/webapp/favicon.png) icon or by choosing "Tools --> Dontprint --> Show currently running Dontprint jobs" from the Firefox menu.

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