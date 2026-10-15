/**
 * Block reward of Lyncoin mainnet (src/validation.cpp, GetBlockSubsidy): starts at 210,000 LCN and is cut by
 * 1% (integer subsidy -= subsidy/100, with a floor of -1 if a step would otherwise not move it) at every
 * nSubsidyHalvingInterval blocks (4320, roughly 3 days at the original 1 minute block time) until height
 * n2023Height2 (71700); from there the step interval becomes nSubsidyHalvingInterval2 (43200, roughly 30
 * days) and a one-off /10 cut is applied on top. 10% of this subsidy (as part of blockReward = subsidy+fees)
 * is a mandatory, separate coinbase output to a fixed developer address from height n2023Height=48950 --
 * the ACTUAL on-chain split is built in blockBuilder.js, not here; minerReward() below nets that cut out
 * (an approximation, floor(subsidy*0.9), off by at most 1 atomic unit from blockBuilder.js's exact ceil(poolValue/9)
 * formula -- fine for display/profitability estimates, never used for a real payout amount). Amounts in
 * atomic units (1 LCN = 1e8). Verified against a real matured block (chain height 1510118): gross subsidy
 * 1283346203021 atomic, real miner payout 1155011582719 atomic -- floor(gross*0.9) = 1155011582718, off by 1.
 **/
const LCN_BASE = 100000000;
const INITIAL_SUBSIDY = 210000 * LCN_BASE;
const HALVING_INTERVAL = 4320;
const HALVING_INTERVAL2 = 43200;
const HEIGHT2 = 71700;

function reduceSteps (subsidy, steps) {
	let temp = subsidy;
	for (let i = 0; i < steps; i++) {
		if (subsidy <= 0) break;
		subsidy -= Math.floor(subsidy / 100);
		if (subsidy === temp) subsidy -= 1;
		temp = subsidy;
	}
	return subsidy;
}

exports.minerReward = function (height) {
	if (!(height > 0)) return 0;
	let subsidy = INITIAL_SUBSIDY;
	if (height < HEIGHT2) {
		subsidy = reduceSteps(subsidy, Math.floor(height / HALVING_INTERVAL));
	} else {
		subsidy = reduceSteps(subsidy, Math.floor(HEIGHT2 / HALVING_INTERVAL));
		subsidy = reduceSteps(subsidy, Math.floor((height - HEIGHT2) / HALVING_INTERVAL2));
		subsidy = Math.floor(subsidy / 10);
	}
	// Net out the mandatory 10% developer-reward cut -- this is called "minerReward", so it should return what
	// the MINER actually gets, not the gross subsidy the dev cut is carved out of (see module comment above).
	return Math.floor(subsidy * 0.9);
};
