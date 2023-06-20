import path from "path";

import * as vscode from "vscode";

import Client from "./client";
import { Telemetry } from "./telemetry";
import { Ruby } from "./ruby";
import { Debugger } from "./debugger";
import { TestController } from "./testController";

let client: Client;
let debug: Debugger;
let testController: TestController;

export async function activate(context: vscode.ExtensionContext) {
  const workspaceFolder = vscode.workspace.workspaceFolders![0].uri.fsPath;
  let workingFolder = workspaceFolder;
  const configuration = vscode.workspace.getConfiguration("rubyLsp");
  if (configuration.get("customWorkspaceFolder"))
    workingFolder = path.join(
      workspaceFolder,
      configuration.get("customWorkspaceFolder")!
    );

  const ruby = new Ruby(context, workingFolder);
  await ruby.activateRuby();

  const telemetry = new Telemetry(context);
  testController = new TestController(context, workingFolder, ruby);

  client = new Client(context, telemetry, ruby, testController, workingFolder);

  await client.start();
  debug = new Debugger(context, ruby, workingFolder);
}

export async function deactivate(): Promise<void> {
  if (client) {
    await client.stop();
  }

  if (testController) {
    testController.dispose();
  }

  if (debug) {
    debug.dispose();
  }
}
