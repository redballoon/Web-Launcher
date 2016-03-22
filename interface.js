var launcher = require('./launcher');
var express = require('express');
var app = express();
var connect = require('connect');
var http = require('http').Server(app);
var io = require('socket.io')(http);
var domain = require('domain');

var options = {
	debug : true,
	port : 3000,
	move_rate : 500,
	// max shots a user is allowed on their turn
	shot_per_user : 1,
	// max ammo on rocket launcher
	max_ammo : 4,
	// track ammo left before requiring reload
	ammo_count : 0,
	state : {
		transition : false,
		sleep : false,
		reload : false
	}
};
var server;
var detect_crash;
var socket_map = {};
var socket_queue = [];
var current_king = '';
var inactive_timer = null;
var inactive_delay = 30000;//1 min

// queue up user interactions
// so we can inject things like 'reset'
var interface_stack = [];


options.ammo_count = options.max_ammo;

// to-dos:
// add reload event
// add arcade reload sound
// test kicking a user off after they fire
// add a pause
// shutdown should empty out queue
// if shot_per_user is going to kick off a user then next_king should be called on reload instead of
//	reset timer

var methods = {
	///////////////////
	// Queue commands: move to a modular structure
	///////////////////
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
	///////////////////
	inactive : function (cause) {
		if (options.debug) console.log('inactive: timer up');
		if (!current_king) {
			if (options.debug) console.log('inactive: no king set');
			return;
		}
		methods.demote(socket_map[current_king].socket, cause);
		methods.next_king();
	},
	reset_timer : function () {
		// check for inactivity
		if (options.debug) console.log('reset_timer');
		
		if (inactive_timer) {
			clearTimeout(inactive_timer);
		}
		inactive_timer = setTimeout(function () {
			inactive_timer = null;
			methods.inactive(0);
		}, inactive_delay);
	},
	stop_timer : function () {
		if (inactive_timer) {
			clearTimeout(inactive_timer);
			inactive_timer = null;
		}
	},
	/*
	*	prepare
	*	when a client connects to the server for the first time,
	*	prepare the connection
	*/
	prepare : function (socket) {
		var id = socket.id;
		
		// client disconnected from server
		socket.on('disconnect', function () {
			if (options.debug) console.log('event: disconnection', id, arguments);
			
			// we can't find record of client
			// todo: log this
			if (typeof socket_map[id] === 'undefined') {
				if (options.debug) console.log('user never registered');
				return;
			}
			// announce to all other connected clients
			// that you removed someone
			io.emit('removed', { 'name' : socket_map[id].name, 'uid' : socket_map[id].uid });
			
			// remove record of client
			delete socket_map[id];
			
			// removed client was the king of the hill,
			// get the next client on the queue
			if (current_king === id) {
				methods.next_king();
			}
		});
		// client is registering itself
		socket.on('register', function (data) {
			if (options.debug) console.log('event: register');
			
			// make roster of currently connected clients
			var list = [];
			for (var key in socket_map) {
				if (socket_map.hasOwnProperty(key)) {
					list.push({ 'name' : socket_map[key].name, 'uid' : socket_map[key].uid });
				}
			}
			// add record of client
			socket_map[id] = { 'name' : data.name, 'socket' : socket, 'uid' : data.uid, 'ammo' : options.shot_per_user };
			socket_queue.push(id);
			// send roster to registering client
			socket.emit('roster', { 'list' : list });
			// announce new connected client to all other clients
			io.emit('added', { 'name' : data.name, 'uid' : data.uid });
			
			// currently no king of the hill,
			// get the next client on the queue
			if (!current_king) {
				methods.next_king();
			}
		});
	},
	fetch_king : function () {
		var next_id = '';
		
		if (options.debug) console.log('fetch_king: socket queue length', socket_queue.length);
		
		// search for the next king of the hill
		for (var i = 0; i < socket_queue.length; i++) {
			var id = socket_queue.shift();
			
			if (options.debug) console.log('fetch_king:', id);
			
			// king still exists
			if (typeof socket_map[id] !== 'undefined' && typeof socket_map[id].socket !== 'undefined') {
				next_id = id;
				break;
			}
		}
		return next_id;
	},
	next_king : function () {
		if (options.debug) console.log('next_king:');
		
		
		if (options.state.transition) {
			if (options.debug) console.log('next_king: already waiting');
			return;
		}
		if (options.state.reload) {
			if (options.debug) console.log('next_king: waiting for reload');
			methods.stop_timer();
			return;
		}
		
		// launcher might still be moving from previous commands
		var state = launcher.state();
		if (state.transition || state.firing) {
			if (options.debug) console.log('next_king: launcher is busy');
			options.state.transition = true;
			launcher.cancel(function () {
				if (options.debug) console.log('next_king: cancel callback');
				options.state.transition = false;
				methods.next_king();
			});
			return;
		}
		
		// fetch the socket id of the next person in the queue
		var next_id = methods.fetch_king();
		if (!next_id) {
			if (options.debug) console.log('next_king: no more connections');
			current_king = '';
			// launcher
			launcher.off();
			return;
		}
		// log
		if (options.debug) console.log('next_king:', next_id);
		
		// temp : remove since its redundant
		//if (typeof socket_map[next_id] === 'undefined') {
			//if (options.debug) console.log('next_king: somehow lost socket');
			//current_king = '';
			/// launcher
			//launcher.off();
			//return;
		//}
		
		// bind events to new king
		var socket = socket_map[next_id].socket;
		socket.on('move', function (data) {
			// check user is still king of the hill
			if (socket.id !== current_king) {
				if (options.debug) console.log('event: move: not a valid king', socket.id, current_king);
				return;
			}
			// log
			if (options.debug) console.log('event: move', data);
			
			// reset inactive timer
			methods.reset_timer();
			// don't add commands to the launcher queue
			// if its doing a 'firing' sequence
			if ((launcher.state()).firing) {
				if (options.debug) console.log('event: move: launcher currently firing. abort');
				return;
			}
			
			// movement sequence
			if (data !== 'fire') {
				methods.move(data);
				return;
			}
			
			// fire sequence
			// temp
			//return;
			
			// check if launcher can fire
			// should not be able to hit this point if other parts are working properly
			if (options.ammo_count === 0) {
				if (options.debug) console.log('event: move: Error: attempt to fire when launcher is out of ammo');
			}
			
			
			// check if user can fire
			var user_shots_left = socket_map[current_king].ammo;
			if (user_shots_left <= 0) {
				if (options.debug) console.log('event: move: user has no more shots left');
				
				// temp: kickoff player if they can't shoot
				methods.inactive(0);
				
				
				return;
			}
			socket_map[current_king].ammo = user_shots_left - 1;
			options.ammo_count--;
			
			methods.fire();
			
			// reload notification
			if (options.ammo_count === 0) {
				if (options.debug) console.log('event: move: launcher needs to reload');
				options.state.reload = true;
				socket.emit('reloading', true);
			}
			
			// kick off user if he can no longer fire
			if (options.ammo_count === 0) {
				//methods.inactive(1);
			}
		});
		
		current_king = next_id;
		methods.reset_timer();
		methods.announce(socket_map[next_id].name);
		methods.promote(socket);
		
		// launcher
		launcher.on();
	},
	announce : function (name) {
		io.emit('new_king', name);
	},
	promote : function (socket) {
		socket.emit('promoted', true);
	},
	demote : function (socket, cause) {
		// default to 0 = timeout
		cause = !cause ? 0 : cause;
		
		var data = { 'name' : socket_map[socket.id].name, 'uid' : socket_map[socket.id].uid };
		
		socket.emit('demoted', { code : cause });
		
		// remove socket
		delete socket_map[socket.id];
		socket.disconnect(true);
		
		// announce that you removed someone
		io.emit('removed', data);
	},
	move : function (cmd) {
		launcher.move(cmd, options.move_rate);
	},
	fire : function () {
		launcher.fire(1);
	}
};

