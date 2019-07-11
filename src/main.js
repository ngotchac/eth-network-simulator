const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const CONFIG = require("./config");

const eth = require("./eth");
const request = require("./request");
const watcher = require("./watcher");
const worker = require("./worker");

const { mkdir, rimraf, sleep } = require("./utils");

const make_spec = require("./setups/posdao/make-spec");

const {
	PARITY_BIN_PATH,
	CONFIG_PATH,
	DATA_DIR,
	LOGS_DIR,
	PASSWORDS_PATH,

	BASE_SPEC_PATH,
	SPEC_PATH,
	ACCOUNTS_PATH,
} = CONFIG.paths;

// Global vars
const timers = {
	watcher_id: -1,
	worker_id: -1,
	chaos_monkey_id: -1,
};
const running_processes = [];

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
		"-l", "blockchain,client,engine,sync=trace",
	];

	const parity_proc = spawn(PARITY_BIN_PATH, params);
	let is_running = true;
	let stdout = "";
	let stderr =  "";

	running_processes.push({
		process: parity_proc,
		is_running: () => is_running,
		stdout: () => stdout,
		stderr: () => stderr,
	});

	console.log(`Spawned node ${index} with PID ${parity_proc.pid}`);

	parity_proc.stdout.on('data', (data) => {
		stdout += data.toString();
	});

	parity_proc.stderr.on('data', (data) => {
		stderr += data.toString();
	});

	parity_proc.on('close', (code) => {
		console.log(`Node ${index} exited with code ${code}.`);
		if (code !== 0) {
			console.log(`stdout:\n${stdout}`);
			console.log(`stderr:\n${stderr}`);
		}
		is_running = false;
	});

	const enode = await eth.fetch_enode(rpc_port);
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

async function run_nodes (accounts, num_nodes) {
	const promises = [];
	for (let i = 0; i < num_nodes; i += 1) {
		promises.push(run_node(i, accounts[i]));
	}

	const nodes = await Promise.all(promises);
	return nodes;
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

async function create_accounts (num_nodes) {
	const promises = [];
	for (let i = 0; i < num_nodes; i += 1) {
		promises.push(create_account(i));
	}
	const accounts = await Promise.all(promises);
	return accounts;
}

async function chaos_monkey (nodes, time_pattern = [], are_connected = true) {
	if (time_pattern.length > 0) {
		// const split_at = Math.floor(nodes.length / 2);
		const split_at = 1 + Math.floor((nodes.length - 1) / 4) * 2;
		const nodes_a = nodes.slice(1, split_at);
		const nodes_b = nodes.slice(split_at);

		timers.chaos_monkey_id = setTimeout(async () => {
			process.stdout.write((are_connected ? "Disconnecting" : "Connecting") + " all peers!    \r");
			try {
				{
					const promises = [];
					if (are_connected) {
						for (const node_a of nodes_a) {
							for (const node_b of nodes_b) {
								promises.push(eth.remove_peer(node_a.rpc_port, node_b.enode));
								promises.push(eth.remove_peer(node_b.rpc_port, node_a.enode));
							}
						}
						// Disconnect all from first peer
						for (const node of nodes.slice(1)) {
							promises.push(eth.remove_peer(nodes[0].rpc_port, node.enode));
							promises.push(eth.remove_peer(node.rpc_port, nodes[0].enode));
						}
					} else {
						for (const node_a of nodes_a) {
							for (const node_b of nodes_b) {
								promises.push(eth.add_peer(node_a.rpc_port, node_b.enode));
								promises.push(eth.add_peer(node_b.rpc_port, node_a.enode));
							}
						}
						// Connect all to first peer
						for (const node of nodes.slice(1)) {
							promises.push(eth.add_peer(nodes[0].rpc_port, node.enode));
							promises.push(eth.add_peer(node.rpc_port, nodes[0].enode));
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

			chaos_monkey(nodes, time_pattern.slice(1), !are_connected);
		}, time_pattern[0] * 1000);
	}
}

async function terminate () {
	process.stdout.write("\n\n");
	console.log("Stopping processes...");

	clearInterval(timers.watcher_id);
	clearInterval(timers.worker_id);
	clearTimeout(timers.chaos_monkey_id);

	for (const running_process of running_processes) {
		running_process.process.kill("SIGINT");
	}

	console.log("Waiting for processes to exit...");
	// Don't wait for more than 5 seconds
	const max_wait = 5 * 1000;
	const start_wait = Date.now();
	while (running_processes.find((p) => p.is_running()) && (Date.now() - start_wait) < max_wait) {
		await sleep(250);
	}

	for (const running_process of running_processes.filter((n) => !n.is_running())) {
		running_process.process.kill("SIGKILL");
		await sleep(150);
	}
	console.log("All processes exited!");
}

async function main () {
	const NUM_VALIDATORS = 5;
	const NUM_NODES = 1 + 2*NUM_VALIDATORS;

	console.log(`**** Starting ${NUM_NODES} nodes...`);

	rimraf(DATA_DIR);
	mkdir(DATA_DIR);
	mkdir(LOGS_DIR);

	console.log("**** Creating accounts...");
	const accounts = await create_accounts(NUM_NODES);

	{
		const owner = accounts[0];
		const validators = [];
		const stakers = [];

		for (let idx = 1; idx < accounts.length; idx += 2) {
			validators.push(accounts[idx]);
			stakers.push(accounts[idx + 1]);
		}

		const spec = await make_spec({
			validators,
			stakers,
			owner,
		});

		fs.writeFileSync(SPEC_PATH, JSON.stringify(spec, null, 4));
		{
			const accounts = { owner, validators, stakers };
			fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify(accounts, null, 4));
		}
		console.log(`Wrote spec file to ${SPEC_PATH}`);
	}

	console.log("**** Starting the nodes...");
	const nodes = await run_nodes(accounts, NUM_NODES);

	// Printing enodes
	nodes.forEach((node, i) => console.log(`\t[#${i}]`, node.enode));
	process.stdout.write("\n");


	console.log("**** Connecting the nodes...");
	const add_peers_promises = [];
	for (let i = 0; i < NUM_NODES; i += 1) {
		for (let j = 0; j < NUM_NODES; j += 1) {
			if (i !== j) {
				add_peers_promises.push(eth.add_peer(nodes[i].rpc_port, nodes[j].enode));
			}
		}
	}
	await Promise.all(add_peers_promises);

	timers.watcher_id = watcher.run(nodes);
	timers.worker_id = worker.run(nodes);

	chaos_monkey(nodes, [ 30, 90, 30, 60, 30, 60, 30, 60, 30, 60, 30, 60 ]);
}

function exit_handler() {
	terminate()
		.then(() => {
			console.log("Done!");
			process.exit(0);
		})
		.catch((error) => {
			console.error(error);
			process.exit(1);
		});
}

process.on("SIGINT", () => {
	exit_handler();
});
// process.on("SIGTERM", () => {
// 	exit_handler();
// });

main()
	.catch((e) => {
		console.error(e);
		terminate();
		process.exit(1);
	});
