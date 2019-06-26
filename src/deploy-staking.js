const fs = require("fs");
const path = require("path");

const solc = require("solc");
const Web3 = require("web3");

const request = require("./request");
const { sleep } = require("./utils");

const CONFIG = require("./config");
const RPC_PORT = "8540";

const {
	ACCOUNTS_PATH,
	TOKEN_CONTRACT_PATH,
	CONTRACTS_BASE_PATH,
} = CONFIG.paths;

const {
	BLOCK_REWARD_CONTRACT,
	STAKING_CONTRACT,
} = CONFIG.contracts;

function compile_token_contract() {
    const input = {
        language: "Solidity",
        sources: {
            "Token.sol": {
                content: fs.readFileSync(TOKEN_CONTRACT_PATH).toString(),
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
	const solc_result = JSON.parse(solc.compile(JSON.stringify(input)));
	const contract = solc_result.contracts["Token.sol"]["ERC677BridgeTokenRewardableMock"];

	return {
		abi: contract.abi,
		bytecode: contract.evm.bytecode.object,
	};
}

const token_name = 'POSDAO';
const token_symbol = 'POS';
const token_decimals = 18;

async function send_tx (web3, params) {
	const tx_data = await request("personal_sendTransaction", [ params, "" ], RPC_PORT);
	const tx_hash = tx_data.result;
	const start_date = Date.now();

	while (Date.now() - start_date < 20 * 1000) {
		const tx = await web3.eth.getTransaction(tx_hash);
		if (tx && tx.blockHash) {
			const tx_receipt = await web3.eth.getTransactionReceipt(tx_hash);
			if (!tx_receipt.status) {
				console.error(`Invalid transaction: status=${tx_receipt.status}`);
				// throw new Error(`Invalid transaction: status=${tx_receipt.status}`);
			}
			return tx_receipt;
		}
		await sleep(250);
	}

	throw new Error(`Transaction ${tx_hash} timed-out after 20s`);
}

async function deploy_contract (web3, compiled_contract, sender, args) {
	const contract = new web3.eth.Contract(compiled_contract.abi);
	const tx_data = await contract
		.deploy({
			data: '0x' + compiled_contract.bytecode,
			arguments: args,
		})
		.encodeABI();
	const tx_receipt = await send_tx(web3, {
		from: sender,
		data: tx_data,
	});
	const contract_address = tx_receipt.contractAddress;

	if (!contract_address) {
		throw new Error(`Couldn't deploy the contract.`);
	}

	return new web3.eth.Contract(compiled_contract.abi, contract_address);
}

async function deploy_staking () {
	const web3 = new Web3(`http://localhost:${RPC_PORT}`);
	console.log("**** Current block:", (await web3.eth.getBlock("latest")).number);

	const accounts = JSON.parse(fs.readFileSync(ACCOUNTS_PATH));

	console.log("**** Deploying StakingToken");
	const token_compiled = compile_token_contract();
	const token_contract = await deploy_contract(
		web3,
		token_compiled,
		accounts.owner,
		[ token_name, token_symbol, token_decimals ]
	);

	console.log('**** StakingToken deployed at:', token_contract.address);

    console.log('**** Set StakingAuRa address in StakingToken contract');
    await send_tx(web3, {
        from: accounts.owner,
        to: token_contract.address,
        data: token_contract.methods.setStakingContract(STAKING_CONTRACT).encodeABI(),
	});

    console.log('**** Set BlockRewardAuRa address in StakingToken contract');
    await send_tx(web3, {
        from: accounts.owner,
        to: token_contract.address,
        data: token_contract.methods.setBlockRewardContract(BLOCK_REWARD_CONTRACT).encodeABI(),
	});

	console.log('**** Set StakingToken address in StakingAuRa');
	const staking_abi = JSON.parse(fs.readFileSync(path.join(CONTRACTS_BASE_PATH, "StakingAuRa.json"))).abi;
	const staking_contract = new web3.eth.Contract(staking_abi, STAKING_CONTRACT);
    await send_tx(web3, {
        from: accounts.owner,
        to: STAKING_CONTRACT,
        data: staking_contract.methods.setErc20TokenContract(token_contract.address).encodeABI(),
    });
}

deploy_staking()
	.then(() => {
		console.log("Done!");
		process.exit(0);
	})
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
