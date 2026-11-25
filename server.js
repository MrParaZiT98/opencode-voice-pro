import { Plugin } from "@opencode/plugin";

export default Plugin.define({
  id: "opencode-voice-pro",
  async setup() {
    // Desktop GUI functionality is provided by ./gui-experimental.
    // This server entry establishes a stable plugin identity for its IPC contract.
    return () => {};
  },
});
