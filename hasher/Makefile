# flexhash: Lyncoin's OWN Flex sources (copied from the coin's own node's src/crypto/flex/, NOT Kylacoin's --
# see the critical-wrong-randomx-variant-bug lesson). GPL/MIT mixed, see headers in flex-src/.
#   make            (STATIC=-static makes a binary that runs on any Linux)
CXX ?= g++
CC ?= gcc
STATIC ?=

FLEX_DIR = flex-src
# aes_helper.c, md_helper.c, haval_helper.c, hamsi_helper.c, sph_sha2big.c are textually #included
# by their parent .c files (echo/shavite/haval/hamsi/sph_sha2) -- not separate translation units.
SPH_HELPERS = $(FLEX_DIR)/sph/aes_helper.c $(FLEX_DIR)/sph/md_helper.c $(FLEX_DIR)/sph/haval_helper.c \
              $(FLEX_DIR)/sph/hamsi_helper.c $(FLEX_DIR)/sph/sph_sha2big.c
SPH_SRCS = $(filter-out $(SPH_HELPERS),$(wildcard $(FLEX_DIR)/sph/*.c))
CN_C_SRCS = $(FLEX_DIR)/cnfiles/cnfn.c \
            $(FLEX_DIR)/cnfiles/crypto/aesb.c \
            $(FLEX_DIR)/cnfiles/crypto/c_blake256.c \
            $(FLEX_DIR)/cnfiles/crypto/c_groestl.c \
            $(FLEX_DIR)/cnfiles/crypto/c_jh.c \
            $(FLEX_DIR)/cnfiles/crypto/c_keccak.c \
            $(FLEX_DIR)/cnfiles/crypto/c_skein.c \
            $(FLEX_DIR)/cnfiles/crypto/oaes_lib.c \
            $(FLEX_DIR)/cnfiles/crypto/hash.c

C_OBJS = $(SPH_SRCS:.c=.o) $(CN_C_SRCS:.c=.o)
CXX_OBJS = $(FLEX_DIR)/flex.o

CFLAGS = -O2 -fomit-frame-pointer -I$(FLEX_DIR) -I$(FLEX_DIR)/sph -I$(FLEX_DIR)/cnfiles -I$(FLEX_DIR)/cnfiles/crypto -maes -msse4.1
CXXFLAGS = $(CFLAGS) -std=c++14

flexhash: flexhash.o $(C_OBJS) $(CXX_OBJS)
	$(CXX) -O2 $(STATIC) -o $@ flexhash.o $(C_OBJS) $(CXX_OBJS) -lpthread

flexhash.o: flexhash.cpp
	$(CXX) $(CXXFLAGS) -I$(FLEX_DIR) -c -o $@ $<

%.o: %.c
	$(CC) $(CFLAGS) -c -o $@ $<

%.o: %.cpp
	$(CXX) $(CXXFLAGS) -c -o $@ $<

clean:
	rm -f flexhash flexhash.o $(C_OBJS) $(CXX_OBJS)
