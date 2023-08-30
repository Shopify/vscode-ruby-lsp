import * as assert from "assert";

import * as vscode from "vscode";
import { beforeEach, afterEach } from "mocha";

import { Ruby } from "../../ruby";
import {
  RubyVersionStatus,
  ServerStatus,
  ExperimentalFeaturesStatus,
  Command,
  YjitStatus,
  StatusItem,
  ServerState,
  ClientInterface,
  FeaturesStatus,
  FormatterStatus,
} from "../../status";

suite("StatusItems", () => {
  let ruby: Ruby;
  let context: vscode.ExtensionContext;
  let status: StatusItem;
  let client: ClientInterface;
  let formatter: string;

  beforeEach(() => {
    context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
  });

  afterEach(() => {
    context.subscriptions.forEach((subscription) => {
      subscription.dispose();
    });
    status.dispose();
  });

  suite("RubyVersionStatus", () => {
    beforeEach(() => {
      ruby = { rubyVersion: "3.2.0", versionManager: "shadowenv" } as Ruby;
      client = {
        context,
        ruby,
        state: ServerState.Running,
        formatter: "none",
        serverVersion: "1.0.0",
      };
      status = new RubyVersionStatus(client);
    });

    test("Status is initialized with the right values", () => {
      assert.strictEqual(status.item.text, "Using Ruby 3.2.0 with shadowenv");
      assert.strictEqual(status.item.name, "Ruby LSP Status");
      assert.strictEqual(status.item.command?.title, "Change version manager");
      assert.strictEqual(
        status.item.command.command,
        Command.SelectVersionManager,
      );
      assert.strictEqual(context.subscriptions.length, 1);
    });

    test("Refresh updates version string", () => {
      assert.strictEqual(status.item.text, "Using Ruby 3.2.0 with shadowenv");

      client.ruby.rubyVersion = "3.2.1";
      status.refresh();
      assert.strictEqual(status.item.text, "Using Ruby 3.2.1 with shadowenv");
    });
  });

  suite("ServerStatus", () => {
    beforeEach(() => {
      ruby = {} as Ruby;
      client = {
        context,
        ruby,
        state: ServerState.Running,
        formatter: "none",
        serverVersion: "1.0.0",
      };
      status = new ServerStatus(client);
    });

    test("Status is initialized with the right values", () => {
      assert.strictEqual(status.item.text, "Ruby LSP: Starting");
      assert.strictEqual(status.item.name, "Ruby LSP Status");
      assert.strictEqual(
        status.item.severity,
        vscode.LanguageStatusSeverity.Information,
      );
      assert.strictEqual(status.item.command?.title, "Configure");
      assert.strictEqual(status.item.command.command, Command.ServerOptions);
      assert.strictEqual(context.subscriptions.length, 1);
    });

    test("Refresh when server is starting", () => {
      client.state = ServerState.Starting;
      status.refresh();
      assert.strictEqual(status.item.text, "Ruby LSP: Starting");
      assert.strictEqual(
        status.item.severity,
        vscode.LanguageStatusSeverity.Information,
      );
    });

    test("Refresh when server is running", () => {
      client.state = ServerState.Running;
      status.refresh();
      assert.strictEqual(status.item.text, "Ruby LSP v1.0.0: Running");
      assert.strictEqual(
        status.item.severity,
        vscode.LanguageStatusSeverity.Information,
      );
    });

    test("Refresh when server is stopping", () => {
      client.state = ServerState.Stopped;
      status.refresh();
      assert.strictEqual(status.item.text, "Ruby LSP: Stopped");
      assert.strictEqual(
        status.item.severity,
        vscode.LanguageStatusSeverity.Information,
      );
    });

    test("Refresh when server has errored", () => {
      client.state = ServerState.Error;
      status.refresh();
      assert.strictEqual(status.item.text, "Ruby LSP: Error");
      assert.strictEqual(
        status.item.severity,
        vscode.LanguageStatusSeverity.Error,
      );
    });
  });

  suite("ExperimentalFeaturesStatus", () => {
    beforeEach(() => {
      ruby = {} as Ruby;
      client = {
        context,
        ruby,
        formatter,
        state: ServerState.Running,
        serverVersion: "1.0.0",
      };
      status = new ExperimentalFeaturesStatus(client);
    });

    test("Status is initialized with the right values", () => {
      assert.strictEqual(status.item.text, "Experimental features disabled");
      assert.strictEqual(status.item.name, "Experimental features");
      assert.strictEqual(status.item.command?.title, "Enable");
      assert.strictEqual(
        status.item.command.command,
        Command.ToggleExperimentalFeatures,
      );
      assert.strictEqual(context.subscriptions.length, 1);
    });
  });

  suite("YjitStatus when Ruby supports it", () => {
    beforeEach(() => {
      ruby = { supportsYjit: true } as Ruby;
      client = {
        context,
        ruby,
        state: ServerState.Running,
        formatter: "none",
        serverVersion: "1.0.0",
      };
      status = new YjitStatus(client);
    });

    test("Status is initialized with the right values", () => {
      assert.strictEqual(status.item.text, "YJIT enabled");
      assert.strictEqual(status.item.name, "YJIT");
      assert.strictEqual(status.item.command?.title, "Disable");
      assert.strictEqual(status.item.command.command, Command.ToggleYjit);
      assert.strictEqual(context.subscriptions.length, 1);
    });

    test("Refresh updates whether it's disabled or enabled", () => {
      assert.strictEqual(status.item.text, "YJIT enabled");

      client.ruby.supportsYjit = false;
      status.refresh();
      assert.strictEqual(status.item.text, "YJIT disabled");
    });
  });

  suite("YjitStatus when Ruby does not support it", () => {
    beforeEach(() => {
      ruby = { supportsYjit: false } as Ruby;
      client = {
        context,
        ruby,
        state: ServerState.Running,
        formatter: "none",
        serverVersion: "1.0.0",
      };
      status = new YjitStatus(client);
    });

    test("Refresh ignores YJIT configuration if Ruby doesn't support it", () => {
      assert.strictEqual(status.item.text, "YJIT disabled");
      assert.strictEqual(status.item.command, undefined);

      const lspConfig = vscode.workspace.getConfiguration("rubyLsp");
      lspConfig.update("yjit", true, true, true);
      client.ruby.supportsYjit = false;
      status.refresh();

      assert.strictEqual(status.item.text, "YJIT disabled");
      assert.strictEqual(status.item.command, undefined);
    });
  });

  suite("FeaturesStatus", () => {
    const configuration = vscode.workspace.getConfiguration("rubyLsp");
    const originalFeatures: { [key: string]: boolean } =
      configuration.get("enabledFeatures")!;
    const numberOfExperimentalFeatures = Object.values(originalFeatures).filter(
      (feature) => feature === false,
    ).length;
    const numberOfFeatures = Object.keys(originalFeatures).length;

    beforeEach(() => {
      ruby = {} as Ruby;
      status = new FeaturesStatus({
        context,
        ruby,
        formatter,
        state: ServerState.Running,
        serverVersion: "1.0.0",
      });
    });

    afterEach(() => {
      configuration.update("enabledFeatures", originalFeatures, true, true);
    });

    test("Status is initialized with the right values", () => {
      assert.strictEqual(
        status.item.text,
        `${
          numberOfFeatures - numberOfExperimentalFeatures
        }/${numberOfFeatures} features enabled`,
      );
      assert.strictEqual(status.item.name, "Ruby LSP Features");
      assert.strictEqual(status.item.command?.title, "Manage");
      assert.strictEqual(status.item.command.command, Command.ToggleFeatures);
      assert.strictEqual(context.subscriptions.length, 1);
    });

    test("Refresh updates number of features", () => {
      // eslint-disable-next-line promise/catch-or-return
      vscode.workspace
        .getConfiguration("rubyLsp")
        .update("enabledFeatures", { completion: false }, true, true)
        .then(() => {
          // The assertion depends on the resolution of the update promise. Awaiting leads to race conditions
          const currentConfig: { [key: string]: boolean } =
            configuration.get("enabledFeatures")!;

          Object.keys(originalFeatures).forEach((key) => {
            const expected =
              key === "completion" ? false : originalFeatures[key];
            assert.strictEqual(currentConfig[key], expected);
          });

          status.refresh();
          assert.strictEqual(
            status.item.text,
            `${
              numberOfFeatures - numberOfExperimentalFeatures - 1
            }/${numberOfFeatures} features enabled`,
          );
        });
    });
  });

  suite("FormatterStatus", () => {
    beforeEach(() => {
      ruby = {} as Ruby;
      client = {
        context,
        ruby,
        state: ServerState.Running,
        formatter: "auto",
        serverVersion: "1.0.0",
      };
      status = new FormatterStatus(client);
    });

    test("Status is initialized with the right values", () => {
      assert.strictEqual(status.item.text, "Using formatter: auto");
      assert.strictEqual(status.item.name, "Formatter");
      assert.strictEqual(status.item.command?.title, "Help");
      assert.strictEqual(status.item.command.command, Command.FormatterHelp);
      assert.strictEqual(context.subscriptions.length, 1);
    });
  });
});
