#!/usr/bin/python

import json, os, glob, shutil
from json.decoder import WHITESPACE

try:
    shutil.rmtree("translators")
except:
    pass

os.mkdir("translators")

indexfile = open("translators/getTranslators", "w")
firstFile = True

decoder = json.JSONDecoder()

for filename in glob.iglob('../dependencies/zotero-connectors/src/zotero/translators/*.js'):
    file = open(filename, "r")
    filecontents = file.read()
    file.close()

    start = WHITESPACE.match(filecontents, 0).end()
    translatordata, endindex = decoder.raw_decode(filecontents, start)
    shutil.copyfile(filename, "translators/" + translatordata["translatorID"])

    if firstFile:
        indexfile.write("[")
        firstFile = False
    else:
        indexfile.write(",")
    json.dump(translatordata, indexfile)

indexfile.write("]")
indexfile.close()
