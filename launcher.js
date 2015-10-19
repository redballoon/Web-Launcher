var HID = require('./node-hid/');
var device = require('./detect-device');
var options = {
	debug : false,
	// update - depends on the machine
	usb_path : device,//USB_2123_1010_fd131200
	// delay before firing
	stabalize_delay : 1000,
	// delay after firing
	fire_delay : 4500,
	reset_left_delay : 8000,
	reset_down_delay : 2000,
	state : {
		transition : false,
		firing : false,
		online : false
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
		if (options.debug) console.log('led:', mode);
		var data = this.io_set(mode ? commands.on : commands.off);
		//console.log(data);
		launcher.write(data);
	},
	send : function (cmd) {
		if (options.debug) console.log('send:', cmd);
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
				if (options.debug) console.log('next: stack is empty');
				options.state.transition = false;
				return;
			}
			var fn = command_stack.shift();
			if (options.debug) console.log('next: checking stack');
			fn.call(null, next);
		};
		next();
	},
	sleep : function (delay) {
		command_stack.push(function (next) {
			if (options.debug) console.log('sleep:');
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
	move : function (cmd, delay) {
		if (options.debug) console.log('move: queue', cmd);
		
		this.add(function () { methods.send(cmd); });
		this.sleep(delay);
		this.add(function () { methods.send('stop'); });
	},
	execute : function (cmd, value) {
		if (options.debug) console.log('execute: queue', cmd);
		// io
		if (cmd === 'led') {
			this.add(function () { methods.led(value); });
			return;
		}
		
		// fire launcher
		options.state.firing = true;
			// normalize
		value = value < 1 ? 1 : value;
		value = value > 4 ? 4 : value;
			// multiple fire
		this.sleep(options.stabalize_delay);
		var fire_fn = function () { methods.send(cmd); };
		for (var i = 0; i < value; i++) {
			this.add(fire_fn);
			this.sleep(options.fire_delay);
		}
		this.add(function () {
			options.state.firing = false;
		});
	},
	trigger : function (cmd, value) {
		if (options.debug) console.log('trigger:', cmd);
		
		if (launcher === null) {
			if (options.debug) console.log('trigger: launcher has not been initialized');
			return;
		}
		
		// reset launcher position
		if (cmd === 'reset') {
			this.move('down', options.reset_down_delay);
			this.move('left', options.reset_left_delay);
		// LED on/off OR fire launcher
		} else if (cmd === 'fire' || cmd === 'led') {
			this.execute(cmd, value);
		// move launcher
		} else if (typeof commands[cmd] !== 'undefined') {
			this.move(cmd, value);
		// other
		} else {
			if (options.debug) console.log('trigger: command is invalid', cmd);
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
	if (options.debug) console.log('event: reading: ', data);
})
.on('error', function(err) {
	if (options.debug) console.log('event: error: ', err);
});
launcher.read(function (err, data) {
	if (options.debug) console.log('read:', err, data);
});

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
}

module.exports = {
	state : function () {
		return options.state;
	},
	busy : function () {
		return options.state.transition;
	},
	on : function () {
		if (options.state.online) {
			console.log('launcher: on: already on');
			return;
		}
		
		options.state.online = true;
		methods.trigger('led', 1);
	},
	off : function () {
		if (!options.state.online) {
			console.log('launcher: off: already off');
			return;
		}
		options.state.online = false;
		methods.trigger('led', 0);
	},
	cancel : function (callback) {
		if (!options.state.online) {
			console.log('launcher: cancel: must be on');
			return;
		}
		methods.add(callback);
	},
	move : function (cmd, value) {
		if (!options.state.online) {
			console.log('launcher: move: must be on');
			return;
		}
		var flag = false;
		allowed_move_cmd.map(function (value) {
			if (!flag) flag = value === cmd;
		});
		if (!flag) {
			console.log('launcher: cmd not allowed');
			return;
		}
		methods.trigger(cmd, value);
	},
	fire : function (repeat) {
		if (!options.state.online) {
			console.log('launcher: fire: must be on');
			return;
		}
		methods.trigger('fire', repeat);
	}
};

//methods.test_1();

//methods.add(function () { launcher.close(); });
//console.log(devices);