# webtransport-lag-investigation

This repository contains the code used to investigate the latency of WebTransport connections.

## Setup

1. Run WebTransport server: `cargo run`.
2. Run local web server: `./host-web.sh`.
3. Open Chrome with special args so it accepts self-signed certs: `./open-chrome.sh`.
4. Open `https://localhost:8000` in just started Chrome (if it doesn't open automatically).
5. Naviagate to one of the directories containing a different case of WebTransport and WebWorker usage.
