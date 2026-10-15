#!/usr/bin/env bash
# Clones IFBench (allenai/IFBench) into ./IFBench. IFBench is not on PyPI.
# The generation and scoring scripts are in the repo, not in the package.
# The dependencies of IFBench are in pyproject.toml.
set -euo pipefail
cd "$(dirname "$0")"
if [ -d IFBench ]; then echo "IFBench already cloned"; else git clone --depth 1 https://github.com/allenai/IFBench IFBench; fi
