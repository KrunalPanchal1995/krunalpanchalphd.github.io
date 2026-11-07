# krunalpanchalphd.github.io

Doctoral research portfolio of Dr. Krunal R. Panchal: a focused subset of
[krunalpanchal1995.github.io](https://krunalpanchal1995.github.io) built around one idea, the end-to-end loop for a
reacting process (build the model, calibrate it with honest uncertainty, use it in CFD, teach a neural network to
stand in for it).

Live: <https://krunalpanchal1995.github.io/krunalpanchalphd.github.io/>

## What is here

- Home, About, Beyond Research, Publications, CV, Studio (Math Visual Studio), Neural-ODE playground.
- Projects: MOSIAC (with MUQ-SAC), PANSOPHIA (FEM/CFD solver and its test cases, geometry kernel and numerics figures),
  dokimazo, MathStudio, FlameLab, PAN-IIT-OSS, and the Neural-ODE playground.

## Hosting note

This repository is a *project* site, so it is served from a sub-path. `baseurl` in `_config.yml` is
`/krunalpanchalphd.github.io`, and `_plugins/baseurl_links.rb` prefixes root-relative links in the built HTML with it, so
page content can keep writing links such as `/projects/mosiac/`. To serve it from a root address instead (a custom domain
or a user site), set `baseurl: ""`; the plugin then does nothing.

## Build locally

Ruby 3.3 and the gems in `Gemfile.lock`:

```bash
bundle install
JEKYLL_ENV=production bundle exec jekyll build   # output in _site/
```

## Publishing

There is no GitHub Actions deploy in this repository yet (the CLI token used to create it lacked the `workflow` scope, which GitHub requires to
push workflow files). The site is published from a local production build:

```bash
JEKYLL_ENV=production bundle exec jekyll build
bin/publish_gh_pages.sh        # clones gh-pages, copies _site over it, commits, pushes, waits for the Pages build
```

**Never force-push `gh-pages`.** On 2026-11-07, replacing the branch history with `git push -f` made every following Pages build
fail instantly ("Page build failed", 0 ms, no detail), even for an identical tree; restoring the old history fixed it, and the same tree
published fine as an ordinary commit on top. `bin/publish_gh_pages.sh` always builds on the existing history and refuses to force.
If a build errors, check `gh api repos/KrunalPanchal1995/krunalpanchalphd.github.io/pages/builds/latest`, file sizes (GitHub rejects
files over 100 MB), and https://www.githubstatus.com.

To get automatic deploys instead: `gh auth refresh -h github.com -s workflow`, then add the standard Jekyll deploy workflow
(`.github/workflows/deploy.yml`) and set Pages source to GitHub Actions.

Built on the [al-folio](https://github.com/alshedivat/al-folio) theme.
