import * as vscode from "vscode";

import Client from "./client";

let client: Client;

export async function activate(context: vscode.ExtensionContext) {
  client = new Client(context);
  await client.start();
}

export async function deactivate() {
  if (client) {
    await client.stop();
  }
}
