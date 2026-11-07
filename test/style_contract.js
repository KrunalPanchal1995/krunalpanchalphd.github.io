const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

const read = (relPath) => fs.readFileSync(path.join(root, relPath), "utf8");
const exists = (relPath) => fs.existsSync(path.join(root, relPath));
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const failures = [];

const packageJson = JSON.parse(read("package.json"));
const scripts = packageJson.scripts || {};
for (const forbiddenScript of ["build:css", "build:tailwind", "build:tailwind:watch"]) {
  if (Object.prototype.hasOwnProperty.call(scripts, forbiddenScript)) {
    failures.push(`Starter package.json must not define \`${forbiddenScript}\`; build ownership belongs to gem repos.`);
  }
}

const config = read("_config.yml");
if (!/^\s*theme:\s*al_folio_core\s*$/m.test(config)) {
  failures.push("`_config.yml` must keep `theme: al_folio_core` for thin-starter wiring.");
}
if (!/^\s*-\s*al_folio_core\s*$/m.test(config)) {
  failures.push("`_config.yml` plugins must include `al_folio_core`.");
}
if (!/^\s*-\s*al_folio_distill\s*$/m.test(config)) {
  failures.push("`_config.yml` plugins must include `al_folio_distill` (distill is plugin-owned).");
}
if (!/^\s*-\s*al_cookie\s*$/m.test(config)) {
  failures.push("`_config.yml` plugins must include `al_cookie` (cookie consent is plugin-owned).");
}
if (!/^\s*-\s*al_icons\s*$/m.test(config)) {
  failures.push("`_config.yml` plugins must include `al_icons` (icon runtime is plugin-owned).");
}
if (!/^\s*-\s*al_math\s*$/m.test(config)) {
  failures.push("`_config.yml` plugins must include `al_math` when math features are enabled.");
}

for (const libraryKey of ["fontawesome", "academicons", "scholar-icons"]) {
  if (!new RegExp(`^\\s{2}${escapeRegExp(libraryKey)}:\\s*$`, "m").test(config)) {
    failures.push(`\`_config.yml\` must define \`third_party_libraries.${libraryKey}\` for al_icons runtime wiring.`);
    continue;
  }
  if (!new RegExp(`^\\s{2}${escapeRegExp(libraryKey)}:[\\s\\S]*?^\\s{4}integrity:\\s*$[\\s\\S]*?^\\s{6}css:\\s*\"sha`, "m").test(config)) {
    failures.push(`\`_config.yml\` should define an SRI hash for \`third_party_libraries.${libraryKey}.integrity.css\`.`);
  }
}

for (const libraryKey of ["tikzjax", "tocbot"]) {
  if (!new RegExp(`^\\s{2}${escapeRegExp(libraryKey)}:\\s*$`, "m").test(config)) {
    failures.push(`\`_config.yml\` must define \`third_party_libraries.${libraryKey}\` for v1 runtime contracts.`);
  }
}

const gemfile = read("Gemfile");
// The point of this check is that `al_math` is pinned to *a* released version,
// not to any particular one. Hard-coding the number here meant every routine
// version bump failed the style contract until someone remembered to edit this
// file too, which is a tripwire for the bump rather than for the boundary.
if (!/gem 'al_math', '= \d+\.\d+\.\d+'/.test(gemfile)) {
  failures.push("`Gemfile` should pin `al_math` to an exact released version (`= x.y.z`).");
}
if (/gem 'al_math',\s*:git =>/.test(gemfile)) {
  failures.push("`Gemfile` must not use git-branch pin for `al_math`; use released gem version.");
}

for (const forbiddenPath of ["_scripts", "assets/tailwind", "tailwind.config.js", "assets/webfonts"]) {
  if (exists(forbiddenPath)) {
    failures.push(`Starter must not own core component path \`${forbiddenPath}\`; move ownership to the corresponding gem.`);
  }
}

