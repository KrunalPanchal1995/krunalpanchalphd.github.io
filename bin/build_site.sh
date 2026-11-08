#!/usr/bin/env bash
# Production build. Usage: bin/build_site.sh [path]
#   (no argument)  user site  https://krunalpanchalphd.github.io/
#   path           the old path-hosted copy  https://krunalpanchal1995.github.io/krunalpanchalphd.github.io/
# The jupyter plugin turns each .ipynb into HTML and drops the raw file, but the playground page links
# to the raw notebook as a download, so copy the raw notebooks back after the build.
set -euo pipefail
CFG="_config.yml"
[ "${1:-}" = "path" ] && CFG="_config.yml,_config.path.yml"
JEKYLL_ENV=production bundle exec jekyll build --config "$CFG"
for nb in assets/jupyter/*.ipynb; do
  [ -f "$nb" ] && cp "$nb" "_site/$nb"
done
echo "Built _site with: $CFG"
