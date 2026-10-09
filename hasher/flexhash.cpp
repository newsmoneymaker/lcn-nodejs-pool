// flexhash: share validation helper of the Kylacoin/Lyncoin pools.
// Flex sources (hasher/flex-src/) are copied verbatim from the coin's own node (src/crypto/flex/),
// not borrowed from any other project -- see the critical-wrong-randomx-variant-bug lesson: a
// sibling algorithm/fork can have different parameters and silently compute the wrong hash.
// Call convention matches the node's own CBlockHeader::GetPoWHash() (src/hash.h):
//   flex_hash(buffer.data(), buffer.size(), result.begin())  -- 80 byte header in, 32 byte hash out.
//
// Reads commands on stdin, writes answers on stdout (one line each):
//   H <id> <160 hex>    the 80 byte block header (version, previous hash, merkle root, time, bits, nonce);
//                       answers "H <id> <64 hex>": the flex hash, 32 bytes as computed (little endian), or "H <id> err"
//   Q                   quit
// Command line: --hash <160 hex> prints the hash.
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cstdint>
#include "flex-src/flex.h"

static int hexval(int c)
{
	if (c >= '0' && c <= '9') return c - '0';
	if (c >= 'a' && c <= 'f') return c - 'a' + 10;
	if (c >= 'A' && c <= 'F') return c - 'A' + 10;
	return -1;
}

static int from_hex(const char *s, unsigned char *out, size_t n)
{
	if (strlen(s) != n * 2) return -1;
	for (size_t i = 0; i < n; i++) {
		int a = hexval(s[2 * i]), b = hexval(s[2 * i + 1]);
		if (a < 0 || b < 0) return -1;
		out[i] = (unsigned char)(a * 16 + b);
	}
	return 0;
}

static void to_hex(const unsigned char *in, size_t n, char *out)
{
	static const char d[] = "0123456789abcdef";
	for (size_t i = 0; i < n; i++) { out[2 * i] = d[in[i] >> 4]; out[2 * i + 1] = d[in[i] & 15]; }
	out[2 * n] = 0;
}

int main(int argc, char **argv)
{
	unsigned char header[80], hash[32];
	char hex[65];

	if (argc == 3 && strcmp(argv[1], "--hash") == 0) {
		if (from_hex(argv[2], header, 80)) { fprintf(stderr, "need 160 hex chars\n"); return 1; }
		flex_hash(reinterpret_cast<const char*>(header), 80, hash);
		to_hex(hash, 32, hex);
		puts(hex);
		return 0;
	}

	char line[512];
	while (fgets(line, sizeof(line), stdin)) {
		if (line[0] == 'Q') break;
		if (line[0] != 'H') continue;
		char id[64], data[400];
		if (sscanf(line, "H %63s %399s", id, data) != 2 || from_hex(data, header, 80)) {
			printf("H %s err\n", (strlen(line) > 2) ? id : "0");
			fflush(stdout);
			continue;
		}
		flex_hash(reinterpret_cast<const char*>(header), 80, hash);
		to_hex(hash, 32, hex);
		printf("H %s %s\n", id, hex);
		fflush(stdout);
	}
	return 0;
}
