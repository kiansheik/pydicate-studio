# Reproducing the tested project

Studio's tested dependency pair includes unpublished changes. Checking out HEAD alone does **not** reproduce its grammar. [next-baseline.json](next-baseline.json) records the Python version, Git revisions, relevant file hashes and exact dirty patches. The patches preserve the actual grammatical changes; startup must not substitute a different analysis to work around a mismatch.

| Dependency | Recorded revision | Required local patch |
|---|---|---|
| oldtupicorpus | `292a28722a1790abf3f3b93083c29fbd47b4ffd0` | [oldtupicorpus.patch](dependency-patches/oldtupicorpus.patch) |
| nhe-enga | `348686045bf0791c847be3cba1b15eaae7312a11` | [nhe-enga.patch](dependency-patches/nhe-enga.patch) |
| Python | `3.14.4` | The observed interpreter is `/usr/local/bin/python3`; that path is informational, not portable configuration. |

The read-only checker defaults to the directory above this Studio checkout. `PYDICATE_PROJECT_PARENT` and `--parent` select another directory containing both clones:

```sh
python3 -B scripts/check-project.py
python3 -B scripts/check-project.py --parent /path/containing/both/clones
python3 -B scripts/check-project.py --json
```

Exit `0` means the recorded Python version, revisions, 130 captured files and both dirty patches match. Exit `1` reports changed/missing/extra files, a changed revision or patch, a different Python version, or unavailable clones. Exit `2` means the manifest itself could not be read or understood. The checker also verifies the clean recorded-HEAD versions of `tests/__init__.py` and `tests/ground_truth_cases.py`, which the authoritative corpus review service imports. It never installs dependencies, edits files, regenerates targets or repairs a working tree.

The compiler/platform suffix of `sys.version` is displayed but not required to match the captured macOS build. Other Python versions may work, but have not reproduced this exact recorded runtime. Intentional daily corpus edits will make this baseline check fail until they are independently reviewed; a mismatch does not erase or invalidate the contributor's work.

## Create separate baseline clones

Run these commands from the Studio root, using a **new** destination directory. They are not instructions to reset existing authoring clones. Access to the two configured GitHub repositories and the recorded revisions is required.

```sh
export PYDICATE_PROJECT_PARENT="$HOME/pydicate-baseline"
mkdir -p "$PYDICATE_PROJECT_PARENT"

git clone https://github.com/kiansheik/oldtupicorpus.git "$PYDICATE_PROJECT_PARENT/oldtupicorpus"
git clone https://github.com/kiansheik/nhe-enga.git "$PYDICATE_PROJECT_PARENT/nhe-enga"

git -C "$PYDICATE_PROJECT_PARENT/oldtupicorpus" checkout --detach 292a28722a1790abf3f3b93083c29fbd47b4ffd0
git -C "$PYDICATE_PROJECT_PARENT/nhe-enga" checkout --detach 348686045bf0791c847be3cba1b15eaae7312a11

git -C "$PYDICATE_PROJECT_PARENT/oldtupicorpus" apply --check "$PWD/docs/design/dependency-patches/oldtupicorpus.patch"
git -C "$PYDICATE_PROJECT_PARENT/oldtupicorpus" apply "$PWD/docs/design/dependency-patches/oldtupicorpus.patch"
git -C "$PYDICATE_PROJECT_PARENT/nhe-enga" apply --check "$PWD/docs/design/dependency-patches/nhe-enga.patch"
git -C "$PYDICATE_PROJECT_PARENT/nhe-enga" apply "$PWD/docs/design/dependency-patches/nhe-enga.patch"

python3 -B scripts/check-project.py
```

Use Python 3.14.4 for the exact baseline above. `PYDICATE_PYTHON` selects the executable used by Electron; the checker uses the Python executable that launches it. From the Studio root:

```sh
export PYDICATE_PYTHON=python3
npm ci
npm run build
npm start
```

The selected project and passage are restored from Studio's saved session. On an existing profile, use **Abrir projeto** to select the newly prepared parent directory; `PYDICATE_PROJECT_PARENT` supplies the default when no previous selection exists. The initial startup also requires a supported Node release from `package.json`. PDF witness files and provider authentication are separate configuration; they are not embedded in this dependency baseline.

For audit/test commands, the same parent can be selected explicitly:

```sh
python3 -B python/audit_araujo.py --parent "$PYDICATE_PROJECT_PARENT"
python3 -B -m unittest discover -s python/tests -v
```

The authoring integration tests resolve `PYDICATE_PROJECT_PARENT`, falling back to the Studio checkout's parent. They copy corpus files into a disposable directory and never apply their edits or approvals to the selected historical corpus.

## Evidence from this implementation

Verified locally on September 17, 2026:

- `python3 -B scripts/check-project.py`: exit `0`; Python 3.14.4, 17 captured corpus files, 113 captured engine files, recorded revisions and exact patches match the installed projects.
- Exporting each recorded clean revision with `git archive`, running `git apply --check` and applying its captured patch in a disposable directory reproduced **all 130 recorded file hashes**, with zero differences.
- Separate disposable Git checkouts reconstructed from those revisions and patches passed the complete checker with exit `0`, including the two review support files.
- Appending a comment to the disposable Araújo source produced exit `1` with its exact filename, changed SHA-256 and dirty-patch mismatch. Pointing to absent clones also produced exit `1`.
- A focused source-save regression verified that multiline scalar metadata is rejected without a file write and remains saveable as a draft. Multiline notes retain separate supported `@note` directives.

No network clone, upstream checkout, upstream index change or historical-source write was performed for these checks. Fresh remote access and installation on another OS remain unverified. The optional `.local/dependencies/*-relevant.tar.gz` archives are local backups of captured relevant files; they are gitignored and are **not complete repositories or bundled installers**. The checked-in HEAD identifiers and patches are the portable reconstruction instructions.
