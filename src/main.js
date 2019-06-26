const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const CONFIG = require("./config");

const make_spec = require("./make-spec");
const request = require("./request");
const { mkdir, rimraf, sleep } = require("./utils");

const {
	PARITY_BIN_PATH,
	CONFIG_PATH,
	DATA_DIR,
	LOGS_DIR,
	PASSWORDS_PATH,

	BASE_SPEC_PATH,
	SPEC_PATH,
} = CONFIG.paths;

async function add_peer (rpc_port, enode) {
	const params = [ enode ];
	return request("parity_addReservedPeer", params, rpc_port);
}

async function remove_peer (rpc_port, enode) {
	const params = [ enode ];
	return request("parity_removeReservedPeer", params, rpc_port);
}

async function fetch_enode (port) {
	try {
		const data = await request("parity_enode", [], port);
		if (!data.result) {
			// console.warn("Invalid data for enode:", data);
		} else {
			return data.result;
		}
	} catch (error) {
		if (error.code !== "ECONNREFUSED") {
			throw error;
		}
	}
	await sleep(750);
	return fetch_enode(port);
}

async function run_node (index, validator) {
	const data_dir = path.join(DATA_DIR, `node-${index}`);
	const logs_path = path.join(LOGS_DIR, `node-${index}`);
	const eth_port = 30300 + index;
	const rpc_port = 8540 + index;
	const params = [
		"--reserved-only",
		"-d", data_dir,
		"--config", CONFIG_PATH,
		"--chain", SPEC_PATH,
		"--port", eth_port,
		"--jsonrpc-port", rpc_port,
		"--engine-signer", validator,
		"--log-file", logs_path,
		"--unlock", validator,
		"--password", PASSWORDS_PATH,
		// "-l", "network=trace",
	];

	// console.log(`Running: parity ${params.join(" ")}`);
	const parity_proc = spawn(PARITY_BIN_PATH, params);
	let is_running = true;

	console.log(`Spawned node ${index} with PID ${parity_proc.pid}`);

	parity_proc.stdout.on('data', (data) => {
		// console.log(`[#${index}] ${data}`);
	});

	parity_proc.stderr.on('data', (data) => {
		// console.log(`[#${index}] ${data}`);
	});

	parity_proc.on('close', (code) => {
		console.log(`Node ${index} exited with code ${code}.`);
		is_running = false;
	});

	const enode = await fetch_enode(rpc_port);
	await request("parity_dropNonReservedPeers", [], rpc_port);

	return {
		process: parity_proc,
		enode,
		rpc_port,
		validator,
		index,
		is_running: () => is_running,
	};
}

async function create_account (index) {
	const data_dir = path.join(DATA_DIR, `node-${index}`);
	const params = [
		"account", "new",
		"-d", data_dir,
		"--config", CONFIG_PATH,
		"--chain", BASE_SPEC_PATH,
		"--password", PASSWORDS_PATH,
	];

	return new Promise((resolve, reject) => {
		let output = "";
		const proc = spawn(PARITY_BIN_PATH, params, {
			stdio: ["ignore", "pipe", "pipe"],
		});

		proc.stdout.on('data', (data) => {
			output += data;
		});

		proc.stderr.on('data', (data) => {
			output += data;
		});

		proc.on('close', (code) => {
			if (code !== 0) {
				const err = output.split("\n").map((l) => `\t${l}`).join("\n");
				return reject(new Error(`Failed to create new account:\n${err}`));
			}

			const lines = output.split("\n")
				.map((l) => l.trim());

			const address = lines.find((l) => /0x[0-9a-f]+/i.test(l));
			if (!address) {
				return reject(new Error("Could not find address in output."));
			}

			resolve(address);
		});
	});
}

async function send_tx (running_nodes) {
	const from_idx = Math.floor(Math.random() * running_nodes.length);
	const to_idx = Math.floor(Math.random() * running_nodes.length);

	const params = {
		from: running_nodes[from_idx].validator,
		to: running_nodes[to_idx].validator,
		value: "0x01",
		// data: "0x" + "1".repeat(200),
	};
	const data = await request("personal_sendTransaction", [ params, "" ], running_nodes[from_idx].rpc_port);
	const _tx = data.result;
	// console.log("Sent transaction", tx);
}

