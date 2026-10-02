#!/bin/zsh
cd "${0:A:h}"
export PATH="/Users/boro/.local/bin:$PATH"
riftbound_url='http://127.0.0.1:4173'
if [ ! -d node_modules ]; then
  npm install || exit 1
fi
npm run build || exit 1
if curl --silent --fail "$riftbound_url" | rg -q 'Riftbound'; then
  open "$riftbound_url"
  exit 0
fi
npm run preview -- --port 4173 --strictPort &
riftbound_server_pid=$!
trap 'kill "$riftbound_server_pid" 2>/dev/null' EXIT INT TERM
for riftbound_attempt in {1..40}; do
  if curl --silent --fail "$riftbound_url" >/dev/null; then
    open "$riftbound_url"
    break
  fi
  sleep 0.2
done
wait "$riftbound_server_pid"
