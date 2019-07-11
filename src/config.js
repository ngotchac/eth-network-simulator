const path = require("path");

const { mkdir } = require("./utils");

// const PARITY_BIN_PATH = path.resolve(__dirname, "../../OG-parity-ethereum/target/release/parity");
const PARITY_BIN_PATH = path.resolve(__dirname, "../../parity-ethereum/target/release/parity");
// const PARITY_BIN_PATH = path.resolve(__dirname, "../../poa-parity");

const BASE_SPEC_PATH = path.resolve(__dirname, "../assets/spec.json");
const CONFIG_PATH = path.resolve(__dirname, "../assets/config.toml");
const PASSWORDS_PATH = path.resolve(__dirname, "../assets/node.pwds");

const DATA_DIR = path.resolve(__dirname, "../tmp-data");

const SPEC_PATH = path.join(DATA_DIR, "spec.json");
const ACCOUNTS_PATH = path.join(DATA_DIR, "accounts.json");
const LOGS_DIR = path.join(DATA_DIR, "logs");

const CONFIG = {
	paths: {
		PARITY_BIN_PATH,
		CONFIG_PATH,
		BASE_SPEC_PATH,
		PASSWORDS_PATH,

		DATA_DIR,
		LOGS_DIR,
		SPEC_PATH,
		ACCOUNTS_PATH,
	},
};

mkdir(DATA_DIR);
mkdir(LOGS_DIR);

module.exports = CONFIG;
