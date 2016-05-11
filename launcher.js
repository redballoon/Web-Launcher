var path = require('path');
var HID = require('./node-hid/');
var device = require('./detectDevice');
var options = {
	debug : false,
	usb_path : device,//USB_2123_1010_fd131200
	// delay before firing
	stabilize_delay : 1000,
	// delay after firing
	fire_delay : 4500,
	// estimate of how much to move left for it to be 'reset'
	reset_left_delay : 8000,
	// estimate of how much to move down for it to be 'reset'
	reset_down_delay : 2000,
	state : {
		transition : false,
		firing : false,
		online : false,
		reset : false
	}
};
var launcher = null;
var commands = {
	down : 0x01,
	up : 0x02,
	left : 0x04,
	right : 0x08,
	fire : 0x10,
	stop : 0x20,
	on : 0x01,
	off : 0x00
};
var command_stack = [];
var allowed_move_cmd = ['left', 'up', 'right', 'down'];
var methods = {
	log : function () {
		if (!options.debug) return;
		Array.prototype.splice.call(arguments, 0, 0, path.basename(__filename) + ':');
		console.log.apply(null, arguments);
	},
	empty_set : function (length) {
		var list = [], i;
		for (i = 0; i < length; i++) {
			list.push(0x00);
		}
		return list;
	},
	base_set : function (val, length) {
		var data = this.empty_set(length);
			data[1] = val;
		return data;
	},
	code_set : function (val) {
		var data = this.base_set(0x02, 10);
		return (data[2] = val) ? data : data;
	},
	io_set : function (val) {
		var data = this.base_set(0x03, 9);
		return (data[2] = val) ? data : data;
	},
	led : function (mode) {
		methods.log('led:', mode);
		var data = this.io_set(mode ? commands.on : commands.off);
		//console.log(data);
		launcher.write(data);
	},
	send : function (cmd) {
		methods.log('send:', cmd);
		var data = this.code_set(commands[cmd]);
		//console.log(data);
		launcher.write(data);
	},
	dequeue : function () {
		// unavailable
		if (options.state.transition) {
			return;
		}
		options.state.transition = true;
		
		var next = function () {
			if (!command_stack.length) {
				methods.log('next: stack is empty');
				options.state.transition = false;
				return;
			}
			var fn = command_stack.shift();
			methods.log('next: checking stack');
			fn.call(null, next);
		};
		next();
	},
	sleep : function (delay) {
		command_stack.push(function (next) {
			methods.log('sleep:');
			setTimeout(function () {
				next();
			}, delay);
		});
	},
	add : function (callback) {
		command_stack.push(function (next) {
			callback();
			next();
		});
	},
	/**
	*	move
	*	move the launcher for x amount of time.
	*	@param {string} cmd - direction to move towards
	*	@param {number} duration - launcher will move for the set duration
	*/
	move : function (cmd, duration) {
		methods.log('move: queue', cmd);
		
		this.add(function () { methods.send(cmd); });
		this.sleep(duration);
		this.add(function () { methods.send('stop'); });
		
		//
		options.status.reset = false;
	},
	/*
	*	execute
	*	handle toggling the LED and firing the launcher
	*	@param {string} cmd - direction to move towards
	*	@param {number} value - launcher will fire set amount of time
	*/
	execute : function (cmd, value) {
		methods.log('execute: queue', cmd);
		
		// io
		if (cmd === 'led') {
			this.add(function () { methods.led(value); });
			return;
		}
		// normalize
		value = value < 1 ? 1 : value;
		value = value > 4 ? 4 : value;
		
		// will fire launcher
		options.state.firing = true;
		
		// multiple fire
		this.sleep(options.stabilize_delay);
		var fire_fn = function () { methods.send(cmd); };
		for (var i = 0; i < value; i++) {
			this.add(fire_fn);
			this.sleep(options.fire_delay);
		}
		this.add(function () {
			options.state.firing = false;
		});
	},
	reset : function () {
		methods.log('reset:');
		
		this.move('down', options.reset_down_delay);
		this.move('left', options.reset_left_delay);
		this.add(function () { options.status.reset = true; });
	},
	trigger : function (cmd, value) {
		methods.log('trigger:', cmd);
		
		if (launcher === null) {
			methods.log('trigger: launcher has not been initialized');
			return;
		}
		
		// reset launcher position
		if (cmd === 'reset') {
			this.reset();
			
		// LED on/off OR fire launcher
		} else if (cmd === 'fire' || cmd === 'led') {
			this.execute(cmd, value);
			
		// move launcher
		} else if (typeof commands[cmd] !== 'undefined') {
			this.move(cmd, value);
			
		// other
		} else {
			methods.log('trigger: command is invalid', cmd);
		}
		
		// start the command queue
		methods.dequeue();
	}
};

// initialize HID
if (!options.usb_path) {
	console.log('error: launcher was not found');
	module.exports = false;
	return;
}
launcher = new HID.HID(options.usb_path);
// setup HID events
launcher
.on('data', function(data) {
	methods.log('event: reading: ', data);
})
.on('error', function(err) {
	methods.log('event: error: ', err);
});
launcher.read(function (err, data) {
	methods.log('read:', err, data);
});

/**
	Tests
*/
// run commands
methods.calibrate_1 = function () {
	// calibrate test 1
	// 6 sec to the right seems its all it needs
	methods.trigger('led', 1);
	methods.trigger('reset', 0);
	methods.trigger('right', 6000);
	methods.trigger('led', 0);
};
methods.test_1 = function () {
	methods.trigger('led', 1);
	methods.trigger('reset', 0);
	methods.trigger('right', 3250);
	methods.trigger('up', 540);
	methods.trigger('fire', 2);
	methods.trigger('led', 0);
};

methods.reset = function () {
	
};

module.exports = {
	state : function () {
		return options.state;
	},
	busy : function () {
		return options.state.transition;
	},
	on : function () {
		if (options.state.online) {
			methods.log('launcher: on: device is already on');
			return;
		}
		
		options.state.online = true;
		methods.trigger('led', 1);
	},
	off : function () {
		if (!options.state.online) {
			methods.log('launcher: off: device is already off');
			return;
		}
		options.state.online = false;
		methods.trigger('led', 0);
	},
	cancel : function (callback) {
		if (!options.state.online) {
			methods.log('launcher: cancel: device must be on. abort.');
			return;
		}
		methods.add(callback);
	},
	move : function (cmd, value) {
		if (!options.state.online) {
			methods.log('launcher: move: device must be on. abort.');
			return;
		}
		var flag = false;
		allowed_move_cmd.map(function (value) {
			if (!flag) flag = (value === cmd);
		});
		if (!flag) {
			methods.log('launcher: cmd not allowed');
			return;
		}
		methods.trigger(cmd, value);
	},
	fire : function (repeat) {
		if (!options.state.online) {
			methods.log('launcher: fire: must be on');
			return;
		}
		methods.trigger('fire', repeat);
	},
	reset : function () {
		methods.reset();
	}
};

//methods.test_1();

//methods.add(function () { launcher.close(); });
//console.log(devices);