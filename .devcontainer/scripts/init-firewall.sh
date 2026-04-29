#!/usr/bin/env bash
set -euo pipefail

# Fedora 43 nftables-compatible firewall initialization for Docker-outside-of-Docker.
#
# The host runs nftables natively (firewalld + nftables backend). Docker 29.x
# manages its own nftables tables (ip docker-bridges / ip6 docker-bridges) on
# the host namespace. This script only touches the CONTAINER's network
# namespace so it never conflicts with Docker's or firewalld's host-side rules.
#
# Requires: NET_ADMIN + NET_RAW capabilities (set via runArgs in devcontainer.json).

# ---------------------------------------------------------------------------
# 1. Flush any stale legacy iptables rules inside the container namespace.
#    On Debian bookworm (node:20 base) iptables may still be present via the
#    nf_tables compatibility shim — clear it to avoid shadow rule conflicts.
# ---------------------------------------------------------------------------
if command -v iptables &>/dev/null; then
  iptables  -F 2>/dev/null || true
  iptables  -X 2>/dev/null || true
  iptables  -P FORWARD ACCEPT 2>/dev/null || true
  ip6tables -F 2>/dev/null || true
  ip6tables -X 2>/dev/null || true
  ip6tables -P FORWARD ACCEPT 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# 2. Apply a clean nftables ruleset inside the container.
#    Policy is ACCEPT on all base chains — the devcontainer is a dev
#    environment, not an exposed server.  We keep the table so that
#    additional rules (e.g. port-knocking, rate-limiting) can be appended
#    by the user without rebuilding.
# ---------------------------------------------------------------------------
nft flush ruleset 2>/dev/null || true

nft -f - <<'NFT'
table inet devcontainer {
  chain input {
    type filter hook input priority filter; policy accept;
    ct state established,related accept
    iif lo accept
    meta l4proto { icmp, ipv6-icmp } accept
  }

  chain forward {
    type filter hook forward priority filter; policy accept;
    ct state established,related accept
  }

  chain output {
    type filter hook output priority filter; policy accept;
  }
}
NFT

# ---------------------------------------------------------------------------
# 3. Ensure IP forwarding is on inside the container namespace.
#    The host already has net.ipv4.ip_forward=1, but the container's
#    network namespace has its own sysctl scope.
# ---------------------------------------------------------------------------
sysctl -w net.ipv4.ip_forward=1  >/dev/null 2>&1 || true
sysctl -w net.ipv6.conf.all.forwarding=1 >/dev/null 2>&1 || true

echo "[init-firewall] nftables ruleset applied (Fedora 43 / DooD compatible)"
