/**
 * Lyncoin Pool (based on cryptonote-nodejs-pool, GPL-2.0)
 *
 * Builds Lyncoin blocks from a getblocktemplate answer: the coinbase transaction (BIP34 height, extranonce, the pool's output, and the
 * MANDATORY developer-reward output -- see DEV_SCRIPT below), the Bitcoin stratum job (coinb1 / coinb2 around the extranonce, the merkle
 * branch), the 80 byte header of a share and the serialized block for submitblock.
 *
 * Header (little endian): version 4 | previous block hash 32 | merkle root 32 | time 4 | bits 4 | nonce 4.
 **/
let crypto = require('crypto');

const HEADER_SIZE = 80;

// Lyncoin consensus requires a SEPARATE, mandatory coinbase output to this fixed address from height 48950
// (checked in src/validation.cpp ConnectBlock: "devreward-not-found" rejects the whole block if it is missing).
// The required amount is >= 10% of the WHOLE blockReward (subsidy+fees), i.e. 1/9 of the miner's own share --
// script: OP_0 <20 byte hash>. See buildCoinbase() below for why this is NOT 10% of getblocktemplate's own
// "coinbasevalue" field (same non-standard RPC quirk as KCN, see critical-kcn-sha3-txhash-bug memory).
const DEV_SCRIPT_HEX = '0014e278645407a9c322b0becef0b31762f32ec03a66';

function sha256d (buf) {
	return crypto.createHash('sha256').update(crypto.createHash('sha256').update(buf).digest()).digest();
}
exports.sha256d = sha256d;

// Lyncoin's src/validation.cpp CheckBlock() has a hard, unconditional consensus check (confirmed straight
// from the node's own source on srv2, line ~4151): "if ((block.nVersion & 0x8000) && (block.vtx[0]->version
// != 8)) return ...\"flex-algo-wrong-cb-version\"...". The live getblocktemplate's own "version" field
// already has the 0x8000 bit set (confirmed live: 0x0b0d8004), so the coinbase transaction MUST be version 8
// -- there is no way to opt out while mining Flex. CTransaction::ComputeHash() is itself version-conditional
// (src/primitives/transaction.cpp): version 8 uses "Hash3Writer" (double SHA3-256), not Bitcoin's standard
// double-SHA256. Only the coinbase's OWN txid changes hash algo this way; the merkle TREE combining step
// (consensus/merkle.cpp's ComputeMerkleRoot) still calls SHA256D64 unmodified regardless of version, so
// merkleBranches()/merkleRootFromBranches() below stay sha256d-based on purpose. Confirmed empirically too:
// a real low-difficulty block mined and accepted by the live node (see critical-kcn-sha3-txhash-bug-style
// verification) round-tripped correctly only with this sha3d coinbase txid.
function sha3d (buf) {
	return crypto.createHash('sha3-256').update(crypto.createHash('sha3-256').update(buf).digest()).digest();
}
exports.sha3d = sha3d;

function reverse (buf) {
	return Buffer.from(buf).reverse();
}
exports.reverse = reverse;

function varint (n) {
	if (n < 0xfd) return Buffer.from([n]);
	if (n <= 0xffff) { let b = Buffer.alloc(3); b[0] = 0xfd; b.writeUInt16LE(n, 1); return b; }
	if (n <= 0xffffffff) { let b = Buffer.alloc(5); b[0] = 0xfe; b.writeUInt32LE(n, 1); return b; }
	let b = Buffer.alloc(9); b[0] = 0xff; b.writeBigUInt64LE(BigInt(n), 1); return b;
}
exports.varint = varint;

/** the script push of the BIP34 height (minimal encoding of a script number) */
function heightPush (height) {
	if (height >= 1 && height <= 16) return Buffer.from([0x50 + height]);
	let bytes = [];
	let n = height;
	while (n > 0) { bytes.push(n & 0xff); n = Math.floor(n / 256); }
	if (bytes.length && (bytes[bytes.length - 1] & 0x80)) bytes.push(0);
	return Buffer.concat([Buffer.from([bytes.length]), Buffer.from(bytes)]);
}
exports.heightPush = heightPush;

function outputBuf (value, script) {
	let v = Buffer.alloc(8);
	v.writeBigUInt64LE(BigInt(value));
	return Buffer.concat([v, varint(script.length), script]);
}