///////////////////////////////////////////////////
///////////////////////////////////////////////////

// check: launcher was found
if (!launcher) {
	console.log('error: launcher module failed');
	return;
}
// setup: server paths
app.use(express.static(__dirname + '/public', { index : 'index.html' }));
app.get('/stats', function (req, res) {
	var count = 0;
	for (var i = 0; i < socket_queue.length; i++) {
		var id = socket_queue[i];
		if (typeof socket_map[id] !== 'undefined') {
			count++;
		}
	}
	if (current_king) count++;
	res.send({ total : count });
});
app.get('/shutdown', function (req, res) {
	current_king = '';
	launcher.off();
});
app.get('/reload', function (req, res) {
	options.state.reload = false;
	options.ammo_count = options.max_ammo;
	socket.emit('reloaded', true);
});
app.get('/reset', function (req, res) {
	console.log('reset');
	if (launcher) launcher.reset();
});


// someone made a connection to the server
io.on('connection', function (socket) {
	if (options.debug) console.log('event: connection', socket.id);
	// prepare the connection
	methods.prepare(socket);
});
// init server
server = http.listen(options.port, function () {
	if (options.debug) console.log(server.address());
});
// init crash handler
detect_crash = domain.create();
detect_crash.on('error', function(error) {
	if (options.debug) console.log('event: error: node crashed', error);
});
// app.get('/', function(req, res){
// 	res.sendFile('index.html');
// });