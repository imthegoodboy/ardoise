#!/usr/bin/env bash
# End-to-end smoke test against a running Ardoise: demo shop -> pay link ->
# invoice from the shop's wallet -> payment -> settled tab -> receipt.
# Usage: scripts/smoke.sh [base-url]
set -euo pipefail
B=${1:-http://localhost:3000}
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT

post() { curl -sf -b "$JAR" -c "$JAR" -H "Origin: $B" -H 'Accept: text/html' --data "$2" "$1" -o /dev/null -w '%{redirect_url}'; }
fail() { echo "FAIL: $*" >&2; exit 1; }

curl -sf "$B/api/health" | grep -q '"ok":true' || fail 'health'
echo "health        ok"

[ "$(post "$B/demo" '')" = "$B/app" ] || fail 'demo shop'
echo "demo shop     ok"

CID=$(curl -sf -b "$JAR" "$B/app" | grep -o '/app/c/[0-9a-f-]\{36\}' | head -1)
[ -n "$CID" ] || fail 'customer list'
PAY=$(curl -sf -b "$JAR" "$B$CID" | grep -o "$B/p/[A-Za-z0-9_-]*" | head -1)
[ -n "$PAY" ] || fail 'pay link'
echo "pay link      ok"

INV=$(post "$PAY" 'amount=1500&name=Moussa')
case "$INV" in */i/*) ;; *) fail "invoice ($INV)" ;; esac
curl -sf "$INV" | grep -q 'lightning:ln' || fail 'bolt11 on invoice page'
echo "invoice       ok ($(curl -sf "$INV" | grep -o 'lightning:ln[a-z0-9]\{12\}' | head -1)...)"

post "$INV?/demo" '' > /dev/null || true
for _ in $(seq 1 10); do
	if curl -sf "$INV" | grep -q '/r/'; then break; fi
	sleep 2
done
RID=$(curl -sf "$INV" | grep -o '/r/[A-Za-z0-9_-]*' | head -1)
[ -n "$RID" ] || fail 'payment not settled'
echo "settled       ok"

curl -sf "$B$RID" | grep -q '[0-9a-f]\{64\}' || fail 'receipt proof'
echo "receipt       ok"
echo "PASS"
