var HID = require('./node-hid/');
var devices = HID.devices();

var byte_list = function (length) {
	var list = [];
	for (var i = 0; i < length; i++) {
		list.push(0);//0x00
	}
	return list;
};
var launcher = new HID.HID('USB_2123_1010_fd131200');

launcher
.on('data', function(data) {
	console.log('event: reading: ', data);
})
.on('error', function(err) {
	console.log('event: error: ', err);
});

launcher.read(function (err, data) {
	console.log('read:', err, data);
});

var commands = {
	on : byte_list(9),
	off : byte_list(9),
	left : byte_list(10),
	stop : byte_list(10)
};
// on
commands.on[1] = 3;
commands.on[2] = 1;
// off
commands.off[1] = 3;
// left
commands.left[1] = 2;
commands.left[2] = 4;
// stop
commands.stop[1] = 2;
commands.stop[2] = 0x20;

launcher.write(commands.on);
launcher.write(commands.left);
setTimeout(function () {
	console.log('time up');
	launcher.write(commands.stop);
	launcher.write(commands.off);
}, 5000);

//console.log(launcher);
//launcher.close();

/*
this.LED_ON = new byte[9];
this.LED_ON[1] = 3;
this.LED_ON[2] = 1;

this.LED_OFF = new byte[9];
this.LED_OFF[1] = 3;
*/
//device.write([0x00, 0x01, 0x01, 0x05, 0xff, 0xff]);

//launcher.close();
//console.log(devices);