jQuery(function ($) {
	
	console.log('ready');
	
	// DOM
	var $section_intro = $('#section-intro');
	var $section_interface = $('#section-interface');
	var $controls_container = $section_interface.find('.controls-container');
	var $roster = $section_intro.find('.roster');
	var $roster_template = $roster.find('.template');
	
	var socket = null;
	var state = {
		level : 0,
		paused : false
	};
	var user = {};
	var uid = 'uid-' + Math.floor(Math.random() * 100) + '-' + (new Date()).getTime();
	var methods = {
		init_socket : function () {
			socket = io();
			socket
			.emit('register', { 'name' : user.name, 'uid' : uid })
			.on('roster', function (data) {
				console.log('event: roster:', data);
				if (!data || !data.list) {
					console.log('event: roster: no data found');
					return;
				}
				for (var i = 0; i < data.list.length; i++) {
					var $entry = $roster_template.clone().removeClass('template');
						$entry.attr('id', data.list[i].uid).text(data.list[i].name);
					$roster.append($entry);
				}
			})
			.on('added', function (data) {
				console.log('event: added:', data);
				if (!data) {
					console.log('event: added: no data found');
					return;
				}
				var $entry = $roster_template.clone().removeClass('template');
					$entry.attr('id', data.uid).text(data.name);
				if (data.uid === uid) {
					$entry.addClass('self');
				}				
				$roster.append($entry);
			})
			.on('announce', function (name) {
				console.log('event: announcement:', name);
			})
			.on('promoted', function () {
				console.log('event: promoted:');
				$section_interface.addClass('on');
			})
			.on('demoted', function (data) {
				console.log('event: demoted:', data.code);
				$section_interface.removeClass('on');
			});
			
		},
		send : function (cmd) {
			// send command
			cmd = $.trim(cmd.toLowerCase());
			if (cmd !== 'fire') {
				socket.emit('move', cmd);
				return;
			}
		},
		highlight_user : function () {
		
		}
	};
	
	// events
	$section_intro.find('form')
	.on('submit', function (e) {
		e.preventDefault();
		
		if (state.level > 0) {
			return;
		}
		
		var name = $('#userName').val();
			name = $.trim(name).toLowerCase();
		if (!name) {
			alert('Please type a name');
			return;
		}
		
		state.level++;
		user.name = name;
		$section_intro.addClass('disabled');
		$section_interface.addClass('enabled');
		
		methods.init_socket();
	});
	
	$controls_container.find('button')
	.on('click', function () {
		var $this = $(this);
		
		if (!socket) {
			console.log('event: click: app not initiated');
			return;
		}
		
		// validate command
		var cmd = typeof $this.data('cmd') !== 'undefined' ? $this.data('cmd') : false;
		if (cmd === false) {
			console.log('event: click: no data found');
			return;
		}
		
		console.log('event: click:', cmd);
		methods.send(cmd);
	});
	
	
});
