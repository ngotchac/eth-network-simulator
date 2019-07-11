const path = require("path");
const fs = require("fs");

const solc = require("solc");

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
	console.log(`Compiling ${contract_name}...`);
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
		for (const error of solc_result.errors) {
			console.error(error.formattedMessage);
		}
		throw new Error(`Failed to compile ${filename}`);
	}
	const contract = solc_result.contracts[filename][contract_name];

	return {
		abi: contract.abi,
		bytecode: contract.evm.bytecode.object,
	};
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
