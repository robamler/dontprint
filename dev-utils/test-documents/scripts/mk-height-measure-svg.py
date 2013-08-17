#!/usr/bin/python

# usage: mk-width-measure-svg.py innerWidth innerHeight lowHeight heightStripesPerPage pageNum lastPageNum identifier

import sys
from os import system

innerWidth = int(sys.argv[1])
innerHeight = int(sys.argv[2])
lowHeight = int(sys.argv[3])
heightStripesPerPage = int(sys.argv[4])
pageNum = int(sys.argv[5])
lastPageNum = int(sys.argv[6])
identifier = sys.argv[7]

docWidth = innerWidth + 3
docHeight = innerHeight + 4

STRIPESLEFT = 82 + 10.27*len(str(lowHeight+heightStripesPerPage-1))
STRIPESRIGHT = 5
LINE_HEIGHT = 40
STRIPE_HEIGHT = 30
STRIPES_TOP = 39

smallestScaling = 1.0 * innerHeight / (lowHeight+heightStripesPerPage-1)
stripewidth = int(smallestScaling * (innerHeight - STRIPESLEFT - STRIPESRIGHT))
stripewidth = stripewidth - 1 + stripewidth%2  # make it odd

system("../../scripts/mk-bars " + str(stripewidth) + " " + str(STRIPE_HEIGHT) + " " + identifier + "-bars.png >/dev/null 2>/dev/null");

print '<?xml version="1.0" encoding="UTF-8" standalone="no"?>'
print '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + str(docWidth) + '" height="' + str(docHeight) + '" version="1.1">'
print '<image x="0" y="0" width="' + str(docWidth) + '" height="' + str(docHeight) + '" xlink:href="' + identifier + '-background.png" />'

print '<g transform="matrix(0,-1,1,0,0,' + str(innerHeight) + ')">'  # begin rotation by 90deg
print '<text x="' + str(innerHeight/2) + '" y="22" style="text-align:center;text-anchor:middle;font-size:20px;font-family:Linux Biolinum O">Find the only test strip where the 1-pixel bars are clear and regularly spaced.</text>'


for height in range(lowHeight, lowHeight+heightStripesPerPage):
	scaling = 1.0 * docHeight / (height + 4.0)
	w = stripewidth * scaling
	x = round(1.0*STRIPESLEFT/scaling) * scaling
	y = STRIPES_TOP + LINE_HEIGHT*(height-lowHeight)
	
	print '<image x="' + str(x) + '" y="' + str(y) + '" width="' + str(w) + '" height="' + str(STRIPE_HEIGHT) + '" xlink:href="' + identifier + '-bars.png" preserveAspectRatio="none" />'
	print '<text x="5" y="' + str(y+21) + '" style="font-size:20px;font-weight:bold;font-family:Linux Biolinum O">height=' + str(height) + '</text>'


if pageNum == lastPageNum:
	print '<g transform="translate(' + str(innerHeight/2) + ',' + str(innerWidth) + ')">'
	print '  <g transform="translate(-77.224807,-187.45322)">'
	print '    <rect transform="translate(5,0)" style="fill:#383838;stroke:none" width="312.70517" height="29.508001" x="-79.127792" y="153.94522" ry="5" rx="5" />'
	print '    <text xml:space="preserve" style="font-size:23px;font-weight:bold;text-align:center;text-anchor:middle;fill:#ffffff;font-family:Linux Biolinum O" x="79" y="174.4091">Turn page to finish...</text>'
	print '    <path id="arrowhead" style="fill:#ffffff;stroke:none" d="m -48.36162,158.36583 -6.03813,3.36197 -6.03814,-3.36197 6.03814,19.47882 z" />'
	print '    <use xlink:href="#arrowhead" transform="translate(270,0)" />'
	print '  </g>'
	print '</g>'
else:
	print '<g transform="translate(' + str(innerHeight/2) + ',' + str(innerWidth) + ')">'
	print '  <g transform="translate(294.12674,-96.261122)">'
	print '    <rect style="fill:#383838;stroke:none" width="433.21365" height="29.508001" x="-510.73358" y="62.75312" ry="5" rx="5" />'
	print '    <text xml:space="preserve" style="font-size:23px;font-weight:bold;text-align:center;text-anchor:middle;fill:#ffffff;font-family:Linux Biolinum O" x="-296.30704" y="83.216995">Turn page for more test strips...</text>'
	print '    <path transform="translate(30,0)" id="arrowhead" style="fill:#ffffff;stroke:none" d="m -514.48691,67.173727 -6.03813,3.361963 -6.03814,-3.361963 6.03814,19.478813 z" />'
	print '    <use xlink:href="#arrowhead" transform="translate(392.79659,0)" />'
	print '  </g>'
	print '</g>'


print '</g>'  # end rotation by 90deg
print '</svg>'
