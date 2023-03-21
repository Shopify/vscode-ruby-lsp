import * as vscode from "vscode";

import Client from "./client";
import { Telemetry } from "./telemetry";
import { Ruby } from "./ruby";
import { StatusItems } from "./status";

let client: Client;
let statusItems: StatusItems;

export async function activate(context: vscode.ExtensionContext) {
  const ruby = new Ruby();
  await ruby.activateRuby();

  const telemetry = new Telemetry(context);
  client = new Client(context, telemetry, ruby);
  statusItems = new StatusItems(client);

  await client.start();
}

export async function deactivate(): Promise<void> {
  if (client) {
    return client.stop();
  }
  if (statusItems) {
    statusItems.dispose();
  }
}
