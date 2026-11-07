# Security policy

This is a static site (GitHub Pages). There is no server-side code, login or database on the site itself.
The only dynamic piece is the privacy-first visit counter, [openfirststep](https://github.com/KrunalPanchal1995/openfirststep).

## Reporting a vulnerability

Please use GitHub's **Report a vulnerability** button on the Security tab (private), not a public issue.

## Protections in place

- HTTPS enforced; every CDN script carries an SRI hash.
- `main` cannot be force-pushed or deleted (repository ruleset).
- GitHub Actions are pinned to full commit SHAs and updated weekly by Dependabot; workflows default to read-only tokens.
- Secret scanning and push protection are on.
- The counter stores no IP address, user-agent or cookies, and only accepts requests from this site's origin.

## Known and accepted risk

- **GHSA-9pmc-p236-855h, `css_parser` < 3.0.0 (SSRF / local file read in `read_remote_file`).**
  `css_parser` is a build-time dependency of `jekyll-3rd-party-libraries`, which requires `< 2.0`, so it cannot be upgraded from this repo.
  It only processes this repository's own CSS during the build, never visitor input, and is not shipped to the live site.
  To be resolved upstream in `jekyll-3rd-party-libraries`; revisit when a release allows `css_parser >= 3.0.0`.
