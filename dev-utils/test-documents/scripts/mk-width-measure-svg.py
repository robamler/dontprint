#!/usr/bin/python

# usage: mk-width-measure-svg.py innerWidth innerHeight lowWidth widthStripesPerPage pageNum lastPageNum identifier

import sys
from os import system

innerWidth = int(sys.argv[1])
innerHeight = int(sys.argv[2])
lowWidth = int(sys.argv[3])
widthStripesPerPage = int(sys.argv[4])
pageNum = int(sys.argv[5])
lastPageNum = int(sys.argv[6])
identifier = sys.argv[7]

docWidth = innerWidth + 3
docHeight = innerHeight + 4

STRIPESLEFT = 76 + 10.27*len(str(lowWidth+widthStripesPerPage-1))
STRIPESRIGHT = 5
LINE_HEIGHT = 40
STRIPE_HEIGHT = 30
STRIPES_TOP = 75

smallestScaling = 1.0 * innerWidth / (lowWidth+widthStripesPerPage-1)
stripewidth = int(smallestScaling * (innerWidth - STRIPESLEFT - STRIPESRIGHT))
stripewidth = stripewidth - 1 + stripewidth%2  # make it odd

system("../../scripts/mk-bars " + str(stripewidth) + " " + str(STRIPE_HEIGHT) + " " + identifier + "-bars.png >/dev/null 2>/dev/null");

print '<?xml version="1.0" encoding="UTF-8" standalone="no"?>'
print '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + str(docWidth) + '" height="' + str(docHeight) + '" version="1.1">'
print '<image x="0" y="0" width="' + str(docWidth) + '" height="' + str(docHeight) + '" xlink:href="' + identifier + '-background.png" />'
print '<text x="' + str(innerWidth/2) + '" y="22" style="text-align:center;text-anchor:middle;font-size:20px;font-weight:bold;font-family:Linux Biolinum O">Find the only test strip where the 1-pixel bars are</text>'
print '<text x="' + str(innerWidth/2) + '" y="47" style="text-align:center;text-anchor:middle;font-size:20px;font-weight:bold;font-family:Linux Biolinum O">clear and regularly spaced over the whole region.</text>'


for width in range(lowWidth, lowWidth+widthStripesPerPage):
	scaling = 1.0 * docWidth / (width + 3.0)
	#scaling = 1.0 * innerWidth / width
	w = stripewidth * scaling
	x = round(1.0*STRIPESLEFT/scaling) * scaling
	y = STRIPES_TOP + LINE_HEIGHT*(width-lowWidth)
	
	print '<image x="' + str(x) + '" y="' + str(y) + '" width="' + str(w) + '" height="' + str(STRIPE_HEIGHT) + '" xlink:href="' + identifier + '-bars.png" preserveAspectRatio="none" />'
	print '<text x="5" y="' + str(y+21) + '" style="font-size:20px;font-weight:bold;font-family:Linux Biolinum O">width=' + str(width) + '</text>'


print '<g transform="translate(' + str(innerWidth) + ',' + str(innerHeight) + ')">'
print '  <g transform="translate(-590,-1040)">'
print '    <path style="fill:#383838;stroke:none" d="m ' + ('85' if pageNum==lastPageNum else '125') + ',1006.036 c -2.77,0 -5,2.23 -5,5 l 0,19.7188 c 0,2.77 2.23,5 5,5 l ' + ('447.5625' if pageNum==lastPageNum else '407.5625') + ',0 c 0.56649,0 1.08688,-0.1404 1.34032,-0.2108 l 31.42912,-10.1319 c 1.05069,-0.3116 4.60556,-2.2104 4.60556,-4.501 0,-2.2906 -3.55487,-4.2207 -4.60556,-4.5322 l -31.4019,-10.1351 c -0.25747,-0.073 -0.79046,-0.2077 -1.36754,-0.2077 z"/>'
print '    <text xml:space="preserve" style="font-size:23px;font-weight:bold;text-anchor:middle;fill:#ffffff;font-family:Linux Biolinum O" x="' + ('308' if pageNum==lastPageNum else '328') + '" y="1027.3014">Turn page ' + ('to measure the screen height' if pageNum==lastPageNum else 'for more test strips') + '...</text>'
print '  </g>'
print '</g>'

print '</svg>'
