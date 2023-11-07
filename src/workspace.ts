import fs from "fs/promises";

import * as vscode from "vscode";

import { Ruby } from "./ruby";
import { Telemetry } from "./telemetry";
import { TestController } from "./testController";
import Client from "./client";
import { Debugger } from "./debugger";
import { asyncExec, LOG_CHANNEL } from "./common";

export class Workspace {
  public lspClient?: Client;
  private readonly workingDirectory: string;
  private readonly ruby: Ruby;
  private readonly testController: TestController;
  private readonly debug: Debugger;
  private readonly context: vscode.ExtensionContext;
  private readonly telemetry: Telemetry;

  constructor(
    context: vscode.ExtensionContext,
    workspaceFolder: vscode.WorkspaceFolder,
    telemetry: Telemetry,
  ) {
    this.context = context;
    this.workingDirectory = workspaceFolder.uri.fsPath;
    this.telemetry = telemetry;
    this.ruby = new Ruby(context, workspaceFolder);
    this.testController = new TestController(
      context,
      workspaceFolder,
      this.ruby,
      telemetry,
    );

    this.debug = new Debugger(context, this.ruby, workspaceFolder);
    this.registerRestarts(context);
  }

  async start() {
    await this.ruby.activateRuby();

    if (this.ruby.error) {
      // this.state = ServerState.Error;
      return;
    }

    try {
      await fs.access(this.workingDirectory, fs.constants.W_OK);
    } catch (error: any) {
      // this.state = ServerState.Error;

      vscode.window.showErrorMessage(
        `Directory ${this.workingDirectory} is not writable. The Ruby LSP server needs to be able to create a .ruby-lsp
        directory to function appropriately. Consider switching to a directory for which VS Code has write permissions`,
      );

      return;
    }

    try {
      await this.installOrUpdateServer();
    } catch (error: any) {
      // this.state = ServerState.Error;
      vscode.window.showErrorMessage(
        `Failed to setup the bundle: ${error.message}. \
            See [Troubleshooting](https://github.com/Shopify/vscode-ruby-lsp#troubleshooting) for instructions`,
      );

      return;
    }

    // The `start` method can be invoked through commands - even if there's an LSP client already running. We need to
    // ensure that the existing client for this workspace has been stopped and disposed of before we create a new one
    if (this.lspClient) {
      await this.lspClient.stop();
      await this.lspClient.dispose();
    }

    this.lspClient = new Client(
      this.context,
      this.telemetry,
      this.ruby,
      this.testController,
      this.workingDirectory,
    );

    try {
      await this.lspClient.start();
      await this.lspClient.performAfterStart();
    } catch (error: any) {
      // this.state = ServerState.Error;
      LOG_CHANNEL.error(`Error restarting the server: ${error.message}`);
    }

    // Push the LSP client as a subcription so that it gets automatically disposed upon deactivation
    this.context.subscriptions.push(this.lspClient);
  }

  async stop() {
    await this.lspClient?.stop();
  }

  async restart() {
    await this.lspClient?.restart();
  }

  dispose() {
    this.debug.dispose();
    this.testController.dispose();
  }

  // Install or update the `ruby-lsp` gem globally with `gem install ruby-lsp` or `gem update ruby-lsp`. We only try to
  // update on a daily basis, not every time the server boots
  async installOrUpdateServer(): Promise<void> {
    // If there's a user configured custom bundle to run the LSP, then we do not perform auto-updates and let the user
    // manage that custom bundle themselves
    const customBundle: string = vscode.workspace
      .getConfiguration("rubyLsp")
      .get("bundleGemfile")!;

    if (customBundle.length > 0) {
      return;
    }

    const oneDayInMs = 24 * 60 * 60 * 1000;
    const lastUpdatedAt: number | undefined = this.context.workspaceState.get(
      "rubyLsp.lastGemUpdate",
    );

    const { stderr } = await asyncExec("gem list ruby-lsp 1>&2", {
      cwd: this.workingDirectory,
      env: this.ruby.env,
    });

    // If the gem is not yet installed, install it
    if (!stderr.includes("ruby-lsp")) {
      await asyncExec("gem install ruby-lsp", {
        cwd: this.workingDirectory,
        env: this.ruby.env,
      });

      this.context.workspaceState.update("rubyLsp.lastGemUpdate", Date.now());
      return;
    }

    // If we haven't updated the gem in the last 24 hours, update it
    if (
      lastUpdatedAt === undefined ||
      Date.now() - lastUpdatedAt > oneDayInMs
    ) {
      try {
        await asyncExec("gem update ruby-lsp", {
          cwd: this.workingDirectory,
          env: this.ruby.env,
        });
        this.context.workspaceState.update("rubyLsp.lastGemUpdate", Date.now());
      } catch (error) {
        // If we fail to update the global installation of `ruby-lsp`, we don't want to prevent the server from starting
        LOG_CHANNEL.error(`Failed to update global ruby-lsp gem: ${error}`);
      }
    }
  }

  private registerRestarts(context: vscode.ExtensionContext) {
    this.createRestartWatcher(context, "Gemfile.lock");
    this.createRestartWatcher(context, "gems.locked");
    this.createRestartWatcher(context, "**/.rubocop.yml");

    // If a configuration that affects the Ruby LSP has changed, update the client options using the latest
    // configuration and restart the server
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration("rubyLsp")) {
        // Re-activate Ruby if the version manager changed
        if (
          event.affectsConfiguration("rubyLsp.rubyVersionManager") ||
          event.affectsConfiguration("rubyLsp.bundleGemfile") ||
          event.affectsConfiguration("rubyLsp.customRubyCommand")
        ) {
          await this.ruby.activateRuby();
        }

        await this.lspClient?.restart();
      }
    });
  }

  private createRestartWatcher(
    context: vscode.ExtensionContext,
    pattern: string,
  ) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.workingDirectory, pattern),
    );
    context.subscriptions.push(watcher);

    watcher.onDidChange(this.restart.bind(this));
    watcher.onDidCreate(this.restart.bind(this));
    watcher.onDidDelete(this.restart.bind(this));
  }
}
