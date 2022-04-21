import * as assert from "assert";

import * as vscode from "vscode";

import { Telemetry, TelemetryApi, TelemetryEvent } from "../../telemetry";

class FakeApi implements TelemetryApi {
  public sentEvents: TelemetryEvent[];

  constructor() {
    this.sentEvents = [];
  }

  async sendEvent(event: TelemetryEvent): Promise<void> {
    this.sentEvents.push(event);
  }
}

suite("Telemetry", () => {
  test("Events are sent via the defined API", async () => {
    const api = new FakeApi();
    const telemetry = new Telemetry(api, {
      extensionMode: vscode.ExtensionMode.Production,
    } as vscode.ExtensionContext);
    const event: TelemetryEvent = {
      request: "textDocument/foldingRanges",
      requestTime: 0.005,
      lspVersion: "1.0.0",
    };

    await telemetry.sendEvent(event);
    assert.strictEqual(api.sentEvents[0], event);
  });

  test("The API object is acquired via command", async () => {
    const api = new FakeApi();
    vscode.commands.registerCommand(
      "ruby-lsp.getPrivateTelemetryApi",
      () => api
    );
    const telemetry = new Telemetry(undefined, {
      extensionMode: vscode.ExtensionMode.Production,
    } as vscode.ExtensionContext);
    const event: TelemetryEvent = {
      request: "textDocument/foldingRanges",
      requestTime: 0.005,
      lspVersion: "1.0.0",
    };

    await telemetry.initialize();
    await telemetry.sendEvent(event);
    assert.strictEqual(api.sentEvents[0], event);
  });
});
