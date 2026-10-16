"""Exercise the real publisher against disposable local Git remotes."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

PUBLISHER = Path(__file__).with_name("publish-item-research.sh").resolve()
GIT = shutil.which("git")
DATA = "public/items/data"
OUTPUT = f"{DATA}/item-editorial-chunks/3.json"
PATHS = ["research-index.json", "research-chunks/a.json",
         "research-insight-index.json", "research-insight-chunks/a.json",
         "research-editorial-meta.json", "research-editorial-chunks/a.json",
         "item-editorial-meta.json", "item-editorial-chunks/3.json"]


class PublishTests(unittest.TestCase):
    def git(self, directory, *args):
        return subprocess.check_output([GIT, "-C", str(directory), *args],
                                       stderr=subprocess.DEVNULL, text=True).strip()

    def write(self, directory, name, content):
        p = directory / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)

    def commit(self, directory):
        self.git(directory, "add", ".")
        self.git(directory, "commit", "-qm", "fixture")

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.remote = self.root / "remote.git"
        self.repo = self.root / "verify"
        self.writer = self.root / "writer"
        subprocess.run([GIT, "init", "--bare", "-q", "--initial-branch=main", str(self.remote)], check=True)
        subprocess.run([GIT, "clone", "-q", str(self.remote), str(self.repo)], check=True, capture_output=True)
        self.git(self.repo, "config", "user.name", "Fixture")
        self.git(self.repo, "config", "user.email", "fixture@example.invalid")
        for p in PATHS:
            self.write(self.repo, f"{DATA}/{p}", "{}")
        self.write(self.repo, "source.txt", "initial")
        self.write(self.repo, "tools/migrate-research-insight-sidecars.mjs", "// fixture migration\n")
        self.write(self.repo, "tools/build-research-editorial-insights.mjs", "// fixture research generation\n")
        self.write(self.repo, "tools/build-item-editorial-insights.mjs", """
import fs from 'node:fs';
const p = 'public/items/data/item-editorial-chunks/3.json';
const old = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p)) : {};
fs.writeFileSync(p, JSON.stringify({...old, source: fs.readFileSync('source.txt', 'utf8')}));
fs.writeFileSync('public/items/data/item-editorial-chunks/new.json', '{}');
""")
        for name in ["check-item-research-data", "check-editorial-quality", "check-research-decision-insights"]:
            self.write(self.repo, f"tools/{name}.mjs", "import fs from 'node:fs'; if (fs.existsSync('invalid')) process.exit(1);\n")
        self.commit(self.repo)
        self.git(self.repo, "push", "-q", "origin", "main")
        subprocess.run([GIT, "clone", "-q", str(self.remote), str(self.writer)], check=True)
        self.git(self.writer, "config", "user.name", "Other writer")
        self.git(self.writer, "config", "user.email", "other@example.invalid")
        # Intercept the actual push, advancing main just before it to force a race.
        # All other git operations, including the final push, use real Git.
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.write(self.bin, "git", f"""#!/usr/bin/env bash
set -euo pipefail
if [[ " $* " == *' push '* ]]; then
  if [[ $TEST_RACE_MODE == reject ]]; then exit 1; fi
  if [[ $TEST_RACE_MODE == always || ( $TEST_RACE_MODE == once && ! -e $TEST_MARKER ) ]]; then
    touch "$TEST_MARKER"
    '{GIT}' -C "$TEST_WRITER" pull --ff-only -q
    printf '%s' advanced >> "$TEST_WRITER/source.txt"
    printf '%s' preserved > "$TEST_WRITER/unrelated.txt"
    printf '%s' '{{"manual":"preserved"}}' > "$TEST_WRITER/{OUTPUT}"
    '{GIT}' -C "$TEST_WRITER" add .
    '{GIT}' -C "$TEST_WRITER" commit -qm 'Concurrent data and source update'
    '{GIT}' -C "$TEST_WRITER" push -q origin main
  fi
fi
exec '{GIT}' "$@"
""")
        (self.bin / "git").chmod(0o755)

    def publish(self, mode="none"):
        env = dict(os.environ, PATH=f"{self.bin}:{os.environ['PATH']}",
                   TEST_RACE_MODE=mode, TEST_WRITER=str(self.writer),
                   TEST_MARKER=str(self.root / "raced"), PUBLISH_MAX_ATTEMPTS="2",
                   PUBLISH_RETRY_DELAY_SECONDS="0", PUBLISH_ARTIFACT_DIR=str(self.root / "results"))
        return subprocess.run(["bash", str(PUBLISHER)], cwd=self.repo, env=env,
                              text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

    def show(self, path):
        return self.git(self.remote, "show", f"main:{path}")

    def test_dirty_verification_and_new_files(self):
        self.write(self.repo, OUTPUT, "dirty verification output")
        self.write(self.repo, f"{DATA}/item-editorial-chunks/local.json", "untracked")
        result = self.publish()
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual((self.repo / OUTPUT).read_text(), "dirty verification output")
        self.assertEqual((self.repo / DATA / "item-editorial-chunks/local.json").read_text(), "untracked")
        self.assertEqual(self.show(f"{DATA}/item-editorial-chunks/new.json"), "{}")
        self.assertNotIn("local.json", self.git(self.remote, "ls-tree", "-r", "--name-only", "main"))

    def test_main_race_regenerates_and_preserves_other_writer(self):
        result = self.publish("once")
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("Publication attempt 2/2", result.stdout)
        self.assertIn('"source":"initialadvanced"', self.show(OUTPUT))
        self.assertIn('"manual":"preserved"', self.show(OUTPUT))
        self.assertEqual(self.show("unrelated.txt"), "preserved")
        self.assertTrue((self.root / "results/attempt-1.patch").stat().st_size)

    def test_no_change_does_not_commit(self):
        self.assertEqual(self.publish().returncode, 0)
        head = self.git(self.remote, "rev-parse", "main")
        result = self.publish()
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("already current", result.stdout)
        self.assertEqual(self.git(self.remote, "rev-parse", "main"), head)

    def test_validation_failure_never_pushes(self):
        self.write(self.writer, "invalid", "validation must fail")
        self.commit(self.writer)
        self.git(self.writer, "push", "-q", "origin", "main")
        head = self.git(self.remote, "rev-parse", "main")
        result = self.publish()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.git(self.remote, "rev-parse", "main"), head)
        self.assertTrue((self.root / "results/attempt-1.patch").stat().st_size)
        self.assertEqual(len(self.git(self.repo, "worktree", "list").splitlines()), 1)

    def test_repeated_races_fail_with_recoverable_patches(self):
        result = self.publish("always")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("exhausted 2 publication attempts", result.stdout)
        self.assertEqual(self.show("source.txt"), "initialadvancedadvanced")
        self.assertTrue((self.root / "results/attempt-2.patch").stat().st_size)

    def test_other_push_errors_are_not_masked_as_success(self):
        head = self.git(self.remote, "rev-parse", "main")
        result = self.publish("reject")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("without main advancing", result.stdout)
        self.assertEqual(self.git(self.remote, "rev-parse", "main"), head)


if __name__ == "__main__":
    unittest.main(verbosity=2)
