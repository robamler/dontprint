"use strict";

if (window.PlatformTools === undefined) {
	window.PlatformTools = {};
}


(function() {
	var publicInterface = {
		spawn
	};

	for (let i in publicInterface) {
		PlatformTools[i] = publicInterface[i];
	}

	return;


	/**
	 * Iterate through a generator function (a function*) and allow
	 * asynchroneous function calls with a notation that closely resembles
	 * synchroneous function calls. A typical invocation of spawn reads
	 * something like this:
	 *
	 *     PlatformTools.spawn(function*() {
	 *         try {
	 *             var a = yield asyncFunction1();     // Case 1) or 3)
	 *             var b = yield asyncFunction2(a);    // Case 1) or 3)
	 *         } catch (e) {
	 *             alert("Error: " + e.toString());
	 *         }
	 *         var c = yield otherGeneratorFunction(a, b);  // Case 2)
	 *         return c;
	 *     });
	 *
	 * For every yield expression in the body of the spawned function*,
	 * spawn performs an action depending on the operand of yield:
	 *
	 * 1) If the operand is a promise then the execution of the function*
	 *    is paused. The execution will continue as soon as the promise is
	 *    fulfilled and the value of the yield expression will be the
	 *    resolution value of the promise. If the promise is rejected, the
	 *    reason for the rejection will be thrown as an error at the
	 *    position of the yield expression. This case can be used to
	 *    asynchroneously call a function that returns a promise and wait
	 *    until the promise is resolved, see vars a and b in the example
	 *    above. Here, the functions asyncFunction1 and asyncFunction2
	 *    both return a promise. Notice that
	 *      * asyncFunction2 is called with a> as parameter despite the
	 *        fact that <a> was obtained from an asynchroneous function.
	 *        This is possible since, at the time asyncFunction2 is called,
	 *        the asynchroneous operation that produced <a> has already
	 *        finished.
	 *      * The "catch" block will catch errors that appear in the
	 *        execution of *either* asyncFunction1 or asyncFunction2.
	 *
	 * 2) If the operand of the yield expression is an iterator, then the
	 *    execution will flow recursively. This is useful to call another
	 *    function* from within generator function, see var c in the
	 *    example above. Here, <otherGeneratorFunction> is again a
	 *    function* and the statement is equivalend to
	 *        var c = yield PlatformTools.spawn(otherGeneratorFunction);
	 *
	 * 3) If the operand of the yield expression is of any other type
	 *    (including undefined) then the yield expression will assume the
	 *    same value. This is useful to have a consistent syntax to call
	 *    functions that may or may not return a promise (or that don't
	 *    return a promise but may do so in a future versions of their
	 *    implementation). Note that, before execution of the spawned
	 *    function* continues, it will be paused to to run any tasks that
	 *    may have queued up since the last yield expression.
	 *
	 * @param  {function*} generatorFunction
	 *         The function to be spawned.
	 *
	 * @return {Promise}
	 *         A promise that will be resolved with the value returned
	 *         from generatorFunction (or with undefined if
	 *         generatorFunction doesn't return a value), or rejected
	 *         if generatorFunction throws an error.
	 */
	function spawn(generatorFunction, args) {
		function iterate(generator) {
			function continuer(verb, arg) {
				try {
					var result = generator[verb](arg);
				} catch (err) {
					return Promise.reject(err);
				}
				if (result.done) {
					return Promise.resolve(result.value);
				} else {
					if (typeof result.value === "object" && result.value.next && typeof result.value.next === "function") {
						return iterate(result.value).then(onFulfilled, onRejected);
					} else {
						return Promise.resolve(result.value).then(onFulfilled, onRejected);
					}
				}
			}
			let onFulfilled = continuer.bind(continuer, "next");
			let onRejected = continuer.bind(continuer, "throw");
			return onFulfilled();
		}

		let gen = generatorFunction.apply(this, Array.prototype.slice.call(arguments, 1));
		return iterate(gen);
	}
}());
