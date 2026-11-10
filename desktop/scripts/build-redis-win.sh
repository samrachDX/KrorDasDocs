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
# Copy the MSYS runtime DLLs the server needs (recursively), using objdump
# because ldd is not available in every MSYS2 install.
copy_deps() {
  local f="$1" dll
  for dll in $(objdump -p "$f" | awk '/DLL Name/ {print $3}'); do
    if [ -f "/usr/bin/$dll" ] && [ ! -f "$OUT/$dll" ]; then
      cp "/usr/bin/$dll" "$OUT/"
      copy_deps "/usr/bin/$dll"
    fi
  done
}
copy_deps "$OUT/redis-server.exe"
ls -la "$OUT"
cp COPYING "$OUT/LICENSE-valkey.txt"
echo "DLLs imported by redis-server.exe:"
objdump -p "$OUT/redis-server.exe" | awk '/DLL Name/ {print "  " $3}'
for dll in $(objdump -p "$OUT/redis-server.exe" | awk '/DLL Name/ {print $3}'); do
  case "$dll" in msys-*) [ -f "$OUT/$dll" ] || { find /usr /mingw64 -name "$dll" 2>/dev/null | head -1 | xargs -r -I{} cp {} "$OUT/"; } ;; esac
done
ls -la "$OUT"
# Smoke test without MSYS on PATH, like the app runs it.
PATH=/c/Windows/System32:/c/Windows "$OUT/redis-server.exe" --version
