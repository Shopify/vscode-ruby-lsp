import * as vscode from "vscode";

import Client from "./client";
import { Telemetry } from "./telemetry";
import { Ruby } from "./ruby";
import { initTestController } from "./test-explorer";

let client: Client;

export async function activate(context: vscode.ExtensionContext) {
  const ruby = new Ruby();
  await ruby.activateRuby();

  const telemetry = new Telemetry(context);
  client = new Client(context, telemetry, ruby);

  initTestController(context);

  // Adding this delay guarantees that the Ruby environment is activated before trying to start the server
  await client.start();
}

export async function deactivate(): Promise<void> {
  if (client) {
    return client.stop();
  }
}
