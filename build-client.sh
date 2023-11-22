#!/bin/bash

pushd client
npm run build && rm -f ../web/wasm/*.wasm && cp dist/* ../web/wasm
popd
