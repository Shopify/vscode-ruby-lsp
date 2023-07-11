import * as vscode from "vscode";

import { Ruby, VersionManager } from "./ruby";
import ServerExtension from "./serverExtension";

export enum ServerState {
  Starting = "Starting",
  Running = "Running",
  Stopped = "Stopped",
  Error = "Error",
}

// Lists every Command in the Ruby LSP
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
  ManageExtensions = "rubyLsp.manageExtensions",
  RunTest = "rubyLsp.runTest",
  RunTestInTerminal = "rubyLsp.runTestInTerminal",
  DebugTest = "rubyLsp.debugTest",
  OpenLink = "rubyLsp.openLink",
  ShowSyntaxTree = "rubyLsp.showSyntaxTree",
}

const STOPPED_SERVER_OPTIONS = [
  { label: "Ruby LSP: Start", description: Command.Start },
  { label: "Ruby LSP: Restart", description: Command.Restart },
];

const STARTED_SERVER_OPTIONS = [
  { label: "Ruby LSP: Stop", description: Command.Stop },
  { label: "Ruby LSP: Restart", description: Command.Restart },
];

export interface ClientInterface {
  context: vscode.ExtensionContext;
  ruby: Ruby;
  state: ServerState;
  formatter: string;
  serverExtensions: ServerExtension[];
}

export abstract class StatusItem {
  public item: vscode.LanguageStatusItem;
  protected context: vscode.ExtensionContext;
  protected client: ClientInterface;

  constructor(id: string, client: ClientInterface) {
    this.item = vscode.languages.createLanguageStatusItem(id, {
      scheme: "file",
      language: "ruby",
    });
    this.context = client.context;
    this.client = client;
    this.registerCommand();
  }

  abstract refresh(): void;
  abstract registerCommand(): void;

  dispose(): void {
    this.item.dispose();
  }
}

export class RubyVersionStatus extends StatusItem {
  constructor(client: ClientInterface) {
    super("rubyVersion", client);
    this.item.name = "Ruby LSP Status";
    this.item.command = {
      title: "Change version manager",
      command: Command.SelectVersionManager,
    };

    if (client.ruby.error) {
      this.item.text = "Failed to activate Ruby";
      this.item.severity = vscode.LanguageStatusSeverity.Error;
    } else {
      this.item.text = `Using Ruby ${client.ruby.rubyVersion} with ${client.ruby.versionManager}`;
      this.item.severity = vscode.LanguageStatusSeverity.Information;
    }
  }

  refresh(): void {
    if (this.client.ruby.error) {
      this.item.text = "Failed to activate Ruby";
      this.item.severity = vscode.LanguageStatusSeverity.Error;
    } else {
      this.item.text = `Using Ruby ${this.client.ruby.rubyVersion} with ${this.client.ruby.versionManager}`;
      this.item.severity = vscode.LanguageStatusSeverity.Information;
    }
  }

  registerCommand(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        Command.SelectVersionManager,
        async () => {
          const configuration = vscode.workspace.getConfiguration("rubyLsp");
          const options = Object.values(VersionManager);
          const manager = await vscode.window.showQuickPick(options, {
            placeHolder: `Current: ${configuration.get("rubyVersionManager")}`,
          });

          if (manager !== undefined) {
            configuration.update("rubyVersionManager", manager, true, true);
          }
        }
      )
    );
  }
}

export class ServerStatus extends StatusItem {
  constructor(client: ClientInterface) {
    super("server", client);
    this.item.name = "Ruby LSP Status";
    this.item.text = "Ruby LSP: Starting";
    this.item.severity = vscode.LanguageStatusSeverity.Information;
    this.item.command = {
      title: "Configure",
      command: Command.ServerOptions,
      arguments: [STARTED_SERVER_OPTIONS],
    };
  }

