const request = require("./request");

async function send_tx (running_nodes) {
	const from_idx = Math.floor(Math.random() * running_nodes.length);
	const to_idx = Math.floor(Math.random() * running_nodes.length);

	const params = {
		from: running_nodes[from_idx].validator,
		to: running_nodes[to_idx].validator,
		value: "0x01",
	};
	const data = await request("personal_sendTransaction", [ params, "" ], running_nodes[from_idx].rpc_port);
	const _tx = data.result;
}

function work(nodes) {
	return setInterval(async () => {
		try {
			const promises = [];
			for (let i = 0; i < 208; i += 1) {
				promises.push(send_tx(nodes));
			}
			await Promise.all(promises);
		} catch (error) {
			console.error("Error:", error);
		}
	}, 10000);
}

module.exports = {
	run: work,
};
