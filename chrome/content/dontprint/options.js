function updateDeviceClass() {
	var newclass = document.getElementById('deviceClass_control').value;
	var screensize_controls = document.getElementById('screensize_controls');
	var kindleEmail_control = document.getElementById('kindleEmail_control');
	var otherEmail_control = document.getElementById('otherEmail_control');
	
	if (newclass === "kindle") {
		screensize_controls.hidden = true;
		otherEmail_control.hidden = true;
		kindleEmail_control.hidden = false;
	} else {
		screensize_controls.hidden = false;
		otherEmail_control.hidden = false;
		kindleEmail_control.hidden = true;
	}
	
	sizeToContent();
}

function onSendEmailClicked() {
	var value = document.getElementById('sendEmail_control').checked;
	document.getElementById('recipientEmailPrefix_control').disabled = !value;
	document.getElementById('recipientEmailSuffix_control').disabled = !value;
	document.getElementById('otherEmail_control').disabled = !value;
}

function onPlaceInFolderClicked() {
	var value = document.getElementById('placeInFolder_control').checked;
//	document.getElementById('outputdirectory_control').disabled = !value;
}


updateDeviceClass();
onSendEmailClicked();
onPlaceInFolderClicked();
