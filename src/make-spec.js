const fs = require("fs");
const path = require("path");

const Web3 = require("web3");

const CONFIG = require("./config");

const {
	BASE_SPEC_PATH,
	SPEC_PATH,
	ACCOUNTS_PATH,
	CONTRACTS_BASE_PATH,
} = CONFIG.paths;

const {
	VALIDATOR_SET_CONTRACT,
	BLOCK_REWARD_CONTRACT,
	RANDOM_CONTRACT,
	STAKING_CONTRACT,
	PERMISSION_CONTRACT,
	CERTIFIER_CONTRACT,
	REGISTRY_CONTRACT,
	INIT_AURA_CONTRACT,
} = CONFIG.contracts;

// make_spec({
// 	owner: "0x5000000000000000000000000000000000000001",
// 	validators: [ "0x5000000000000000000000000000000000000001" ],
// 	stakers: [ "0x5000000000000000000000000000000000000001" ],
// });

function make_spec({ owner, validators, stakers }) {
	const spec = JSON.parse(fs.readFileSync(BASE_SPEC_PATH));

	/// Add balance for validators and stakers
	const accounts = [].concat(owner, validators, stakers);
	for (const account of accounts) {
		spec.accounts[account] = { balance: "10000000000000000000000" };
	}

	// Build ValidatorSetAuRa contract
	add_eternal_contract(spec, {
		address: VALIDATOR_SET_CONTRACT,
		name: "ValidatorSetAuRa",
		owner,
	});
	spec.engine.authorityRound.params.validators = {
		multi: {
			"0": {
				"contract": VALIDATOR_SET_CONTRACT,
			},
		},
	};

	// Build StakingAuRa contract
	add_eternal_contract(spec, {
		address: STAKING_CONTRACT,
		name: "StakingAuRa",
		owner,
	});

	// Build BlockRewardAuRa contract
	add_eternal_contract(spec, {
		address: BLOCK_REWARD_CONTRACT,
		name: "BlockRewardAuRa",
		owner,
	});
	spec.engine.authorityRound.params.blockRewardContractAddress = BLOCK_REWARD_CONTRACT;
	spec.engine.authorityRound.params.blockRewardContractTransition = 0;

	// Build RandomAuRa contract
	add_eternal_contract(spec, {
		address: RANDOM_CONTRACT,
		name: "RandomAuRa",
		owner,
	});
	spec.engine.authorityRound.params.randomnessContractAddress = RANDOM_CONTRACT;

	// Build TxPermission contract
	add_eternal_contract(spec, {
		address: PERMISSION_CONTRACT,
		name: "TxPermission",
		owner,
	});
	spec.params.transactionPermissionContract = PERMISSION_CONTRACT;

	// Build Certifier contract
	add_eternal_contract(spec, {
		address: CERTIFIER_CONTRACT,
		name: "Certifier",
		owner,
	});

	// Build Registry contract
	add_contract(spec, {
		address: REGISTRY_CONTRACT,
		name: "Registry",
		arguments: [ CERTIFIER_CONTRACT, owner ],
	});
	spec.params.registrar = REGISTRY_CONTRACT;

	// Build InitializerAuRa contract
	const firstValidatorIsUnremovable = true;
	const stakingEpochDuration = 80;
	const stakeWithdrawDisallowPeriod = 10;
	const collectRoundLength = 20;
	const erc20Restricted = false;

	add_contract(spec, {
		address: INIT_AURA_CONTRACT,
		name: "InitializerAuRa",
		arguments:[
			[ // _contracts
				VALIDATOR_SET_CONTRACT,
				BLOCK_REWARD_CONTRACT,
				RANDOM_CONTRACT,
				STAKING_CONTRACT,
				PERMISSION_CONTRACT,
				CERTIFIER_CONTRACT
			],
			owner, // _owner
			validators, // _miningAddresses
			stakers, // _stakingAddresses
			firstValidatorIsUnremovable, // _firstValidatorIsUnremovable
			1, // _delegatorMinStake
			1, // _candidateMinStake
			stakingEpochDuration, // _stakingEpochDuration
			0, // _stakingEpochStartBlock
			stakeWithdrawDisallowPeriod, // _stakeWithdrawDisallowPeriod
			collectRoundLength, // _collectRoundLength
			erc20Restricted // _erc20Restricted
		],
	});

	fs.writeFileSync(SPEC_PATH, JSON.stringify(spec, null, 4));
	{
		const accounts = { owner, validators, stakers };
		fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify(accounts, null, 4));
	}
	console.log(`Wrote spec file to ${SPEC_PATH}`);
}

function get_contract(name) {
	const contract_path = path.join(CONTRACTS_BASE_PATH, `${name}.json`);
	const contract = JSON.parse(fs.readFileSync(contract_path));
	if (!contract.bytecode) {
		throw new Error(`Invalid bytecode for ${name}`);
	}
	return contract;
}

function add_contract(spec, {
	address,
	name,
	arguments,
}) {
	const compiled = get_contract(name);
	const contract = new Web3().eth.Contract(compiled.abi, null, {
		data: compiled.bytecode,
	});
	const deploy = contract.deploy({ data: compiled.bytecode, arguments });

	spec.accounts[address] = {
		balance: "0",
		constructor: deploy.encodeABI()
	};
}

function add_eternal_contract(spec, {
	address,
	name,
	owner,
}) {
	// const address_suffix = Math.round(Math.random() * 255).toString(16).padStart(2, 0);
	const implementation_address = address.slice(0, 40) + "00";

	// Deploy the Eternal Storage contract, linked to the implementation
	add_contract(spec, {
		address: address,
		name: "EternalStorageProxy",
		arguments: [ implementation_address, owner ],
	});

	// Add the implementation code at a random address
	spec.accounts[implementation_address] = {
		balance: "0",
		constructor: get_contract(name).bytecode
	};
}

module.exports = make_spec;
