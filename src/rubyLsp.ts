import * as vscode from "vscode";
import { Range } from "vscode-languageclient/node";

import { Telemetry } from "./telemetry";
import DocumentProvider from "./documentProvider";
import { Workspace } from "./workspace";
import { Command } from "./common";

// The RubyLsp class represents an instance of the entire extension. This should only be instantiated once at the
// activation event. This class controls all of the existing workspaces, telemetry and handles all commands
export class RubyLsp {
  private readonly workspaces: Map<string, Workspace> = new Map();
  private readonly telemetry: Telemetry;
  private readonly context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.telemetry = new Telemetry(context);
    this.registerCommands(context);
  }

  // Activate the extension. This method should perform all actions necessary to start the extension, such as booting
  // all language servers for each existing workspace
  async activate() {
    await this.telemetry.sendConfigurationEvents();

    for (const workspaceFolder of vscode.workspace.workspaceFolders!) {
      const workspace = new Workspace(
        this.context,
        workspaceFolder,
        this.telemetry,
      );
      this.workspaces.set(workspaceFolder.uri.toString(), workspace);

      await workspace.start();
    }

    this.context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(
        "ruby-lsp",
        new DocumentProvider(),
      ),
    );
  }

  // Deactivate the extension, which should stop all language servers. Notice that this just stops anything that is
  // running, but doesn't dispose of existing instances
  async deactivate() {
    for (const workspace of this.workspaces.values()) {
      await workspace.stop();
    }
  }

  // Registers all extension commands. Commands can only be registered once, so this happens in the constructor. For
  // creating multiple instances in tests, the `RubyLsp` object should be disposed of after each test to prevent double
  // command register errors
  private registerCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.commands.registerCommand(Command.Update, async () => {
        const workspace = await this.showWorkspacePick();
        await workspace?.installOrUpdateServer();
      }),
      vscode.commands.registerCommand(Command.Start, async () => {
        const workspace = await this.showWorkspacePick();
        await workspace?.start();
      }),
      vscode.commands.registerCommand(Command.Restart, async () => {
        const workspace = await this.showWorkspacePick();
        await workspace?.restart();
      }),
      vscode.commands.registerCommand(Command.Stop, async () => {
        const workspace = await this.showWorkspacePick();
        await workspace?.stop();
      }),
      vscode.commands.registerCommand(
        Command.OpenLink,
        async (link: string) => {
          await this.telemetry.sendCodeLensEvent("link");
          vscode.env.openExternal(vscode.Uri.parse(link));
        },
      ),
      vscode.commands.registerCommand(
        Command.ShowSyntaxTree,
        this.showSyntaxTree.bind(this),
      ),
    );
  }

  // Displays a quick pick to select which workspace to perform an action on. For example, if multiple workspaces exist,
  // then we need to know which workspace to restart the language server on
  private async showWorkspacePick(): Promise<Workspace | undefined> {
    if (this.workspaces.size === 1) {
      return this.workspaces.values().next().value;
    }

    const workspaceFolder = await vscode.window.showWorkspaceFolderPick();

    if (!workspaceFolder) {
      return;
    }

    return this.workspaces.get(workspaceFolder.uri.toString());
  }

  // Show syntax tree command
  private async showSyntaxTree() {
    const activeEditor = vscode.window.activeTextEditor;

    if (activeEditor) {
      const document = activeEditor.document;

      if (document.languageId !== "ruby") {
        vscode.window.showErrorMessage("Show syntax tree: not a Ruby file");
        return;
      }

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);

      if (!workspaceFolder) {
        return;
      }

      const workspace = this.workspaces.get(workspaceFolder.uri.toString());

      const selection = activeEditor.selection;
      let range: Range | undefined;

      // Anchor is the first point and active is the last point in the selection. If both are the same, nothing is
      // selected
      if (!selection.active.isEqual(selection.anchor)) {
        // If you start selecting from below and go up, then the selection is reverted
        if (selection.isReversed) {
          range = Range.create(
            selection.active.line,
            selection.active.character,
            selection.anchor.line,
            selection.anchor.character,
          );
        } else {
          range = Range.create(
            selection.anchor.line,
            selection.anchor.character,
            selection.active.line,
            selection.active.character,
          );
        }
      }

      const response: { ast: string } | null | undefined =
        await workspace?.lspClient?.sendShowSyntaxTreeRequest(
          document.uri,
          range,
        );

      if (response) {
        const document = await vscode.workspace.openTextDocument(
          vscode.Uri.from({
            scheme: "ruby-lsp",
            path: "show-syntax-tree",
            query: response.ast,
          }),
        );

        await vscode.window.showTextDocument(document, {
          viewColumn: vscode.ViewColumn.Beside,
          preserveFocus: true,
        });
      }
    }
  }
}
