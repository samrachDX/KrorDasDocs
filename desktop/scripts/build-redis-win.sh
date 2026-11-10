#!/usr/bin/env bash
# Run inside an MSYS2 "MSYS" shell on Windows. Builds the Valkey server
# (BSD-licensed, Redis-compatible) with the MSYS runtime and copies it,
# plus the runtime DLL, into desktop/resources/redis.
set -euo pipefail
VERSION="${VALKEY_VERSION:-8.0.2}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
curl -fsSL "https://github.com/valkey-io/valkey/archive/refs/tags/${VERSION}.tar.gz" | tar -xz -C "$WORK"
cd "$WORK/valkey-${VERSION}"
# hiredis builds with -Werror; newer Cygwin GCC flags a harmless char-subscripts warning in sds.c.
sed -i 's/-Werror//g' deps/hiredis/Makefile
make -j"$(nproc)" BUILD_TLS=no MALLOC=libc CFLAGS="-D_GNU_SOURCE" valkey-server
OUT="$HERE/resources/redis"
mkdir -p "$OUT"
cp src/valkey-server.exe "$OUT/redis-server.exe"
for dll in $(ldd src/valkey-server.exe | awk '/\/usr\/bin\// {print $3}'); do
  cp "$dll" "$OUT/"
done
cp COPYING "$OUT/LICENSE-valkey.txt"
"$OUT/redis-server.exe" --version
