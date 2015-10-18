"use strict";

if (window.PlatformTools === undefined) {
	window.PlatformTools = {};
}


(function() {
	var publicInterface = {
		openSqlDatabase
	};

	for (let i in publicInterface) {
		PlatformTools[i] = publicInterface[i];
	}


	function openSqlDatabase(options) {
		var dbhandle;

		return new Promise(function(resolve, reject) {
			var publicMembers = {
				transaction
			};

			var defaultOptions = {
				dbname: "sqldatabase",
				targetVersion: "",
				description: "Database created by PlatformTools",
				estimatedSize: 100 * 1024,
				updateVersionCallback: null
			};
			for (let i in defaultOptions) {
				if (options[i] === "undefined") {
					options[i] = defaultOptions;
				}
			}

			dbhandle = openDatabase(options.dbname, "", options.description, options.estimatedSize);

			if (dbhandle.version === options.targetVersion) {
				resolve(publicMembers);
			} else {
				if (typeof options.updateVersionCallback !== "function") {
					reject('Database "' + options.dbname + '" has wrong version and no callback to update the database version was provided (expected version "' + options.targetVersion + '" but got "' + dbhandle.version + '").');
				} else {
					let res1;
					let executionPromise = new Promise(function(res, rej) {
						res1 = res;
					});

					try {
						options.updateVersionCallback(
							dbhandle.version,
							options.targetVersion,
							function runUpdateTransaction(generatorFunction) {
								return new Promise(function(res, rej) {
									dbhandle.changeVersion(
										dbhandle.version,
										options.targetVersion,
										makeTransactionCallback(generatorFunction, res1),
										function(err) {
											rej(err);
											reject(err);
										},
										function() {
											res(executionPromise);
											resolve(publicMembers);
										}
									);
								})
							}
						);
					} catch (e) {
						reject(e);
					}
				}
			}
		});


		/**
		 * Execute a transaction. Spawns the function* generatorFunction
		 * passing it a function "sql". The body of generatorFunction will
		 * typically yield for one or more executions of the sql function,
		 * i.e. it will contain calls of the form
		 *     let queryresult = yield sql(sqlstring, args)
		 * Here, sqlstring is a query string that may contain "?"
		 * placeholders and args is an optional array of values to be
		 * inserted for the placeholders.
		 * Note: The body of generatorFunction MUST NOT contain any "yield"
		 * expressions that don't queue up any SQL queries (if it does, the
		 * SQL transaction may be committed before generatorFunction
		 * terminates).
		 *
		 * @param  {function*(sql)} generatorFunction
		 *         A generator function that MUST NOT contain any yield
		 *         expressions that are not of the form
		 *         "yield sql(sqlstring, args)".
		 *         If the SQL query succeeds, the return value of the yield
		 *         expression is the query result. If it fails, an error is
		 *         thrown.
		 *
		 * @param  {bool} readonly
		 *         Optional argument; set to true if the transaction does
		 *         not change the database. Defaults to false.
		 *
		 * @return {Promise}
		 *         A promise that will be resolved with the return value of
		 *         generatorFunction or rejected in case of an error.
		 */
		function transaction(generatorFunction, readonly) {
			let res1;
			let executionPromise = new Promise(function(res, rej) {
				res1 = res;
			});

			return new Promise(function(resolve, reject) {
				dbhandle[readonly ? "readTransaction" : "transaction"](
					makeTransactionCallback(generatorFunction, res1),
					reject,
					function() {
						resolve(executionPromise);
					}
				);
			});
		}
	}


	function makeTransactionCallback(generatorFunction, res) {
		return function (transaction) {
			function sql(sqlstring, args) {
				return new Promise(function(resolve, reject) {
					transaction.executeSql(
						sqlstring,
						args,
						function(t2, result) {
							if (typeof result === "object" && result.rows) {
								let newrows = new Array(result.rows.length);
								for (let i=0; i<result.rows.length; i++) {
									newrows[i] = new SqlResultRow(result.rows[i]);
								}
								let ret = {rows: newrows};
								try {
									ret.insertId = result.insertId;
								} catch (e) {}
								resolve(ret);
							} else {
								resolve(result);
							}
						},
						function(t2, err) {
							reject(err);
						}
					);
				});
			}

			res(PlatformTools.spawn(generatorFunction, sql));
		}
	}


	function SqlResultRow(rowData) {
		this._rowData = rowData;
	}

	SqlResultRow.prototype.getResultByName = function(name) {
		return this._rowData[name];
	};
}());