/**
 * Coinbase transaction around the extranonce. Returns {coinb1, coinb2 (Buffers), poolValue}: the transaction is
 * coinb1 + extranonce1 + extranonce2 + coinb2 (the script of the input carries height, then one push of the extranonces, then the tag).
 **/
exports.buildCoinbase = function (template, poolScriptHex, extraNonceSize, tag) {
	// Lyncoin's own getblocktemplate RPC is non-standard: rpc/mining.cpp's "coinbasevalue" is
	// `pblock->vtx[0]->vout[0].nValue` (the first output of the node's OWN internal template, i.e. the
	// MINER's 90% share only), not GetValueOut()/the full subsidy+fees total that stock Bitcoin Core
	// (and the RPC's own help text) would lead you to expect. So coinbasevalue here already IS poolValue
	// -- the mandatory dev-reward output has to be added ON TOP, not carved out of it (same quirk as KCN).
	let poolValue = template.coinbasevalue;
	if (!(poolValue > 0)) throw new Error('bad coinbasevalue ' + template.coinbasevalue);
	// validation.cpp requires devOutput.nValue >= 0.1 * (poolValue + devValue) [floor, C++ truncation].
	// Solving for devValue: devValue >= poolValue / 9 -- algebraically exact (10*devValue >= poolValue+devValue
	// iff devValue >= 0.1*(poolValue+devValue)), so ceil() here is a safe, exact bias up, not an approximation.
	let devValue = Math.ceil(poolValue / 9);

	let height = heightPush(template.height);
	let tagPush = tag ? Buffer.concat([Buffer.from([tag.length]), Buffer.from(tag)]) : Buffer.alloc(0);
	let scriptLength = height.length + 1 + extraNonceSize + tagPush.length;
	if (scriptLength < 2 || scriptLength > 100) throw new Error('coinbase script of ' + scriptLength + ' bytes');

	// MUST be 8 -- see sha3d() comment above: the live node's Flex-era block header version always has the
	// 0x8000 bit set, and CheckBlock() hard-rejects ("flex-algo-wrong-cb-version") any coinbase tx that isn't
	// version 8 in that case.
	let version = Buffer.alloc(4);
	version.writeInt32LE(8, 0);

	let outputs = [
		outputBuf(poolValue, Buffer.from(poolScriptHex, 'hex')),
		outputBuf(devValue, Buffer.from(DEV_SCRIPT_HEX, 'hex'))
	];
	// a block with SegWit transactions needs the witness commitment output (the script comes ready from the node)
	if (template.default_witness_commitment) outputs.push(outputBuf(0, Buffer.from(template.default_witness_commitment, 'hex')));

	let coinb1 = Buffer.concat([
		version, varint(1), Buffer.alloc(32), Buffer.from('ffffffff', 'hex'),
		varint(scriptLength), height, Buffer.from([extraNonceSize])
	]);
	let coinb2 = Buffer.concat([
		tagPush, Buffer.from('ffffffff', 'hex'),
		varint(outputs.length)].concat(outputs).concat([
		Buffer.alloc(4),                                     // lock time
	]));
	return {coinb1: coinb1, coinb2: coinb2, poolValue: poolValue, witness: !!template.default_witness_commitment};
};

/** the sibling hashes of the coinbase (index 0) up the merkle tree of the block, given the ids of the other transactions (internal byte order) */
exports.merkleBranches = function (txids) {
	let level = [null].concat(txids);
	let steps = [];
	while (level.length > 1) {
		steps.push(level[1]);
		if (level.length % 2) level.push(level[level.length - 1]);
		let next = [null];
		for (let i = 2; i < level.length; i += 2) next.push(sha256d(Buffer.concat([level[i], level[i + 1]])));
		level = next;
	}
	return steps;
};

/** merkle root (internal byte order) from the coinbase id and the branch */
exports.merkleRootFromBranches = function (coinbaseTxid, branches) {
	let root = coinbaseTxid;
	for (let b of branches) root = sha256d(Buffer.concat([root, b]));
	return root;
};

