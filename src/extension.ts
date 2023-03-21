import * as vscode from "vscode";

import Client from "./client";
import { Telemetry } from "./telemetry";
import { Ruby } from "./ruby";
import { StatusItems } from "./status";

class Extension {
  private telemetry: Telemetry;
  private ruby: Ruby;
  private client: Client;
  private statusItems: StatusItems;

  constructor(context: vscode.ExtensionContext) {
    this.telemetry = new Telemetry(context);
    this.ruby = new Ruby();
    this.client = new Client(context, this.telemetry, this.ruby);
    this.statusItems = new StatusItems(this.client);
  }

  async activate() {
    await this.ruby.activateRuby();
    await this.client.start();
  }

  async deactivate() {
    await this.client.stop();
    this.statusItems.dispose();
  }
}

let extension: Extension | null = null;

export async function activate(context: vscode.ExtensionContext) {
  extension = new Extension(context);
  await extension.activate();
}

export async function deactivate(): Promise<void> {
  if (extension) {
    await extension.deactivate();
  }
}
