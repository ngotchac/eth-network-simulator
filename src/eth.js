const request = require("./request");
const { sleep } = require("./utils");

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
		if (data.result) {
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

module.exports = {
	add_peer,
	remove_peer,
	fetch_enode,
};