async function fmt_node_data (node) {
	const cols = process.stdout.columns;
	const { index, rpc_port } = node;

	const data = await request("eth_getBlockByNumber", [ "latest", false ], rpc_port);
	const block = data.result;
	const data_txs = await request("parity_allTransactions", [], rpc_port);
	const txs = data_txs.result;
	const peer_count_raw = (await request("net_peerCount", [], rpc_port)).result;
	const peer_count = parseInt(peer_count_raw, 16);
	const { gasUsed, gasLimit, size } = block;
	const gas_perc = Math.round(parseInt(gasUsed, 16) / parseInt(gasLimit, 16) * 100 * 10) / 10;
	const block_size = Math.round(parseInt(size, 16) / 1024 * 100) / 100;

	const output = [
		`BN=${parseInt(block.number, 16)} // BH=${block.hash.slice(0, 8)}...`,
		`USAGE=${gas_perc}% // SIZE=${block_size}KB`,
		`TXs=${txs.length} // PEERS=${peer_count}`
	].join("\n");
	const lines = output
		.split("\n")
		.map((line) => line.match(new RegExp('.{1,' + (cols - 7) + '}', 'g')))
		.reduce((cur, lines) => [].concat(cur, lines), [])
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line, i) => {
			if (i === 0) {
				return `[#${index}] ${line}`;
			} else {
				return `     ${line}`;
			}
		});
	return lines;
}

function watch (nodes) {
	let total_lines = 0;
	let running = false;
	return setInterval(async () => {
		if (running) {
			return;
		}
		running = true;
		try {
			const promises = [];
			for (const node of nodes) {
				promises.push(fmt_node_data(node));
			}
			const all_lines = await Promise.all(promises);
			// Flatten
			const lines_to_print = all_lines.reduce((acc, lines) => [].concat(acc, lines), []);

			// Clear all lines
			process.stdout.moveCursor(0, -1 * total_lines);
			for (let i = 0; i < total_lines; i += 1) {
				process.stdout.clearLine();
				process.stdout.moveCursor(0, 1);
			}
			// Place the cursor at the start
			process.stdout.moveCursor(0, -1 * total_lines);
			total_lines = 0;

			for (const line of lines_to_print) {
				process.stdout.write(`${line}\n`);
				total_lines += 1;
			}
		} catch (err) {
			console.error(err);
		}
		running = false;
	}, 1500);
}

function work(nodes) {
	return setInterval(async () => {
		try {
			const promises = [];
			// for (let i = 0; i < 20; i += 1) {
			for (let i = 0; i < 208; i += 1) {
			// for (let i = 0; i < nodes.length * 25; i += 1) {
				promises.push(send_tx(nodes));
			}
			await Promise.all(promises);
		} catch (error) {
			console.error("Error:", error);
		}
	}, 10000);
}

async function chaos_monkey (nodes) {
	let are_connected = true;

	// const split_at = Math.floor(nodes.length / 2);
	const split_at = 1 + Math.floor((nodes.length - 1) / 4) * 2;
	const nodes_a = nodes.slice(1, split_at);
	const nodes_b = nodes.slice(split_at);

	return setInterval(async () => {
		process.stdout.write((are_connected ? "Disconnecting" : "Connecting") + " all peers!    \r");
		try {
			{
				const promises = [];
				if (are_connected) {
					for (const node_a of nodes_a) {
						for (const node_b of nodes_b) {
							promises.push(remove_peer(node_a.rpc_port, node_b.enode));
							promises.push(remove_peer(node_b.rpc_port, node_a.enode));
						}
					}
					// Disconnect all from first peer
					for (const node of nodes.slice(1)) {
						promises.push(remove_peer(nodes[0].rpc_port, node.enode));
						promises.push(remove_peer(node.rpc_port, nodes[0].enode));
					}
				} else {
					for (const node_a of nodes_a) {
						for (const node_b of nodes_b) {
							promises.push(add_peer(node_a.rpc_port, node_b.enode));
							promises.push(add_peer(node_b.rpc_port, node_a.enode));
						}
					}
					// Connect all to first peer
					for (const node of nodes.slice(1)) {
						promises.push(add_peer(nodes[0].rpc_port, node.enode));
						promises.push(add_peer(node.rpc_port, nodes[0].enode));
					}
				}
				await Promise.all(promises);
				await sleep(250);
			}
			// To trigger disconnections, you must switch connection mode
			{
				const promises = [];
				for (const node of nodes) {
					promises.push(request("parity_acceptNonReservedPeers", [], node.rpc_port));
				}
				await Promise.all(promises);
			}
			{
				const promises = [];
				for (const node of nodes) {
					promises.push(request("parity_dropNonReservedPeers", [], node.rpc_port));
				}
				await Promise.all(promises);
			}
		} catch (error) {
			console.error("Error:", error);
		}
		// Toggle connection, even if there are errors
		are_connected = !are_connected;
	}, 60 * 1000);
}

