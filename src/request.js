const http = require("http");

const REQUEST_TIMEOUT = 5000;

let req_id = 1;
async function request (method, params, port, retry = 3) {
	return new Promise((resolve, reject) => {
		let resolved = false;

		const timeout_id = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				if (retry > 0) {
					console.warn(`Request ${method} to ${port} timed-out. Retrying...`);
					request(method, params, port, retry - 1)
						.then(resolve)
						.catch(reject);
				} else {
					reject(new Error(`Request ${method} to ${port} timed-out.`));
				}
			}
		}, REQUEST_TIMEOUT);

		send_request(method, params, port)
			.then((result) => {
				clearTimeout(timeout_id);
				if (!resolved) {
					resolved = true;
					resolve(result);
				}
			})
			.catch((error) => {
				clearTimeout(timeout_id);
				if (!resolved) {
					resolved = true;
					reject(error);
				}
			});
	});
}

async function send_request (method, params, port) {
	const data = {
		method: method,
		params: params,
		id: req_id,
		jsonrpc: "2.0",
	};
	const options = {
		host: "localhost",
		port: port,
		path: "/",
		method: "POST",
		headers: {
		  "Content-Type": "application/json",
		},
	};

	return new Promise((resolve, reject) => {
		let output = '';

		const req = http.request(options, (res) => {
			res.setEncoding("utf8");

			res.on("data", (chunk) => {
				output += chunk;
			});

			res.on("end", () => {
				const obj = JSON.parse(output);
				resolve(obj);
			});
		});

		req.on("error", (err) => {
			reject(err);
		});

		req.write(JSON.stringify(data));
		req.end();

		req_id += 1;
	});
}

module.exports = request;
