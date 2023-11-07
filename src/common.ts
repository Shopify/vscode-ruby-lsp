import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";

import * as vscode from "vscode";

export enum Command {
  Start = "rubyLsp.start",
  Stop = "rubyLsp.stop",
  Restart = "rubyLsp.restart",
  Update = "rubyLsp.update",
  ToggleExperimentalFeatures = "rubyLsp.toggleExperimentalFeatures",
  ServerOptions = "rubyLsp.serverOptions",
  ToggleYjit = "rubyLsp.toggleYjit",
  SelectVersionManager = "rubyLsp.selectRubyVersionManager",
  ToggleFeatures = "rubyLsp.toggleFeatures",
  FormatterHelp = "rubyLsp.formatterHelp",
  RunTest = "rubyLsp.runTest",
  RunTestInTerminal = "rubyLsp.runTestInTerminal",
  DebugTest = "rubyLsp.debugTest",
  OpenLink = "rubyLsp.openLink",
  ShowSyntaxTree = "rubyLsp.showSyntaxTree",
}

export const asyncExec = promisify(exec);
export const LSP_NAME = "Ruby LSP";
export const LOG_CHANNEL = vscode.window.createOutputChannel(LSP_NAME, {
  log: true,
});

export async function pathExists(
  path: string,
  mode = fs.constants.R_OK,
): Promise<boolean> {
  try {
    await fs.access(path, mode);
    return true;
  } catch (error: any) {
    return false;
  }
}
