jQuery(function ($) {
	
	// DOM
	var $carousel = $('.carousel');
	var $section_instructions = $('#section-instruction');
	var $section_intro = $('#section-intro');
	var $section_interface = $('#section-interface');
	
	var $controls_container = $section_interface.find('.controls-container');
	var $sidebar = $('#section-stats');
	var $total_users = $sidebar.find('.total_users');
	var $roster = $sidebar.find('.roster');
	var $roster_template = $roster.find('.template');
	var $window = $(window);
	
	var socket = null;
	var state = {
		level : 0,
		paused : false
	};
	var level_set = [$section_instructions, $section_intro, $section_interface];
	var user = {};
	var uid = 'uid-' + Math.floor(Math.random() * 100) + '-' + (new Date()).getTime();
	
	
	
	var methods = {
		init_socket : function () {
			socket = io();
			
			socket
			.emit('register', { 'name' : user.name, 'uid' : uid })
			
			// todo: move these to methods object
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
				
				methods.update_count(true);
			})
			.on('removed', function (data) {
				console.log('event: removed:', data);
				if (!data) {
					console.log('event: removed: no data found');
					return;
				}
				$roster.find('#' + data.uid).remove();
				methods.update_count(false);
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
		
		},
		update_count : function (val) {
			if (typeof val === 'number') {
				$total_users.text(val);
				return;
			}
			var val = val ? 1 : -1;
			var total = parseInt($total_users.text(), 10);
				total = isNaN(total) ? 0 : total;
				total = total + val;
				$total_users.text(total);
		},
		poll_users : function () {
			$.get('stats', function (data) {
				console.log('poll_users:', data);
				$total_users.text(data.total);
			});
		}
	};
	
	// events
	$window.on('resize', function () {
		$carousel.find('.carousel_wrapper').height($window.height());
		
		var $target = $section_intro.find('.wrapper');
		if ($target.length) {
			$target.css('margin-top', -1 * ($target.height() / 2));
		}
	}).trigger('resize');
	
	$carousel
	.on('after_animation', function (e, flag) {
		//console.log('event: before_animation:');
		if (flag === 'show') {
			$window.resize();
		}
	})
	.on('animation_complete', function (e, flag) {
		//console.log('event: animation_complete:');
		if (flag === 'show') {
			level_set[state.level].trigger('section_load');
		}
	});
	
	
	
	
	// section - instructions
	$section_instructions.on('section_load', function () {
		console.log('section_load: instructions');
		
		if (state.level !== 0) {
			console.log('section-instruction: not valid state');
			return;
		}
		
		$section_instructions.find('.next-btn')
		.one('click', function (e) {
			console.log('section-instruction: next');
			state.level++;
			$carousel.simpleCarousel('next');
		});
	});
	
	// section - register
	$section_intro.on('section_load', function () {
		console.log('section_load: intro');
		
		if (state.level !== 1) {
			console.log('section-intro: not valid state');
			return;
		}
		
		$section_intro.find('form')
		.on('submit', function (e) {
			e.preventDefault();
			
			if (state.level !== 1) {
				console.log('section-intro: not valid state');
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
			
			$carousel.simpleCarousel('next');
			
			methods.init_socket();
		});
	});
	// section - interface
	$section_interface.on('section_load', function () {
		console.log('section_load: interface');
		
		if (state.level !== 2) {
			console.log('section-interface: not valid state');
			return;
		}
		
		$controls_container.find('button')
		.on('click', function () {
			if (state.level !== 2) {
				console.log('section-interface: not valid state');
				return;
			}
		
			var $this = $(this);
			
			if (!socket) {
				console.log('section-interface: app not initiated');
				return;
			}
			
			// validate command
			var cmd = typeof $this.data('cmd') !== 'undefined' ? $this.data('cmd') : false;
			if (cmd === false) {
				console.log('section-interface: no data found');
				return;
			}
			
			console.log('event: click:', cmd);
			methods.send(cmd);
		});
	});
	
	
	// init carousel
	$carousel.simpleCarousel({ dot_pagination : false });
	
	methods.poll_users();
	
	// kickoff section
	level_set[state.level].trigger('section_load');
	
});
