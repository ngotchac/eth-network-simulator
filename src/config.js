const path = require("path");

const { mkdir } = require("./utils");

const PARITY_BIN_PATH = path.resolve(__dirname, "../../OG-parity-ethereum/target/release/parity");
const CONTRACTS_BASE_PATH = path.resolve(__dirname, "../../posdao-test-setup/posdao-contracts/build/contracts");
const TOKEN_CONTRACT_PATH = path.resolve(__dirname, "../../posdao-test-setup/contracts/ERC677BridgeTokenRewardableMock.sol");

const CONFIG_PATH = path.resolve(__dirname, "./config.toml");
const PASSWORDS_PATH = path.resolve(__dirname, "./node.pwds");
const BASE_SPEC_PATH = path.resolve(__dirname, "./spec-OG.json");


const DATA_DIR = path.resolve(__dirname, "../tmp-data");
const SPEC_PATH = path.join(DATA_DIR, "spec.json");
const ACCOUNTS_PATH = path.join(DATA_DIR, "accounts.json");
const LOGS_DIR = path.join(DATA_DIR, "logs");

const VALIDATOR_SET_CONTRACT = "0x1000000000000000000000000000000000000001";
const BLOCK_REWARD_CONTRACT = "0x2000000000000000000000000000000000000001";
const RANDOM_CONTRACT = "0x3000000000000000000000000000000000000001";
const STAKING_CONTRACT = "0x1100000000000000000000000000000000000001";
const PERMISSION_CONTRACT = "0x4000000000000000000000000000000000000001";
const CERTIFIER_CONTRACT = "0x5000000000000000000000000000000000000001";

const REGISTRY_CONTRACT = "0x7000000000000000000000000000000000000001";
const INIT_AURA_CONTRACT = "0x8000000000000000000000000000000000000001";

const CONFIG = {
	contracts: {
		VALIDATOR_SET_CONTRACT,
		BLOCK_REWARD_CONTRACT,
		RANDOM_CONTRACT,
		STAKING_CONTRACT,
		PERMISSION_CONTRACT,
		CERTIFIER_CONTRACT,
		REGISTRY_CONTRACT,
		INIT_AURA_CONTRACT,
	},
	paths: {
		PARITY_BIN_PATH,
		CONFIG_PATH,
		BASE_SPEC_PATH,
		CONTRACTS_BASE_PATH,
		TOKEN_CONTRACT_PATH,
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
