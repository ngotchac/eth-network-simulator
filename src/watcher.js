const request = require("./request");

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
			const lines_to_print = all_lines.reduce((acc, lines) => [].concat(acc, lines, ""), []);

			// Clear the terminal
			process.stdout.write("\033c");
			process.stdout.write(`Running ${nodes.length} nodes:\n\n`);

			for (const line of lines_to_print) {
				process.stdout.write(`${line}\n`);
			}
		} catch (err) {
			console.error(err);
		}
		running = false;
	}, 1500);
}

module.exports = {
	run: watch,
};
