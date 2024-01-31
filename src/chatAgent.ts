import * as vscode from "vscode";

interface ChatResult extends vscode.ChatAgentResult2 {
  subCommand: string;
}

async function explain(
  request: vscode.ChatAgentRequest,
  _context: vscode.ChatAgentContext,
  progress: vscode.Progress<vscode.ChatAgentProgress>,
  token: vscode.CancellationToken,
): Promise<ChatResult> {
  const activeEditor = vscode.window.activeTextEditor;
  let userContent = request.prompt;

  if (activeEditor) {
    const document = activeEditor.document;
    const selection = activeEditor.selection;
    let range;

    if (selection.active.isEqual(selection.anchor)) {
      range = new vscode.Range(
        selection.active.line - 5,
        0,
        selection.active.line + 5,
        document.lineAt(selection.active.line + 5).text.length,
      );
    } else if (selection.isReversed) {
      range = new vscode.Range(
        selection.active.line,
        selection.active.character,
        selection.anchor.line,
        selection.anchor.character,
      );
    } else {
      range = new vscode.Range(
        selection.anchor.line,
        selection.anchor.character,
        selection.active.line,
        selection.active.character,
      );
    }
    userContent += `-----\n Relevant code: ${activeEditor.document.getText(range)}`;
  }

  const access = await vscode.chat.requestChatAccess("copilot");
  const messages = [
    {
      role: vscode.ChatMessageRole.System,
      content:
        "You are a Ruby expert! \
            Your job is to explain Ruby concepts and perform Ruby related tasks to assist the developer.",
    },
    {
      role: vscode.ChatMessageRole.User,
      content: userContent,
    },
  ];

  const chatRequest = access.makeRequest(messages, {}, token);
  for await (const fragment of chatRequest.response) {
    progress.report({ content: fragment });
  }
  return { subCommand: "explain" };
}

export async function chatHandler(
  request: vscode.ChatAgentRequest,
  context: vscode.ChatAgentContext,
  progress: vscode.Progress<vscode.ChatAgentProgress>,
  token: vscode.CancellationToken,
): Promise<ChatResult> {
  // Don't forget to add the subcommand in the agent definition in src/extension.ts
  if (request.subCommand === "explain") {
    return explain(request, context, progress, token);
  }

  return { subCommand: "" };
}
