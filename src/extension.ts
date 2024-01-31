import * as vscode from "vscode";

import { RubyLsp } from "./rubyLsp";
import { chatHandler } from "./chatAgent";

let extension: RubyLsp;

export async function activate(context: vscode.ExtensionContext) {
  if (!vscode.workspace.workspaceFolders) {
    return;
  }

  extension = new RubyLsp(context);
  await extension.activate();

  const agent = vscode.chat.createChatAgent("ruby", chatHandler);
  agent.iconPath = vscode.Uri.joinPath(context.extensionUri, "icon.png");
  agent.description = "Ask a question about Ruby or select a command";
  agent.fullName = "Ruby";
  agent.subCommandProvider = {
    provideSubCommands(_token: vscode.CancellationToken) {
      return [
        {
          name: "explain",
          description: "Explain a piece of Ruby code",
        },
      ];
    },
  };
}

export async function deactivate(): Promise<void> {
  await extension.deactivate();
}
