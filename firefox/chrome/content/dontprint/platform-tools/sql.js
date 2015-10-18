"use strict";

if (typeof PlatformTools === "undefined") { //TODO
	var PlatformTools = {};
}


(function() {
	var publicInterface = {
		openSqlDatabase
	};

	for (let i in publicInterface) {
		PlatformTools[i] = publicInterface[i];
	}

	Components.utils.import("resource://gre/modules/Sqlite.jsm")
	return;

	function openSqlDatabase(options) {
		var publicMembers = {
			transaction
		};

		var dbPath = null;

		let defaultOptions = {
			targetVersion: "",
			updateVersionCallback: null
		};
		for (let i in defaultOptions) {
			if (options[i] === "undefined") {
				options[i] = defaultOptions;
			}
		}

		// Initialize database in the profile directory. FileUtils.getFile()
		// creates the directory (but not the file) if necessary
		dbPath = FileUtils.getFile("ProfD", options.filename.split("/")).path;
		
		return PlatformTools.spawn(function*() {
			try {
				let needupdate = false;
				let actualVersion = "";
				// Sqlite.openConnection() creates the file if necessary
				var conn = yield Sqlite.openConnection({path: dbPath});
				if (!(yield conn.tableExists("settings"))) {
					needupdate = true;
				} else {
					let sqlresult = yield conn.execute("SELECT value FROM settings WHERE key='dbversion'");
					if (sqlresult.length === 0) {
						needupdate = true;
					} else {
						actualVersion = sqlresult[0].getResultByName("value");
						if (actualVersion != options.targetVersion) {
							needupdate = true;
						}
					}
				}

				if (needupdate) {
					if (typeof options.updateVersionCallback !== "function") {
						throw 'Database "' + options.filename + '" has wrong version and no callback to update the database version was provided (expected version "' + options.targetVersion + '" but got "' + actualVersion + '").';
					} else {
						yield new Promise(function(resolve, reject) {
							options.updateVersionCallback(
								actualVersion,
								options.targetVersion,
								function runUpdateTransaction(generatorFunction) {
									runTransaction(
										conn,
										generatorFunction,
										function*(sql) {
											yield sql("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY ON CONFLICT REPLACE, value TEXT)");
											yield sql("INSERT INTO settings VALUES ('dbversion', ?)", [options.targetVersion]);
										}
									).then(resolve, reject);
								}
							);
						});
					}
				}
			} finally {
				try {
					yield conn.close();
				} catch (e) {}
			}
			return publicMembers;
		});


		function transaction(generatorFunction, readonly) {
			return PlatformTools.spawn(function*() {
				try {
					var conn = yield Sqlite.openConnection({path: dbPath});
					return yield runTransaction(conn, generatorFunction);
				} finally {
					try {
						yield conn.close();
					} catch (e) {}
				}
			});
		}
	}


	function runTransaction(conn, funcOrGeneratorFunc, postExecutionGeneratorFunc) {
		return conn.executeTransaction(function*() {
			let iterator = funcOrGeneratorFunc(conn.execute.bind(conn));
			let ret = null;
			if (typeof iterator === "object" && typeof iterator.next === "function") {
				let i = iterator.next();
				while (!i.done) {
					i = iterator.next({rows: yield i.value});
				}
				ret = i.value;
			} else {
				ret = iterator;
			}

			if (postExecutionGeneratorFunc) {
				let iterator = postExecutionGeneratorFunc(conn.execute.bind(conn));
				let i = iterator.next();
				while (!i.done) {
					i = iterator.next({rows: yield i.value});
				}
			}
			return ret;
		});
	}
}());
