var HID = require('./node-hid/');
var devices = HID.devices();
var options = {
	vendorId : '8483',
	productId : '4112',
	usbPath : ''
};
var targetFound = false;

if (devices && devices.length) {	
	for (var i = 0; i < devices.length; i++) {
		if (devices[i].vendorId == options.vendorId && devices[i].productId == options.productId) {
			targetFound = true;
			options.usbPath = devices[i].path;
		}
	}
}
module.exports = (targetFound) ? options.usbPath : targetFound;