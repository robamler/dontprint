var updateDatabase = function(conn, dbversion) {
	yield conn.execute(
		"CREATE TABLE IF NOT EXISTS journals (" +
			"id INTEGER PRIMARY KEY ASC ON CONFLICT REPLACE," +
			"priority INTEGER," +
			"lastModified TEXT DEFAULT CURRENT_TIMESTAMP," +
			"enabled INTEGER," +
			"longname TEXT," +
			"shortname TEXT," +
			"minDate INTEGER," +
			"maxDate INTEGER," +
			"m1 TEXT," +
			"m2 TEXT," +
			"m3 TEXT," +
			"m4 TEXT," +
			"coverpage INTEGER," +
			"k2pdfoptParams TEXT" +
		")"
	);
	yield conn.execute("CREATE TABLE IF NOT EXISTS deletedBuiltinJournals (id INTEGER PRIMARY KEY ON CONFLICT IGNORE)");
	yield conn.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY ON CONFLICT REPLACE, value TEXT)");
	yield conn.execute("INSERT INTO settings VALUES ('dbversion', ?)", [dbversion]);
	
	// [id, priority, lastModified, enabled, longname, shortname, minDate, maxDate, m1, m2, m3, m4, coverpage, k2pdfoptParams]
	let builtinJournals = [
		[-1, 2621440, "2014-02-16 10:34:00", 1, "Advances in Physics", "", 20070101, 20090101, "13", "18.3", "5", "24.5", 1, ""],
		[-2, 2621504, "2014-02-16 10:34:01", 1, "Annals of Physics", "", 19850401, 19860415, "13", "26.2", "5", "5", 0, ""],
		[-3, 2621504, "2014-02-16 10:34:02", 1, "Annals of Physics", "", 20061231, 20110101, "13", "19.6", "5", "5", 0, ""],
		[-4, 2621440, "2014-02-16 10:34:03", 1, "EPL (Europhysics Letters)", "EPL", 20070601, 20110901, "13", "24.3", "5", "20.8", 1, ""],
		[-5, 2621440, "2014-02-16 10:34:04", 1, "Europhysics Letters (EPL)", "", 20041231, 20061231, "5", "29.5", "5", "12.8", 1, ""],
		[-6, 2621504, "2014-02-16 10:34:05", 1, "Journal of Magnetism and Magnetic Materials", "Journal of Magnetism and Magnetic Materials", 19871231, 19960101, "13", "19.7", "5", "21", 0, ""],
		[-7, 2621440, "2014-02-16 10:34:06", 1, "Journal of Physics C: Solid State Physics", "J. Phys. C: Solid State Phys.", 19770628, 19801110, "13", "18.8", "5", "20", 1, ""],
		[-8, 2621440, "2014-02-16 10:34:07", 1, "Journal of Physics C: Solid State Physics", "", 19820810, 19870310, "13", "16.6", "5", "16.2", 1, ""],
		[-9, 2359296, "2014-02-16 10:34:08", 1, "Journal of Physics: Condensed Matter", "", 20080116, 0, "13", "22.5", "5", "23.9", 1, ""],
		[-10, 2621504, "2014-02-16 10:34:09", 1, "Nature", "Nature", 20100408, 20100617, "5", "12.1", "5", "9.4", 0, ""],
		[-11, 2621504, "2014-02-16 10:34:10", 1, "Physical Review", "Phys. Rev.", 19491231, 19600101, "13", "32", "5", "5", 0, ""],
		[-12, 2359360, "2014-02-16 10:34:11", 1, "Physical Review A", "Phys. Rev. A", 20060101, 0, "13", "20", "5", "17.6", 0, ""],
		[-13, 262208, "2014-02-16 10:34:12", 0, "Physical Review B", "Phys. Rev. B", 0, 19980201, "10", "18", "5", "5", 0, ""],
		[-14, 2359360, "2014-02-16 10:34:13", 1, "Physical Review B", "Phys. Rev. B", 20040831, 0, "10", "19.5", "5", "17.5", 0, ""],
		[-15, 2621504, "2014-02-16 10:34:14", 1, "Physical Review E", "Phys. Rev. E", 20080107, 20110101, "13", "19.7", "5", "18", 0, ""],
		[-16, 262208, "2014-02-16 10:34:15", 0, "Physical Review Letters", "Phys. Rev. Lett.", 0, 19990509, "13", "27.1", "5", "26.7", 0, ""],
		[-17, 2359360, "2014-02-16 10:34:16", 1, "Physical Review Letters", "Phys. Rev. Lett.", 19990510, 0, "13", "15.7", "5", "19.8", 0, ""],
		[-18, 2097216, "2014-02-16 10:34:24", 1, "Physical Review X", "Phys. Rev. X", 0, 0, "5", "15.2", "5", "16.4", 0, ""],
		[-19, 2621504, "2014-02-16 10:34:17", 1, "Physics Letters B", "Physics Letters B", 19831103, 19930101, "5", "25.6", "5", "26.4", 0, ""],
		[-20, 2621504, "2014-02-16 10:34:18", 1, "Resonance", "Reson", 20050401, 20050501, "13", "17.3", "5", "21.5", 0, ""],
		[-21, 2621504, "2014-02-16 10:34:19", 1, "Reviews of Modern Physics", "Rev. Mod. Phys.", 19751231, 19940101, "13", "21.9", "5", "23.7", 0, ""],
		[-22, 2621504, "2014-02-16 10:34:20", 1, "Reviews of Modern Physics", "Rev. Mod. Phys.", 19980401, 20101108, "13", "11.9", "5", "10.7", 0, ""],
		[-23, 524288, "2014-02-16 10:34:21", 0, "Science", "Science", 20010330, 20030905, "5", "22.7", "12.3", "9", 1, ""],
		[-24, 262208, "2014-02-16 10:34:22", 0, "Science", "Science", 20090213, 0, "5", "11.4", "12.3", "9", 0, ""],
		[-25, 2621504, "2014-02-16 10:34:23", 1, "Zeitschrift für Physik", "", 19251231, 19280101, "13", "28.6", "5", "5", 0, ""]
	];
	
	for (let i=0; i<builtinJournals.length; i++) {
		yield conn.executeCached("INSERT INTO journals VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", builtinJournals[i]);
	}
	
	// Disable any builtin journals that had already been deleted by the user.
	yield conn.execute("UPDATE journals SET enabled=0, priority=priority & ~2097152 WHERE id IN (SELECT id FROM deletedBuiltinJournals)");
}
