#!/bin/bash

open -a "Google Chrome Canary" --args --origin-to-force-quic-on=localhost:9000 "--ignore-certificate-errors-spki-list=H/X2R6SAviXxG///7uiLzVuiNWI0J59miOyg9E9u7K8=" localhost:8000
