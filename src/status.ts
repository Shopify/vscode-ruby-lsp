import * as vscode from "vscode";
import { Disposable } from "vscode-languageclient";

import { Command, ServerState, VersionManager } from "./enums";
import { Ruby } from "./ruby";

const STOPPED_SERVER_OPTIONS: vscode.QuickPickItem[] = [
  { label: "Ruby LSP: Start", description: Command.Start },
  { label: "Ruby LSP: Restart", description: Command.Restart },
];

const STARTED_SERVER_OPTIONS: vscode.QuickPickItem[] = [
  { label: "Ruby LSP: Stop", description: Command.Stop },
  { label: "Ruby LSP: Restart", description: Command.Restart },
];

export interface ClientInterface {
  context: vscode.ExtensionContext;
  ruby: Ruby;
  state: ServerState;
  onStateChange: vscode.Event<ClientInterface>;
}

export abstract class StatusItem {
  public item: vscode.LanguageStatusItem;
  protected command?: Disposable;

  constructor(id: string, context: vscode.ExtensionContext) {
    this.item = vscode.languages.createLanguageStatusItem(id, {
      scheme: "file",
      language: "ruby",
    });
    if (this.command) {
      context.subscriptions.push(this.command);
    }
  }

  abstract refresh(client: ClientInterface): void;

  dispose(): void {
    this.item.dispose();
  }
}

export class RubyVersionStatus extends StatusItem {
  command = vscode.commands.registerCommand(
    Command.SelectVersionManager,
    this.selectVersionManager,
    this
  );

  constructor(context: vscode.ExtensionContext) {
    super("rubyVersion", context);
    this.item.name = "Ruby LSP Status";
    this.item.command = {
      title: "Change version manager",
      command: Command.SelectVersionManager,
    };
  }

  refresh(client: ClientInterface): void {
    if (client.ruby.error) {
      this.item.text = "Failed to activate Ruby";
      this.item.severity = vscode.LanguageStatusSeverity.Error;
    } else {
      this.item.text = `Using Ruby ${client.ruby.rubyVersion}`;
      this.item.severity = vscode.LanguageStatusSeverity.Information;
    }
  }

  private async selectVersionManager() {
    const options = Object.values(VersionManager);
    const manager = await vscode.window.showQuickPick(options);

    if (manager !== undefined) {
      vscode.workspace
        .getConfiguration("rubyLsp")
        .update("rubyVersionManager", manager, true, true);
    }
  }
}

export class ServerStatus extends StatusItem {
  command = vscode.commands.registerCommand(
    Command.ServerOptions,
    this.serverOptions,
    this
  );

  constructor(context: vscode.ExtensionContext) {
    super("server", context);
    this.item.name = "Ruby LSP Status";
    this.item.text = "Ruby LSP: Starting";
    this.item.severity = vscode.LanguageStatusSeverity.Information;
    this.item.command = {
      title: "Configure",
      command: Command.ServerOptions,
      arguments: [STARTED_SERVER_OPTIONS],
    };
  }

  refresh(client: ClientInterface): void {
    switch (client.state) {
      case ServerState.Running:
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

  private async serverOptions(options: vscode.QuickPickItem[]) {
    const result = await vscode.window.showQuickPick(options, {
      placeHolder: "Select server action",
    });

    if (result !== undefined) {
      await vscode.commands.executeCommand(result.description!);
    }
  }
}

export class ExperimentalFeaturesStatus extends StatusItem {
  command = vscode.commands.registerCommand(
    Command.ToggleExperimentalFeatures,
    this.toggleExperimentalFeatures,
    this
  );

  constructor(context: vscode.ExtensionContext) {
    super("experimentalFeatures", context);
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

  private async toggleExperimentalFeatures() {
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
}

export class YjitStatus extends StatusItem {
  command = vscode.commands.registerCommand(
    Command.ToggleYjit,
    this.toggleYjit,
    this
  );

  constructor(context: vscode.ExtensionContext) {
    super("yjit", context);

    this.item.name = "YJIT";
  }

  refresh(client: ClientInterface): void {
    const useYjit: boolean | undefined = vscode.workspace
      .getConfiguration("rubyLsp")
      .get("yjit");

    if (useYjit && client.ruby.supportsYjit) {
      this.item.text = "YJIT enabled";

      this.item.command = {
        title: "Disable",
        command: Command.ToggleYjit,
      };
    } else {
      this.item.text = "YJIT disabled";

      if (client.ruby.supportsYjit) {
        this.item.command = {
          title: "Enable",
          command: Command.ToggleYjit,
        };
      }
    }
  }

  private async toggleYjit() {
    const lspConfig = vscode.workspace.getConfiguration("rubyLsp");
    const yjitEnabled = lspConfig.get("yjit");
    lspConfig.update("yjit", !yjitEnabled, true, true);
    this.item.text = yjitEnabled ? "YJIT disabled" : "YJIT enabled";
    this.item.command!.title = yjitEnabled ? "Enable" : "Disable";
  }
}

export class FeaturesStatus extends StatusItem {
  command = vscode.commands.registerCommand(
    Command.ToggleFeatures,
    this.toggleFeatures,
    this
  );

  private descriptions: { [key: string]: string } = {};

  constructor(context: vscode.ExtensionContext) {
    super("features", context);
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

  private async toggleFeatures() {
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
  }
}

export class StatusItems {
  private items: StatusItem[] = [];

  constructor(client: ClientInterface) {
    this.items = [
      new RubyVersionStatus(client.context),
      new ServerStatus(client.context),
      new ExperimentalFeaturesStatus(client.context),
      new YjitStatus(client.context),
      new FeaturesStatus(client.context),
    ];
    this.refresh(client);
    client.onStateChange(this.refresh, this);
  }

  public refresh(client: ClientInterface): void {
    this.items.forEach((item) => item.refresh(client));
  }
}
