var usb = require('usb');
var devices = usb.getDeviceList();
var options = {
	vendor_id : '8483',
	product_id : '4112'
};
var launcher = null;


launcher = usb.findByIds(options.vendor_id, options.product_id);
if (!launcher) {
	console.log('launcher failed to init');
	return;
}
console.log(launcher);