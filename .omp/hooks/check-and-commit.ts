import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

export default function checkAndCommit(pi: HookAPI): void {
  pi.on("turn_end", async (_event, ctx) => {
    const cwd = ctx.cwd ?? process.cwd();

    // Step 1: run tsc type-check on receiver (fastest, covers 90% of changes)
    const tscResult = await pi.exec("cd receiver && npx tsc -b", { cwd });
    if (tscResult.exitCode !== 0) {
      // Type errors — don't commit, just report
      if (ctx.hasUI) {
        ctx.ui.setStatus("check", "tsc failed — commit skipped");
      }
      return;
    }

    // Step 2: quick syntax sanity via git diff stat
    const diffStat = await pi.exec("git diff --stat HEAD", { cwd });
    if (!diffStat.stdout.trim()) {
      // No changes to commit
      if (ctx.hasUI) {
        ctx.ui.setStatus("check", "clean: nothing to commit");
      }
      return;
    }

    // Step 3: auto-commit with a concise message
    const changedFiles = diffStat.stdout
      .split("\n")
      .filter(Boolean)
      .map((l: string) => l.split("|")[0].trim())
      .slice(0, 3)
      .join(", ");

    const msg = `feat: ${changedFiles}${changedFiles.includes(",") ? "" : ""}`;
    await pi.exec("git add -A", { cwd });
    const commitResult = await pi.exec(`git commit -m "${msg}"`, { cwd });

    if (ctx.hasUI) {
      if (commitResult.exitCode === 0) {
        ctx.ui.setStatus("check", `committed: ${msg}`);
      } else {
        ctx.ui.setStatus("check", "commit failed");
      }
    }
  });
}
