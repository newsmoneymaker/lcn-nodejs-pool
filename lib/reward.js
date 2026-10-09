/**
 * Block reward of Lyncoin mainnet (src/validation.cpp, GetBlockSubsidy): starts at 210,000 LCN and is cut by
 * 1% (integer subsidy -= subsidy/100, with a floor of -1 if a step would otherwise not move it) at every
 * nSubsidyHalvingInterval blocks (4320, roughly 3 days at the original 1 minute block time) until height
 * n2023Height2 (71700); from there the step interval becomes nSubsidyHalvingInterval2 (43200, roughly 30
 * days) and a one-off /10 cut is applied on top. 10% of this subsidy (as part of blockReward = subsidy+fees)
 * is a mandatory, separate coinbase output to a fixed developer address from height n2023Height=48950 --
 * handled in blockBuilder.js, not here. Amounts in atomic units (1 LCN = 1e8).
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
	return subsidy;
};
