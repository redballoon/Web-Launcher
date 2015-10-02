var launcher = {
	busy : function () {
		return false;
	},
	on : function () {
	},
	off : function () {
	},
	cancel : function (callback) {
	},
	move : function (cmd, value) {
	},
	fire : function () {
	}
};//require('./launcher');
var express = require('express');
var app = express();
var connect = require('connect');
var http = require('http').Server(app);
var io = require('socket.io')(http);

var options = {
	debug : true,
	port : 3000,
	move_rate : 500,
	status : {
		transition : false,
		sleep : false
	}
};
var server;
var socket_map = {};
var socket_queue = [];
var current_king = '';
var inactive_timer = null;
var inactive_delay = 60000;

var methods = {
	inactive : function () {
		if (options.debug) console.log('inactive: timer up');
		if (!current_king) {
			if (options.debug) console.log('inactive: no king set');
			return;
		}
		methods.demote(socket_map[current_king].socket);
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
			methods.inactive();
		}, inactive_delay);
	},
	prepare : function (socket) {
		var id = socket.id;
		
		socket.on('disconnect', function () {
			if (options.debug) console.log('event: disconnection', id, arguments);
			
			if (typeof socket_map[id] === 'undefined') {
				if (options.debug) console.log('user never registered');
				return;
			}
			
			// remove socket
			delete socket_map[id];
			
			// socket was also king of the hill
			if (current_king === id) {
				methods.next_king();
			}
			
			// announce that you removed someone
		});
		
		socket.on('register', function (data) {
			if (options.debug) console.log('event: register');
			
			// build current roster
			var list = [];
			for (var key in socket_map) {
				if (socket_map.hasOwnProperty(key)) {
					list.push({ 'name' : socket_map[key].name, 'uid' : socket_map[key].uid });
				}
			}
			
			// add socket
			socket_map[id] = { 'name' : data.name, 'socket' : socket, 'uid' : data.uid };
			socket_queue.push(id);
			
			// send roster
			socket.emit('roster', { 'list' : list });
			// announce new entry
			io.emit('added', { 'name' : data.name, 'uid' : data.uid });
			
			// no king of the hill
			if (!current_king) {
				methods.next_king();
			}
		});
	},
	fetch_king : function () {
		var next_id = '';
		
		// search for the next king of the hill
		for (var i = 0; i < socket_queue.length; i++) {
			var id = socket_queue.shift();
			
			// king still exists
			if (socket_map[id] !== 'undefined') {
				next_id = id;
				break;
			}
		}
		return next_id;
	},
	next_king : function () {
		if (options.debug) console.log('next_king:');
		
		if (options.transition) {
			if (options.debug) console.log('next_king: already waiting');
			return;
		}
		
		// launcher
		if (launcher.busy()) {
			if (options.debug) console.log('next_king: launcher is busy');
			options.transition = true;
			launcher.cancel(function () {
				if (options.debug) console.log('next_king: cancel callback');
				options.transition = false;
				methods.next_king();
			});
			return;
		}
		
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
		
		if (socket_map[next_id] === 'undefined') {
			if (options.debug) console.log('next_king: somehow lost socket');
			current_king = '';
			// launcher
			launcher.off();
			return;
		}
		var socket = socket_map[next_id].socket;
		// must be unbinded on demoted
		socket.on('move', function (data) {
			if (socket.id !== current_king) {
				if (options.debug) console.log('event: move: not valid king', socket.id, current_king);
				return;
			}
			if (options.debug) console.log('event: move', data);
			methods.reset_timer();
			methods.move(data);
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
		cause = !cause ? 0 : cause;
		socket.emit('demoted', { code : cause });
		// remove socket
		delete socket_map[socket.id];
		socket.disconnect();
	},
	move : function (cmd) {
		launcher.move(cmd, options.move_rate);
	}
};

app.use(express.static(__dirname + '/public', { index : 'index.html' }));
app.get('/stats', function (req, res) {
	var count = 0;
	for (var i = 0; i < socket_queue.length; i++) {
		var id = socket_queue[i];
		if (socket_map[id] !== 'undefined') {
			count++;
		}
	}
	if (current_king) count++;
	res.send({ total : count });
});
app.get('/shutdown', function (req, res) {
	// close hardware
});
io.on('connection', function (socket) {
	if (options.debug) console.log('event: connection', socket.id);
	
	methods.prepare(socket);
});
server = http.listen(options.port, function () {
	if (options.debug) console.log(server.address());
});

// app.get('/', function(req, res){
// 	res.sendFile('index.html');
// });