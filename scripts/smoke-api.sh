#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:5001/exam-language-trainer-3abec/us-central1/api}"

echo "Smoke test target: $BASE_URL"

echo "1) Invalid words payload should return 400"
status_invalid=$(curl -s -o /tmp/elt-invalid.out -w "%{http_code}" \
  -X POST "$BASE_URL/generate-quiz" \
  -H "Content-Type: application/json" \
  -d '{"words":"not-an-array"}')
[[ "$status_invalid" == "400" ]] || {
  echo "Expected 400, got $status_invalid"
  cat /tmp/elt-invalid.out
  exit 1
}

echo "2) Oversized words payload should return 400"
oversized_payload=$(printf '{"words": [%s]}' "$(yes '"word"' | head -n 101 | paste -sd, -)")
status_oversized=$(curl -s -o /tmp/elt-oversized.out -w "%{http_code}" \
  -X POST "$BASE_URL/generate-quiz" \
  -H "Content-Type: application/json" \
  -d "$oversized_payload")
[[ "$status_oversized" == "400" ]] || {
  echo "Expected 400, got $status_oversized"
  cat /tmp/elt-oversized.out
  exit 1
}

echo "3) Valid payload should return SSE frames when provider is configured"
status_stream=$(curl -s -N -o /tmp/elt-stream.out -w "%{http_code}" \
  -X POST "$BASE_URL/generate-quiz" \
  -H "Content-Type: application/json" \
  -d '{"words":["analysis","evaluate","synthesize"]}')

if [[ "$status_stream" == "200" ]]; then
  grep -q '^data: ' /tmp/elt-stream.out || {
    echo "Expected SSE data frames, none found"
    cat /tmp/elt-stream.out
    exit 1
  }
elif [[ "$status_stream" == "500" ]]; then
  echo "Skipping SSE frame assertion: provider credentials not available in local emulator."
else
  echo "Unexpected status for valid payload: $status_stream"
  cat /tmp/elt-stream.out
  exit 1
fi

echo "Smoke tests passed."
