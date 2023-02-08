import { TextDecoder } from "util";

import * as vscode from "vscode";

export const initTestController = (context: vscode.ExtensionContext) => {
  const controller = vscode.tests.createTestController(
    "rubyTests",
    "Ruby Tests"
  );

  // First, create the `resolveHandler`. This may initially be called with
  // "undefined" to ask for all tests in the workspace to be discovered, usually
  // when the user opens the Test Explorer for the first time.
  controller.resolveHandler = async (test) => {
    if (test) {
      await parseTestsInFileContents(test);
    } else {
      await discoverAllFilesInWorkspace();
    }
  };

  // When text documents are open, parse tests in them.
  vscode.workspace.onDidOpenTextDocument(parseTestsInDocument);
  // We could also listen to document changes to re-parse unsaved changes:
  vscode.workspace.onDidChangeTextDocument((doc) =>
    parseTestsInDocument(doc.document)
  );

  // In this function, we'll get the file TestItem if we've already found it,
  // otherwise we'll create it with `canResolveChildren = true` to indicate it
  // can be passed to the `controller.resolveHandler` to gets its children.
  function getOrCreateFile(uri: vscode.Uri) {
    const existing = controller.items.get(uri.toString());
    if (existing) {
      return existing;
    }

    const file = controller.createTestItem(
      uri.toString(),
      uri.path.split("/").pop()!,
      uri
    );
    file.canResolveChildren = true;
    controller.items.add(file);
    return file;
  }

  function parseTestsInDocument(doc: vscode.TextDocument) {
    if (doc.uri.scheme === "file" && doc.uri.path.endsWith(".rb")) {
      parseTestsInFileContents(getOrCreateFile(doc.uri), doc.getText());
    }
  }

  async function parseTestsInFileContents(
    file: vscode.TestItem,
    contents?: string
  ) {
    // If a document is open, VS Code already knows its contents. If this is being
    // called from the resolveHandler when a document isn't open, we'll need to
    // read them from disk ourselves.
    let loadedContents = contents;
    if (contents === undefined) {
      if (!file.uri) {
        return;
      }

      const rawContent = await vscode.workspace.fs.readFile(file.uri);
      loadedContents = new TextDecoder().decode(rawContent);
    }

    if (file.children.size < 1) {
      const child = controller.createTestItem(
        "testid",
        "My sample test",
        file.uri
      );
      file.children.add(child);
    }
  }

  async function discoverAllFilesInWorkspace() {
    if (!vscode.workspace.workspaceFolders) {
      // handle the case of no open folders
      return [];
    }

    return Promise.all(
      vscode.workspace.workspaceFolders.map(async (workspaceFolder) => {
        const pattern = new vscode.RelativePattern(workspaceFolder, "**/*.rb");
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);

        // When files are created, make sure there's a corresponding "file" node in the tree
        watcher.onDidCreate((uri) => getOrCreateFile(uri));
        // When files change, re-parse them. Note that you could optimize this so
        // that you only re-parse children that have been resolved in the past.
        watcher.onDidChange((uri) =>
          parseTestsInFileContents(getOrCreateFile(uri))
        );
        // And, finally, delete TestItems for removed files. This is simple, since
        // we use the URI as the TestItem's ID.
        watcher.onDidDelete((uri) => controller.items.delete(uri.toString()));

        for (const file of await vscode.workspace.findFiles(pattern)) {
          getOrCreateFile(file);
        }

        return watcher;
      })
    );
  }

  async function runHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken
  ) {
    const run = controller.createTestRun(request);
    const queue: vscode.TestItem[] = [];

    // Loop through all included tests, or all known tests, and add them to our queue
    if (request.include) {
      request.include.forEach((test) => queue.push(test));
    } else {
      controller.items.forEach((test) => queue.push(test));
    }

    // For every test that was queued, try to run it. Call run.passed() or run.failed().
    // The `TestMessage` can contain extra information, like a failing location or
    // a diff output. But here we'll just give it a textual message.
    while (queue.length > 0 && !token.isCancellationRequested) {
      const test = queue.pop()!;

      // Skip tests the user asked to exclude
      if (request.exclude?.includes(test)) {
        continue;
      }

      if (test.parent) {
        // Otherwise, just run the test case. Note that we don't need to manually
        // set the state of parent tests; they'll be set automatically.
        const start = Date.now();
        try {
          run.passed(test, Date.now() - start);
        } catch (err: any) {
          run.failed(
            test,
            new vscode.TestMessage(err.message),
            Date.now() - start
          );
        }
      }

      test.children.forEach((test) => queue.push(test));
    }

    // Make sure to end the run after all tests have been executed:
    run.end();
  }

  controller.createRunProfile(
    "Run",
    vscode.TestRunProfileKind.Run,
    (request, token) => {
      runHandler(request, token);
    }
  );

  context.subscriptions.push(controller);
};
