const http = require("http");

let req_id = 1;
async function request (method, params, port) {
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
