import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

export default function tscCheck(pi: HookAPI): void {
  pi.on("turn_end", async (_event, ctx) => {
    const cwd = ctx.cwd ?? process.cwd();

    // Run tsc type-check on receiver (fast incremental, covers most changes)
    const result = await pi.exec("cd receiver && npx tsc -b", { cwd });

    if (ctx.hasUI) {
      if (result.exitCode !== 0) {
        ctx.ui.setStatus("tsc", "tsc failed — check errors above");
      } else {
        ctx.ui.setStatus("tsc", "tsc passed");
      }
    }
  });
}
