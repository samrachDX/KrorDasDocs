#!/usr/bin/env bash
# Builds the Valkey server (BSD-licensed, Redis-compatible) for macOS
# into desktop/resources/redis/redis-server.
set -euo pipefail
VERSION="${VALKEY_VERSION:-8.0.2}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
curl -fsSL "https://github.com/valkey-io/valkey/archive/refs/tags/${VERSION}.tar.gz" | tar -xz -C "$WORK"
cd "$WORK/valkey-${VERSION}"
make -j"$(sysctl -n hw.ncpu)" BUILD_TLS=no MALLOC=libc valkey-server
mkdir -p "$HERE/resources/redis"
cp src/valkey-server "$HERE/resources/redis/redis-server"
chmod +x "$HERE/resources/redis/redis-server"
cp COPYING "$HERE/resources/redis/LICENSE-valkey.txt"
"$HERE/resources/redis/redis-server" --version
