var HID = require('./node-hid/');
var devices = HID.devices();
var options = {
	vendor_id : '8483',
	product_id : '4112',
	usb_path : ''
};
var usb_target_found = false;

if (devices && devices.length) {	
	for (var i = 0; i < devices.length; i++) {
		if (devices[i].vendorId == options.vendor_id && devices[i].productId == options.product_id) {
			usb_target_found = true;
			options.usb_path = devices[i].path;
		}
	}
}
module.exports = (usb_target_found) ? options.usb_path : usb_target_found;