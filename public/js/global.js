jQuery(function ($) {
	
	var debug = true,
		is_mobile = (/iphone|ipod|android|blackberry|mini|windows\sce|palm/i.test(navigator.userAgent.toLowerCase())),
		is_ipad = (/ipad/i.test(navigator.userAgent.toLowerCase())),
		$window = $(window),
		$body = $('body');
	
	// DOM
	var $carousel = $('.carousel');
	var $section_instructions = $('#section-instruction');
	var $section_intro = $('#section-intro');
	var $section_interface = $('#section-interface');
	var $modal_container = $('#modal_container');
	var $modals = $modal_container.find('.modal-q');
	var $controls_container = $section_interface.find('.controls-container');
	var $sidebar = $('#section-stats');
	var $total_users = $sidebar.find('.total_users');
	var $roster = $sidebar.find('.roster');
	var $roster_template = $roster.find('.template');
	var $timer = $sidebar.find('.timer');
	
	var options = {
		socket : null,
		state : {
			level : 0,
			paused : false
		},
		uid : 'uid-' + Math.floor(Math.random() * 100) + '-' + (new Date()).getTime(),
		level_set : [$section_instructions, $section_intro, $section_interface],
		inactive_default : 60000,//1 minute
		inactive_delay : 1000,//update every second
		inactive_count : 0
	};
	var user = {};
	var inactive_timer = null;
	
	
	// to-do:
	// add yellow hud notification so its less intrusive than the modal(e.g reload)
	
	
	
	var methods = {
		// initiate socket
		init_socket : function () {
			options.socket = io();
			
			options.socket.emit('register', { 'name' : user.name, 'uid' : options.uid })
			
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
				if (data.uid === options.uid) {
					$entry.addClass('self');
				}				
				$roster.append($entry);
				
				//methods.update_count(true);
				methods.poll_users();
			})
			.on('removed', function (data) {
				console.log('event: removed:', data);
				if (!data) {
					console.log('event: removed: no data found');
					return;
				}
				$roster.find('#' + data.uid).remove();
				//methods.update_count(false);
				methods.poll_users();
			})
			.on('announce', function (name) {
				console.log('event: announcement:', name);
			})
			.on('promoted', function () {
				console.log('event: promoted:');
				$section_interface.addClass('on');
				options.inactive_count = options.inactive_default;
				methods.start_timer();
			})
			.on('demoted', function (data) {
				console.log('event: demoted:', data.code);
				$section_interface.removeClass('on');
				methods.stop_timer();
				
				// timeout
				if (data.code === 0) {
					$modal_container.find('.close_btn')
					.one('click', function (e) {
						e.preventDefault();
						location.reload();
					});
					$modal_container.trigger('open', '#modal_dropped');
				}
			});
			
		},
		// update roster of users
		update_roster : function (data) {
		},
		// add user to roster
		user_added : function (data) {
		},
		// remove user from roster
		user_removed : function (data) {
		},
		// promoted/demoted current user
		update_status : function (data) {
		},
		highlight_user : function () {
		},
		// tally users online & render
		update_count : function (val) {
			if (typeof val === 'number') {
				$total_users.text(val);
				return;
			}
			val = val ? 1 : -1;
			
			var total = parseInt($total_users.text(), 10);
				total = isNaN(total) ? 0 : total;
				total = total + val;
				$total_users.text(total);
		},
		update_timer : function () {
			$timer.text(options.inactive_count / 1000);
		},
		// fetch amount of users online
		poll_users : function () {
			$.get('stats', function (data) {
				console.log('poll_users:', data);
				$total_users.text(data.total);
			});
		},
		start_timer : function () {
			methods.stop_timer();
			inactive_timer = setInterval(function () {
				options.inactive_count = options.inactive_count - options.inactive_delay;
				options.inactive_count = options.inactive_count < 0 ? 0 : options.inactive_count;
				methods.update_timer();
			}, options.inactive_delay);
		},
		stop_timer : function () {
			if (inactive_timer !== null) {
				clearInterval(inactive_timer);
			}
		},
		// send a command to server
		send : function (cmd) {
			cmd = $.trim(cmd.toLowerCase());
			options.socket.emit('move', cmd);
			options.inactive_count = options.inactive_default;
			methods.update_timer();
		}
	};
	
	////////////////////////////////
	// events
	////////////////////////////////
	if (!is_mobile) {
		$window.on('scroll', function () {
			console.log($window.scrollTop() >= $carousel.offset().top);
			if ($window.scrollTop() >= $carousel.offset().top) {
				$carousel.removeClass('not-fixed');
			} else {
				$carousel.addClass('not-fixed');
			}
		});			
	}
	
	$window.on('resize', function () {
		var carousel_height = $window.height();
		if (is_mobile) {
			$.each($carousel.find('.carousel_slide'), function () {
				var $slide = $(this);
				var slide_height = $slide.find('.wrapper').height();
				if (slide_height > carousel_height) {
					carousel_height = slide_height;
				}
			});
		}
		$carousel.find('.carousel_wrapper').height(carousel_height);
		
		
		// center section text
		var $target = $section_intro.find('.wrapper');
		if ($target.length) {
			$target.css('margin-top', -1 * ($target.height() / 2));
		}
		
		$modal_container.trigger('center.modalq');
	}).trigger('resize');
	
	// setup modal
	$modal_container
	.on('center.modalq', function (e, target, callback) {
		if (debug) console.log('modal: center');
		
		// center modal text
		var $target = $modals.filter('.active');
		if (!$target.length) {
			if (debug) console.log('modal: center: target not found');
			return;
		}
		$modal_container.css({ 'display' : 'block', 'opacity' : 0 });
		$target.css({
			'top' : ($window.height() - $target.height()) / 2,
			'left' : ($window.width() - $target.width()) / 2
		});
		$modal_container.css({ 'display' : '', 'opacity' : 1 });
	})
	.on('open.modalq', function (e, target, callback) {
		if (debug) console.log('modal: open');
		
		if (!target) {
			if (debug) console.log('modal: open: invalid target');
			return;
		}
		if ($modal_container.hasClass('transition')) {
			if (debug) console.log('modal: open: not available');
			return;
		}
		
		var $target = typeof target === 'string' ? $(target) : target;
		if (!$target.length) {
			if (debug) console.log('modal: open: target not found');
			return;
		}
		$target.addClass('active').siblings().removeClass('active');
		$modal_container.addClass('transition');
		$modal_container.trigger('will_open');
		$modal_container.fadeIn(800, function () {
			$modal_container.removeClass('transition');
			$modal_container.trigger('did_open');
			if (typeof callback === 'function') callback();
		});
	})
	.on('close.modalq', function (callback) {
		if (debug) console.log('modal: close');
		
		if ($modal_container.hasClass('transition')) {
			if (debug) console.log('modal: close: not available');
			return;
		}
		
		var $target = $modals.filter('.active');
		if (!$target.length) {
			if (debug) console.log('modal: close: target not found');
			return;
		}
		
		$modal_container.addClass('transition');
		$modal_container.trigger('will_close');
		$modal_container.fadeOut(800, function () {
			$modal_container.removeClass('transition');
			$target.removeClass('active');
			$modal_container.trigger('did_close');
			if (typeof callback === 'function') callback();
		});
		
	})
	.on('will_open.modalq', function () {
		if (debug) console.log('modal: will open');
		$modal_container.trigger('center.modalq');
	});
	
	$modal_container.find('.close_btn')
	.on('click', function (e) {
		e.preventDefault();
		$modal_container.trigger('close');
	});
	
	// configure carousel animations
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
			options.level_set[options.state.level].trigger('section_load');
		}
	});
	////////////////////////////////
	
	
	////////////////////////////////
	// Sections
	////////////////////////////////
	
	// section - instructions
	$section_instructions.on('section_load', function () {
		console.log('section_load: instructions');
		
		if (options.state.level !== 0) {
			console.log('section-instruction: not valid state');
			return;
		}
		
		$section_instructions.find('.next-btn')
		.one('click', function (e) {
			console.log('section-instruction: next');
			options.state.level++;
			$carousel.simpleCarousel('next');
		});
	});
	
	// section - register
	$section_intro.on('section_load', function () {
		console.log('section_load: intro');
		
		if (options.state.level !== 1) {
			console.log('section-intro: not valid state');
			return;
		}
		
		$section_intro.find('form')
		.on('submit', function (e) {
			e.preventDefault();
			
			if (options.state.level !== 1) {
				console.log('section-intro: not valid state');
				return;
			}
			
			var name = $('#userName').val();
				name = $.trim(name).toLowerCase();
			if (!name) {
				alert('Please type a name');
				return;
			}
			
			options.state.level++;
			user.name = name;
			$section_intro.addClass('disabled');
			
			$carousel.simpleCarousel('next');
			
			methods.init_socket();
		});
	});
	// section - interface
	$section_interface.on('section_load', function () {
		console.log('section_load: interface');
		
		if (options.state.level !== 2) {
			console.log('section-interface: not valid state');
			return;
		}
		
		$controls_container.find('button')
		.on('click', function () {
			if (options.state.level !== 2) {
				console.log('section-interface: not valid state');
				return;
			}
		
			var $this = $(this);
			
			if (!options.socket) {
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
	////////////////////////////////
	
	FastClick.attach(document.body);
	 
	// init carousel
	$carousel.simpleCarousel({ dot_pagination : false, speed : 0.5 });
	// initial poll for online users
	methods.poll_users();
	// kickoff first section
	options.level_set[options.state.level].trigger('section_load');
	
});