  refresh(): void {
    switch (this.client.state) {
      case ServerState.Running: {
        this.item.text = "Ruby LSP: Running";
        this.item.command!.arguments = [STARTED_SERVER_OPTIONS];
        this.item.severity = vscode.LanguageStatusSeverity.Information;
        break;
      }
      case ServerState.Starting: {
        this.item.text = "Ruby LSP: Starting";
        this.item.command!.arguments = [STARTED_SERVER_OPTIONS];
        this.item.severity = vscode.LanguageStatusSeverity.Information;
        break;
      }
      case ServerState.Stopped: {
        this.item.text = "Ruby LSP: Stopped";
        this.item.command!.arguments = [STOPPED_SERVER_OPTIONS];
        this.item.severity = vscode.LanguageStatusSeverity.Information;
        break;
      }
      case ServerState.Error: {
        this.item.text = "Ruby LSP: Error";
        this.item.command!.arguments = [STOPPED_SERVER_OPTIONS];
        this.item.severity = vscode.LanguageStatusSeverity.Error;
        break;
      }
    }
  }

  registerCommand(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        Command.ServerOptions,
        async (options: [{ label: string; description: string }]) => {
          const result = await vscode.window.showQuickPick(options, {
            placeHolder: "Select server action",
          });

          if (result !== undefined)
            await vscode.commands.executeCommand(result.description);
        }
      )
    );
  }
}

export class ExperimentalFeaturesStatus extends StatusItem {
  constructor(client: ClientInterface) {
    super("experimentalFeatures", client);
    const experimentalFeaturesEnabled =
      vscode.workspace
        .getConfiguration("rubyLsp")
        .get("enableExperimentalFeatures") === true;
    const message = experimentalFeaturesEnabled
      ? "Experimental features enabled"
      : "Experimental features disabled";

    this.item.name = "Experimental features";
    this.item.text = message;
    this.item.command = {
      title: experimentalFeaturesEnabled ? "Disable" : "Enable",
      command: Command.ToggleExperimentalFeatures,
    };
  }

  refresh(): void {}

  registerCommand(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        Command.ToggleExperimentalFeatures,
        async () => {
          const lspConfig = vscode.workspace.getConfiguration("rubyLsp");
          const experimentalFeaturesEnabled = lspConfig.get(
            "enableExperimentalFeatures"
          );
          await lspConfig.update(
            "enableExperimentalFeatures",
            !experimentalFeaturesEnabled,
            true,
            true
          );
          const message = experimentalFeaturesEnabled
            ? "Experimental features disabled"
            : "Experimental features enabled";
          this.item.text = message;
          this.item.command!.title = experimentalFeaturesEnabled
            ? "Enable"
            : "Disable";
        }
      )
    );
  }
}

export class YjitStatus extends StatusItem {
  constructor(client: ClientInterface) {
    super("yjit", client);

    this.item.name = "YJIT";
    this.refresh();
  }

  refresh(): void {
    const useYjit: boolean | undefined = vscode.workspace
      .getConfiguration("rubyLsp")
      .get("yjit");

    if (useYjit && this.client.ruby.supportsYjit) {
      this.item.text = "YJIT enabled";

      this.item.command = {
        title: "Disable",
        command: Command.ToggleYjit,
      };
    } else {
      this.item.text = "YJIT disabled";

      if (this.client.ruby.supportsYjit) {
        this.item.command = {
          title: "Enable",
          command: Command.ToggleYjit,
        };
      }
    }
  }

  registerCommand(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand(Command.ToggleYjit, () => {
        const lspConfig = vscode.workspace.getConfiguration("rubyLsp");
        const yjitEnabled = lspConfig.get("yjit");
        lspConfig.update("yjit", !yjitEnabled, true, true);
        this.item.text = yjitEnabled ? "YJIT disabled" : "YJIT enabled";
        this.item.command!.title = yjitEnabled ? "Enable" : "Disable";
      })
    );
  }
}

export class FeaturesStatus extends StatusItem {
  private descriptions: { [key: string]: string } = {};

  constructor(client: ClientInterface) {
    super("features", client);
    this.item.name = "Ruby LSP Features";
    this.item.command = {
      title: "Manage",
      command: Command.ToggleFeatures,
    };
    this.refresh();

    // Extract feature descriptions from our package.json
    const enabledFeaturesProperties =
      vscode.extensions.getExtension("Shopify.ruby-lsp")!.packageJSON
        .contributes.configuration.properties["rubyLsp.enabledFeatures"]
        .properties;

    Object.entries(enabledFeaturesProperties).forEach(
      ([key, value]: [string, any]) => {
        this.descriptions[key] = value.description;
      }
    );
  }

