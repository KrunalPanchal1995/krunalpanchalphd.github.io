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

Deployment is the `Deploy site` GitHub Actions workflow (builds with Jekyll, writes the `gh-pages` branch).
Built on the [al-folio](https://github.com/alshedivat/al-folio) theme.