// `_includes` / `_layouts` / `_sass` are NOT blanket-forbidden here, unlike the
// `_scripts`/tailwind paths above. docs/BOUNDARIES.md is explicit about this:
// "Local site overrides are still valid in your own site... This does NOT
// apply to the `alshedivat/al-folio` starter repo itself" -- the original
// version of this check was copied from that upstream repo's own contract and
// enforced its rule here too, which is the wrong rule for a personalized site
// (it failed for three files that were already legitimately overridden and
// audited in .al-folio-overrides.yml before this fix, undetected because no
// CI workflow ever ran this script). The actual contract for a personalized
// site, per BOUNDARIES.md, is: any file that shadows a gem-owned file must be
// tracked (with a SHA256 pair) in `.al-folio-overrides.yml`; brand-new files
// that don't shadow anything (e.g. a site-specific include) need no tracking
// at all. Enforce exactly that instead.
const overridesYamlPath = "./.al-folio-overrides.yml";
const trackedOverridePaths = new Set();
if (exists(overridesYamlPath)) {
  const overridesYaml = read(overridesYamlPath);
  // Matches the 2-space-indented top-level keys under `overrides:`, e.g.
  // "  _layouts/about.liquid:" -- deliberately not a full YAML parse (no
  // YAML dependency in package.json); the file's shape is fixed and simple.
  const keyPattern = /^ {2}([^\s:][^:]*):\s*$/gm;
  let match;
  while ((match = keyPattern.exec(overridesYaml)) !== null) {
    trackedOverridePaths.add(match[1]);
  }
}

let gemOwnedFiles = null; // null = "couldn't determine", skip the shadow check rather than false-fail
try {
  const { execSync } = require("node:child_process");
  // `gem contents` reads the installed gem's own file manifest directly and
  // doesn't touch the Gemfile/Gemfile.lock at all -- deliberately NOT
  // `bundle show`, which resolves the *whole* bundle including unrelated git
  // dependencies (this repo's Gemfile pins `jekyll-terser` via :git, which
  // fails `bundle show` with "not yet checked out" on a machine that hasn't
  // run a full `bundle install` with network access -- a real environment
  // gap, unrelated to this check, that a bundler-based lookup would
  // needlessly inherit).
  const listing = execSync("gem contents al_folio_core", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString();
  gemOwnedFiles = new Set();
  for (const absPath of listing.split("\n")) {
    const trimmed = absPath.trim();
    const marker = trimmed.match(/[\\/](_includes|_layouts|_sass)[\\/]/);
    if (!marker) continue;
    gemOwnedFiles.add(trimmed.slice(trimmed.indexOf(marker[1])));
  }
} catch {
  // `gem` not resolvable in this environment -- skip the shadow check below
  // rather than failing the whole contract on an environment gap.
}

if (gemOwnedFiles !== null) {
  for (const dir of ["_includes", "_layouts", "_sass"]) {
    const absDir = path.join(root, dir);
    if (!fs.existsSync(absDir)) continue;
    const walkSite = (relDir) => {
      const absSubDir = path.join(root, relDir);
      for (const entry of fs.readdirSync(absSubDir, { withFileTypes: true })) {
        const relPath = path.join(relDir, entry.name);
        if (entry.isDirectory()) {
          walkSite(relPath);
        } else if (gemOwnedFiles.has(relPath) && !trackedOverridePaths.has(relPath)) {
          failures.push(
            `\`${relPath}\` shadows a file owned by al_folio_core but isn't tracked in .al-folio-overrides.yml -- run \`bundle exec al-folio upgrade overrides audit\` and commit the result.`
          );
        }
      }
    };
    walkSite(dir);
  }
}

for (const forbiddenGlobPath of [
  "assets/fonts/academicons.woff",
  "assets/fonts/academicons.ttf",
  "assets/fonts/scholar-icons.woff",
  "assets/fonts/scholar-icons.ttf",
]) {
  if (exists(forbiddenGlobPath)) {
    failures.push(`Starter must not own icon runtime artifact \`${forbiddenGlobPath}\`; icon ownership belongs to al_icons.`);
  }
}

for (const requiredPath of ["test/visual", "test/integration_plugin_toggles.sh", "test/integration_distill.sh"]) {
  if (!exists(requiredPath)) {
    failures.push(`Starter integration/visual contract missing required path: \`${requiredPath}\`.`);
  }
}

if (failures.length > 0) {
  console.error("Starter style contract check failed:");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log("Starter style contract check passed.");