/** compact bits to the 256 bit target */
exports.compactToTarget = function (bits) {
	let exponent = bits >>> 24;
	let mantissa = BigInt(bits & 0x007fffff);
	if (bits & 0x00800000) return 0n;
	return exponent <= 3 ? mantissa >> BigInt(8 * (3 - exponent)) : mantissa << BigInt(8 * (exponent - 3));
};

/** every 4 byte word reversed: the way Bitcoin stratum sends the previous block hash (the miner reverses the words back) */
function swapWords (buf) {
	let out = Buffer.from(buf);
	for (let i = 0; i < out.length; i += 4) out.slice(i, i + 4).reverse();
	return out;
}
exports.swapWords = swapWords;

/**
 * The job for miners out of a template.
 *   {height, version, bits, time, target (BigInt), prevHash (display hex), coinb1, coinb2, branches (Buffers), stratum: {...notify fields},
 *    transactions (hex list for submitblock), coinbaseInfo}
 **/
exports.buildJob = function (template, poolScriptHex, extraNonceSize, tag) {
	let coinbase = exports.buildCoinbase(template, poolScriptHex, extraNonceSize, tag);
	let txs = template.transactions || [];
	let txids = txs.map(function (t) { return reverse(Buffer.from(t.txid || t.hash, 'hex')); });
	let branches = exports.merkleBranches(txids);
	let bits = parseInt(template.bits, 16);
	let versionHex = (template.version >>> 0).toString(16).padStart(8, '0');
	return {
		height: template.height,
		version: template.version,
		versionHex: versionHex,
		bits: bits,
		bitsHex: template.bits,
		time: template.curtime,
		mintime: template.mintime,
		target: BigInt('0x' + template.target),
		prevHash: template.previousblockhash,
		prevInternal: reverse(Buffer.from(template.previousblockhash, 'hex')),
		coinb1: coinbase.coinb1,
		coinb2: coinbase.coinb2,
		branches: branches,
		transactions: txs.map(function (t) { return t.data; }),
		poolValue: coinbase.poolValue,
		witness: coinbase.witness,
		payments: 0
	};
};

/** what the stratum notify carries (everything hex, in the byte order Bitcoin stratum uses) */
exports.notifyParams = function (job, jobId, clean) {
	return [
		jobId,
		swapWords(job.prevInternal).toString('hex'),
		job.coinb1.toString('hex'),
		job.coinb2.toString('hex'),
		job.branches.map(function (b) { return b.toString('hex'); }),
		job.versionHex,
		job.bitsHex,
		job.time.toString(16).padStart(8, '0'),
		!!clean
	];
};

/** the coinbase transaction of one miner: {legacy: Buffer (the whole transaction), txid} for its extranonce1 + extranonce2 */
exports.coinbaseFor = function (job, extraNonce) {
	let tx = Buffer.concat([job.coinb1, extraNonce, job.coinb2]);
	// coinbase tx version is hardcoded to 8 in buildCoinbase() above -- its own txid MUST use sha3d to match
	// the node's version-conditional CTransaction::ComputeHash(), see sha3d()'s comment.
	return {tx: tx, txid: sha3d(tx)};
};

/** the 80 byte header of a share */
exports.buildHeader = function (job, merkleRoot, ntime, nonce) {
	let header = Buffer.alloc(HEADER_SIZE);
	header.writeInt32LE(job.version, 0);
	job.prevInternal.copy(header, 4);
	merkleRoot.copy(header, 36);
	header.writeUInt32LE(ntime >>> 0, 68);
	header.writeUInt32LE(job.bits >>> 0, 72);
	header.writeUInt32LE(nonce >>> 0, 76);
	return header;
};

/** the serialized block for submitblock: header, the number of transactions, the coinbase, the template's transactions */
exports.serializeBlock = function (job, header, coinbaseTx) {
	let count = 1 + job.transactions.length;
	let cb = coinbaseTx;
	if (job.witness) {
		// witness serialization of the coinbase: marker + flag after the version, the witness (one item: 32 zero bytes) before the lock time
		cb = Buffer.concat([cb.slice(0, 4), Buffer.from([0, 1]), cb.slice(4, cb.length - 4), Buffer.from([1, 32]), Buffer.alloc(32), cb.slice(cb.length - 4)]);
	}
	return header.toString('hex') + varint(count).toString('hex') + cb.toString('hex') + job.transactions.join('');
};

exports.HEADER_SIZE = HEADER_SIZE;