function copy_keys (node_idx, nodes_len) {
	const to_folder_path = path.join(DATA_DIR, `node-${node_idx}/keys/DemoPoA`);

	for (let i = 0; i < nodes_len; i += 1) {
		if (i === node_idx) {
			continue;
		}
		const from_folder_path = path.join(DATA_DIR, `node-${i}/keys/DemoPoA`);
		// Copy every files in `from_...` to `to_...`
		fs.readdirSync(from_folder_path).forEach((filename) => {
			const filepath = path.join(from_folder_path, filename);
			const dest_filepath = path.join(to_folder_path, filename);
			fs.copyFileSync(filepath, dest_filepath);
		});
	}
}

async function main () {
	const NUM_VALIDATORS = 5;
	const NUM_NODES = 1 + 2*NUM_VALIDATORS;

	rimraf(DATA_DIR);
	mkdir(DATA_DIR);
	mkdir(LOGS_DIR);

	const v_promises = [];
	for (let i = 0; i < NUM_NODES; i += 1) {
		v_promises.push(create_account(i));
	}
	const accounts = await Promise.all(v_promises);
	for (let i = 0; i < NUM_NODES; i += 1) {
		// copy_keys(i, NUM_NODES);
	}

	{
		const owner = accounts[0];
		const validators = [];
		const stakers = [];

		for (let idx = 1; idx < accounts.length; idx += 2) {
			validators.push(accounts[idx]);
			stakers.push(accounts[idx + 1]);
		}

		await make_spec({
			validators,
			stakers,
			owner,
		});
	}

	const n_promises = [];
	for (let i = 0; i < NUM_NODES; i += 1) {
		n_promises.push(run_node(i, accounts[i]));
	}
	const nodes = await Promise.all(n_promises);

	let watcher_id = -1;
	let worker_id = -1;
	let chaos_monkey_id = -1;

	process.on("SIGINT", () => {
		async function terminate () {
			process.stdout.write("\n\n");
			console.log("Stopping processes...");

			clearInterval(watcher_id);
			clearInterval(worker_id);
			clearInterval(chaos_monkey_id);

			for (const node of nodes) {
				node.process.kill("SIGINT");
			}

			console.log("Waiting for processes to exit...");
			// Don't wait for more than 5 seconds
			const max_wait = 5000;
			const start_wait = Date.now();
			while (nodes.find((n) => n.is_running()) && (Date.now() - start_wait) < max_wait) {
				await sleep(250);
			}

			for (const node of nodes.filter((n) => !n.is_running())) {
				node.process.kill("SIGKILL");
			}

			console.log("Done!");
			process.exit(0);
		}

		terminate().catch((error) => {
			console.error(error);
			process.exit(1);
		});
	});

	// Printing enodes
	nodes.forEach((node, i) => console.log(`[#${i}]`, node.enode));
	process.stdout.write("\n");

	const ap_promises = [];
	for (let i = 0; i < NUM_NODES; i += 1) {
		for (let j = 0; j < NUM_NODES; j += 1) {
			if (i !== j) {
				ap_promises.push(add_peer(nodes[i].rpc_port, nodes[j].enode));
			}
		}
	}
	await Promise.all(ap_promises);

	watcher_id = watch(nodes);
	worker_id = work(nodes);
	chaos_monkey_id = chaos_monkey(nodes);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
