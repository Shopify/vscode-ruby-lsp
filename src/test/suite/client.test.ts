import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import { afterEach } from "mocha";
import * as vscode from "vscode";
import { State } from "vscode-languageclient/node";

import { Ruby, VersionManager } from "../../ruby";
import { Telemetry, TelemetryApi, TelemetryEvent } from "../../telemetry";
import { TestController } from "../../testController";
import Client from "../../client";

class FakeApi implements TelemetryApi {
  public sentEvents: TelemetryEvent[];

  constructor() {
    this.sentEvents = [];
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async sendEvent(event: TelemetryEvent): Promise<void> {
    this.sentEvents.push(event);
  }
}

suite("Client", () => {
  let client: Client | undefined;
  const managerConfig = vscode.workspace.getConfiguration("rubyLsp");
  const currentManager = managerConfig.get("rubyVersionManager");
  const tmpPath = fs.mkdtempSync(path.join(os.tmpdir(), "ruby-lsp-test-"));
  fs.writeFileSync(path.join(tmpPath, ".ruby-version"), "3.2.2");

  afterEach(async () => {
    if (client && client.state === State.Running) {
      await client.stop();
    }

    managerConfig.update("rubyVersionManager", currentManager, true, true);
    fs.rmSync(tmpPath, { recursive: true, force: true });
  });

  test("Starting up the server succeeds", async () => {
    // eslint-disable-next-line no-process-env
    if (process.env.CI) {
      await managerConfig.update(
        "rubyVersionManager",
        VersionManager.None,
        true,
        true,
      );
    }

    const context = {
      extensionMode: vscode.ExtensionMode.Test,
      subscriptions: [],
      workspaceState: {
        get: (_name: string) => undefined,
        update: (_name: string, _value: any) => Promise.resolve(),
      },
    } as unknown as vscode.ExtensionContext;

    const ruby = new Ruby(context, {
      uri: { fsPath: tmpPath },
    } as vscode.WorkspaceFolder);
    await ruby.activateRuby();

    const telemetry = new Telemetry(context, new FakeApi());

    const testController = new TestController(
      context,
      {
        uri: { fsPath: tmpPath },
      } as vscode.WorkspaceFolder,
      ruby,
      telemetry,
    );

    const client = new Client(
      context,
      telemetry,
      ruby,
      testController,
      tmpPath,
    );
    await client.start();
    assert.strictEqual(client.state, State.Running);
  }).timeout(30000);
});