  refresh(): void {
    const configuration = vscode.workspace.getConfiguration("rubyLsp");
    const features: { [key: string]: boolean } =
      configuration.get("enabledFeatures")!;
    const enabledFeatures = Object.keys(features).filter(
      (key) => features[key]
    );

    this.item.text = `${enabledFeatures.length}/${
      Object.keys(features).length
    } features enabled`;
  }

  registerCommand(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand(Command.ToggleFeatures, async () => {
        const configuration = vscode.workspace.getConfiguration("rubyLsp");
        const features: { [key: string]: boolean } =
          configuration.get("enabledFeatures")!;
        const allFeatures = Object.keys(features);
        const options: vscode.QuickPickItem[] = allFeatures.map((label) => {
          return {
            label,
            picked: features[label],
            description: this.descriptions[label],
          };
        });

        const toggledFeatures = await vscode.window.showQuickPick(options, {
          canPickMany: true,
          placeHolder: "Select the features you would like to enable",
        });

        if (toggledFeatures !== undefined) {
          // The `picked` property is only used to determine if the checkbox is checked initially. When we receive the
          // response back from the QuickPick, we need to use inclusion to check if the feature was selected
          allFeatures.forEach((feature) => {
            features[feature] = toggledFeatures.some(
              (selected) => selected.label === feature
            );
          });

          await vscode.workspace
            .getConfiguration("rubyLsp")
            .update("enabledFeatures", features, true, true);
        }
      })
    );
  }
}

export class FormatterStatus extends StatusItem {
  constructor(client: ClientInterface) {
    super("formatter", client);

    this.item.name = "Formatter";
    this.item.command = {
      title: "Help",
      command: Command.FormatterHelp,
    };
    this.refresh();
  }

  refresh(): void {
    this.item.text = `Using formatter: ${this.client.formatter}`;
  }

  registerCommand(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand(Command.FormatterHelp, () => {
        vscode.env.openExternal(
          vscode.Uri.parse(
            "https://github.com/Shopify/vscode-ruby-lsp#formatting"
          )
        );
      })
    );
  }
}

export class ServerExtensionsStatus extends StatusItem {
  constructor(client: ClientInterface) {
    super("extensions", client);

    this.item.name = "Server extensions";
    this.item.command = {
      title: "Manage",
      command: Command.ManageExtensions,
    };
    this.refresh();
  }

  refresh(): void {
    const erroredExtensions = this.client.serverExtensions.filter((ext) =>
      ext.errored()
    );

    this.item.text = `${
      this.client.serverExtensions.filter((ext) => ext.activated).length
    } activated extensions`;

    if (erroredExtensions.length > 0) {
      this.item.severity = vscode.LanguageStatusSeverity.Error;
    } else {
      this.item.severity = vscode.LanguageStatusSeverity.Information;
    }
  }

  registerCommand(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand(Command.ManageExtensions, async () => {
        const options: vscode.QuickPickItem[] = [];

        this.client.serverExtensions
          .filter((ext) => !ext.errored())
          .forEach((ext) => {
            options.push({
              label: ext.name,
              picked: ext.activated,
              description: "Activated successfully",
            });
          });

        options.push({
          label: "Extensions with errors",
          kind: vscode.QuickPickItemKind.Separator,
        });

        this.client.serverExtensions
          .filter((ext) => ext.errored())
          .forEach((ext) => {
            options.push({
              label: ext.name,
              picked: ext.activated,
              description: `Failed to activate: ${ext.errors.join(", ")}`,
            });
          });

        const toggledExtensions = await vscode.window.showQuickPick(options, {
          canPickMany: true,
          placeHolder: "Activate or deactivate server extensions",
        });

        if (toggledExtensions !== undefined) {
          this.client.serverExtensions.forEach((ext) => {
            ext.activated = toggledExtensions.some(
              (selected) => selected.label === ext.name
            );
          });
        }
      })
    );
  }
}

export class StatusItems {
  private items: StatusItem[] = [];

  constructor(client: ClientInterface) {
    this.items = [
      new RubyVersionStatus(client),
      new ServerStatus(client),
      new ExperimentalFeaturesStatus(client),
      new YjitStatus(client),
      new FeaturesStatus(client),
      new FormatterStatus(client),
      new ServerExtensionsStatus(client),
    ];
  }

  public refresh() {
    this.items.forEach((item) => item.refresh());
  }
}
