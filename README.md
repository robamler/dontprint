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


Current Status
-------------------------------

This is just some small gadged I'm writing in my spare time. I'll probably publish a first usable version on addons.mozilla.org in Q2 2013. Please drop me a note if you would like to get involved. You find my contact information at http://www.thp.uni-koeln.de/~rbamler/.


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
