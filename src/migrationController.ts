import * as vscode from "vscode";

import { Telemetry } from "./telemetry";
import { Workspace } from "./workspace";

export class MigrationController {
  private terminal: vscode.Terminal | undefined;
  private readonly telemetry: Telemetry;
  private readonly currentWorkspace: () => Workspace | undefined;

  constructor(
    _context: vscode.ExtensionContext,
    telemetry: Telemetry,
    currentWorkspace: () => Workspace | undefined,
  ) {
    this.telemetry = telemetry;
    this.currentWorkspace = currentWorkspace;

    vscode.window.onDidCloseTerminal((terminal: vscode.Terminal): void => {
      if (terminal === this.terminal) this.terminal = undefined;
    });
  }

  async runMigrationInTerminal(command?: string) {
    // eslint-disable-next-line no-param-reassign
    command ??= "bin/rails db:migrate";

    if (this.terminal === undefined) {
      this.terminal = this.getTerminal();
    }

    this.terminal.show();
    this.terminal.sendText(command);

    const workspace = this.currentWorkspace();

    if (workspace?.lspClient?.serverVersion) {
      await this.telemetry.sendCodeLensEvent(
        "migrate_in_terminal",
        workspace.lspClient.serverVersion,
      );
    }
  }

  // Get an existing terminal or create a new one. For multiple workspaces, it's important to create a new terminal for
  // each workspace because they might be using different Ruby versions. If there's no workspace, we fallback to a
  // generic name
  private getTerminal() {
    const workspace = this.currentWorkspace();
    const name = workspace
      ? `${workspace.workspaceFolder.name}: migration`
      : "Ruby LSP: migration";

    const previousTerminal = vscode.window.terminals.find(
      (terminal) => terminal.name === name,
    );

    return previousTerminal
      ? previousTerminal
      : vscode.window.createTerminal({
          name,
        });
  }
}
