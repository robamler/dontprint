#!/usr/bin/python

import json
import os.path

file = open("manifest.in.json", "r")
dontprintManifest = json.load(file)
file.close()
file = open("../dependencies/zotero-connectors/build/chrome/manifest.json", "r")
zoteroManifest = json.load(file)
file.close()


def joinLists(path):
    list1 = dontprintManifest
    list2 = zoteroManifest
    for i in path:
        list1 = list1[i]
        list2 = list2[i]
    #Append elements from list2 to list1 if they are not already there
    for i in list2:
        if i not in list1:
            list1.append(i)


joinLists(("permissions",))

zoteroBgScripts = zoteroManifest["background"]["scripts"]
dontprintBgScripts = dontprintManifest["background"]["scripts"]
for i in zoteroBgScripts:
    path = "zotero-connector/" + i
    if not os.path.isfile(path):
        print "WARNING: Background script " + i + " referenced in Zotero's manifest.json, but the file does not exist in directory zotero-connector."
    dontprintBgScripts.append(path)

dontprintManifest["content_security_policy"] = zoteroManifest["content_security_policy"]

dontprintManifest["content_scripts"] = zoteroManifest["content_scripts"]
for csgroup in dontprintManifest["content_scripts"]:
    csgroup["js"] = ["zotero-connector/" + i for i in csgroup["js"]]


file = open("manifest.json", "w")
json.dump(dontprintManifest, file, indent=2, sort_keys=True)
file.close()
