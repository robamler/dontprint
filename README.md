Dontprint
===============================

What's This?
-------------------------------

Dontprint is going to be a plugin for the [Zotero](http://www.zotero.org/) literature database. It is currently in development.

Dontprint will make it easy to send optimized versions of articles from your Zotero database directly to your e-book reader, e.g., the Amazon Kindle. With only one click, Dontprint finds the PDF file of an article, reformats it to optimize for the e-book reader's screen size, and sends it to the device.

Here's a more verbose list of planned features:

* Rearrange text flow to optimize for the e-book reader's screen size (using willus.com's awesome [K2pdfopt](http://www.willus.com/k2pdfopt/) utility). This works great even with multi-column pages that include figures and equations.
* Automatically cut off page headers and footers before the conversion. These would otherwise appear at random positions in the re-flowed output pages. Dontprint will infer the correct margins based on the journal name, or provide a graphical tool for you to set the margins if the journal is unknown.
* Optionally, send the optimized PDF document to your Amazon Kindle's email address. For other e-book readers, Dontprint will place the output PDF in a directory of your choice.


Installation
-------------------------------

This is just some small gadged I'm writing in my spare time. On Linux, the core functionality mostly works but it's missing some front-end for configurations and I might still change the implementation in a non-backward compatible way. I'll publish Dontprint on addons.mozilla.org as soon as it's more stable. If you're adventurous, here's how to install the development version of Dontprint on a Linux machine.

1. Create a Google account on http://gmail.com if you don't already have one. Dontprint sends emails to your Kindle from your Gmail address. This eliminates server costs so that Dontprint can stay free of charge. Dontprint uses OAuth for authorization so you never have to give any passwords to Dontprint. Also, Dontprint will get only very restricted access to your Google account (uploading files to Drive and sending emails).
2. On your country's Amazon website, go to "Manage Your Kindle" and make sure that your Gmail address is white-listed to send documents to your Kindle.
3. Download K2pdfopt from http://www.willus.com/k2pdfopt.
4. Install the Zotero plugin for Firefox from http://zotero.org.

5. Open a terminal, `cd` to the directory where you want to clone the Dontprint source code and type
 ```bash
 you@yourmachine:~$ git clone -b testing git://github.com/robamler/dontprint.git
 you@yourmachine:~$ cd dontprint
 you@yourmachine:~/dontprint$ pwd > ~/.mozilla/firefox/*.default/extensions/dontprint@robamler.github.com
 ```
6. Restart Firefox.
7. Type `about:config` in the location bar and create the following string preferences by right-clicking --> New --> String:

 | Preference Name                             | Value                        |
 | ------------------------------------------- | ---------------------------- |
 | extensions.zotero.dontprint.k2pdfoptpath    | /path/to/k2pdfopt/executable |
 | extensions.zotero.dontprint.outputdirectory | Temporary directory for the converted PDF documents, e.g., `/tmp` |
 | extensions.zotero.dontprint.recipientEmail  | your-kindle-address@free.kindle.com |
8. Select an item that has an attached PDF document in Zotero and click the Dontprint button (![Dontprint icon](http://robamler.github.io/dontprint/webapp/favicon.png)) in the Zotero pane. The following should happen: A new tab should pop up where you can set the margins to crop headers and footers (Dontprint remembers margins for each journal, so you will usually skip this step). When you confirm with the green button, the document will be optimized by k2pdfopt (this may take some time). Dontprint will then temporarily upload the optimized document to your Google Drive account and, from there, send it by email to your Kindle address. When Dontprint runs for the first time, you'll have to authorize both the uploading and the email sending. If no errors occur a confirmation tab should open in the background. The next time you dontprint an article from the same journal it should be a one-click experience because you skip the cropping and the authorization.


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

A small part of Donptrint is implemented as a script that runs on a web server. The statements in this section ("License & Copyright") also apply to the server-side part of Dontprint. The current version of the server-side source code can be accessed [on Google Drive](https://script.google.com/d/10pYIa084cmEEfHrb6emHf4GzAAUvD01ju3kxxBg1dQ5h99m7DHKizahz/edit?usp=sharing) by registered Google users. A static copy of the server-side source code that can be accessed anonymously is available in the directory "server".


Legal
-------------------------------
Amazon and Kindle are trademarks of Amazon.com, Inc. or its affiliates. Zotero is the trademark of George Mason University.
