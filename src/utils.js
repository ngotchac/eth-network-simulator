const path = require("path");
const fs = require("fs");

function rimraf (root_path) {
	try {
		const stats = fs.statSync(root_path);
		if (stats.isDirectory()) {
			fs.readdirSync(root_path).forEach((filename) => {
				const sub_path = path.join(root_path, filename);
				rimraf(sub_path);
			});
			fs.rmdirSync(root_path);
		} else {
			fs.unlinkSync(root_path);
		}
	} catch (_e) {
	}
}

/// Create a directory at the given path, if it doesn't already exists
function mkdir (dir_path) {
	try {
		const stats = fs.statSync(dir_path);
		if (stats.isDirectory()) {
			return;
		} else {
			fs.unlinkSync(dir_path);
		}
	} catch (_e) {
	}
	fs.mkdirSync(dir_path);
}

async function sleep (duration) {
	return new Promise((resolve) => {
		setTimeout(resolve, duration);
	});
}

module.exports = {
	mkdir,
	rimraf,
	sleep,
};
