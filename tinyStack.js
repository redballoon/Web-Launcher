/**
* tinyStack
*
* Simple stacking queue.
*
* @version v1.0.0
* @author Fredi Quirino
* @link 
*/
var path = require('path');

class TinyStack {
	constructor() {
		this.command_stack = [];
		this.options = {
			debug : true,
			state : {
				transition : false
			}
		};
	}
	
	log() {
		if (!this.options.debug) return;
		Array.prototype.splice.call(arguments, 0, 0, path.basename(__filename) + ':');
		console.log.apply(null, arguments);
	}
	
	dequeue() {
		if (this.options.state.transition) {
			this.log('dequeue: unavailable');
			return false;
		}
		
		this.options.state.transition = true;
		
		var next = function () {
			if (!this.command_stack.length) {
				this.log('next: stack is empty');
				this.options.state.transition = false;
				return;
			}
			var fn = this.command_stack.shift();
			this.log('next: checking stack');
			fn.call(null, next);
		};
		next();
	}
	
	sleep(delay) {
		this.command_stack.push(function (next) {
			this.log('sleep:');
			setTimeout(function () {
				next();
			}, delay);
		});
	}
	
	add(callback) {
		this.command_stack.push(function (next) {
			callback();
			next();
		});
	}
}

module.exports = TinyStack;