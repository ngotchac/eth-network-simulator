const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const solc = require("solc");

function hash (value) {
	const hash_c = crypto.createHash("sha256");
	hash_c.update(JSON.stringify(value));
	return hash_c.digest('hex');
}

function find_file (filename, root_path) {
	for (const sub_filename of fs.readdirSync(root_path)) {
		const sub_filepath = path.join(root_path, sub_filename);

		if (fs.statSync(sub_filepath).isDirectory()) {
			const sub_dir_result = find_file(filename, sub_filepath);
			if (sub_dir_result) {
				return sub_dir_result;
			}
		} else {
			if (sub_filename === filename) {
				return sub_filepath;
			}
		}
	}
}

function compile_contract (base_path, contract_path, contract_name) {
	const { BUILDS_DIR } = require("./config").paths;

	console.log(`Compiling ${contract_name}...`);

	const build_filename = hash([ contract_path, contract_name ]) + ".json";
	const build_filepath = path.join(BUILDS_DIR, build_filename);

	try {
		const build_contract = fs.readFileSync(build_filepath).toString();
		return JSON.parse(build_contract);
	} catch (_e) {
		// console.error(_e);
	}

	const filename = `${contract_name}.sol`;
    const input = {
        language: "Solidity",
        sources: {
            [filename]: {
                content: fs.readFileSync(contract_path).toString(),
            },
        },
        settings: {
            outputSelection: {
                '*': {
                    '*': ['*'],
                },
            },
        },
	};

	function find_imports (i_path) {
		const i_filename = i_path.split("/").pop();
		const i_filepath = find_file(i_filename, base_path);

		if (i_filepath) {
			return { contents: fs.readFileSync(i_filepath).toString() };
		}
		return { error: "File not found" };
	}

	const solc_result = JSON.parse(solc.compile(JSON.stringify(input), find_imports));
	if (solc_result.errors) {
		let has_error = false;
		for (const error of solc_result.errors) {
			if (error.severity === "error") {
				has_error = true;
			}
			console.error(error.formattedMessage);
		}
		// It could be only warnings
		if (has_error) {
			throw new Error(`Failed to compile ${filename}`);
		}
	}
	const contract = solc_result.contracts[filename][contract_name];
	const compiled_contract = {
		abi: contract.abi,
		bytecode: contract.evm.bytecode.object,
	};

	fs.writeFileSync(build_filepath, JSON.stringify(compiled_contract));
	return compiled_contract;
}

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
	compile_contract,
	find_file,
	mkdir,
	rimraf,
	sleep,
};
