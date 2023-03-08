import { TextDecoder } from "util";
import * as childProcess from "child_process";
import { relative } from "path";
import { stdout } from "process";

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
      // await parseTestsInFileContents(test);
    } else {
      await discoverAllFilesInWorkspace();
    }
  };

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

    const repoRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

    const gemPath = vscode.workspace
      .getConfiguration("devTestRunner")
      .get("rubyTestRunnerPath");
    const fileDiscoveryCmd = "/exe/ruby_test_runner_dirs";
    const cmd = `${gemPath}${fileDiscoveryCmd} ${repoRoot}`;

    childProcess.exec(
      cmd,
      {
        maxBuffer: 8192 * 8192,
      },
      (err, stdout) => {
        if (err) {
          // Show an error message.
          vscode.window.showWarningMessage("Failed to discover Ruby tests.");
          vscode.window.showErrorMessage(err.message);
          throw err;
        }

        const testFiles: {
          [dir: string]: string[];
        } = JSON.parse(stdout);
        for (const dirRelPath in testFiles) {
          const dirUri = vscode.Uri.joinPath(
            (vscode.workspace.workspaceFolders || [])[0].uri,
            dirRelPath
          );
          let dir = controller.items.get(dirUri.toString());

          if (!dir) {
            dir = controller.createTestItem(
              dirUri.toString(),
              dirRelPath,
              dirUri
            );
          }

          dir.canResolveChildren = true;
          controller.items.add(dir);

          for (const fileName of testFiles[dirRelPath].flat()) {
            const fileUri = vscode.Uri.joinPath(dirUri, fileName);
            let file = controller.items.get(fileUri.toString());

            if (!file) {
              file = controller.createTestItem(
                fileUri.toString(),
                fileName,
                fileUri
              );
            }

            file.canResolveChildren = true;
            dir.children.add(file);
          }
        }
      }
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

      if (test.parent && test.uri) {
        // Otherwise, just run the test case. Note that we don't need to manually
        // set the state of parent tests; they'll be set automatically.
        runDevTest(
          test.uri,
          test.id,
          (vscode.workspace.workspaceFolders || [])[0].uri.fsPath,
          run,
          test
        );
      }

      test.children.forEach((test) => queue.push(test));
    }

    // Make sure to end the run after all tests have been executed:
    run.end();
  }

  function runDevTest(
    uri: vscode.Uri,
    testName: string,
    rootPath: string,
    testRun: vscode.TestRun,
    test: vscode.TestItem
  ) {
    const testPathRelative = relative(rootPath, uri.fsPath);

    const gemPath = vscode.workspace
      .getConfiguration("devTestRunner")
      .get("rubyTestRunnerPath");
    const testRunnerCmd = "/exe/ruby_test_runner_cmd";
    const preCmd = `${gemPath}${testRunnerCmd} ${rootPath} ${testPathRelative}`;

    const cmd = childProcess.execSync(preCmd).toString().trim();

    const execArgs: childProcess.ExecOptions = {
      cwd: rootPath,
      maxBuffer: 8192 * 8192,
    };

    const start = Date.now();

    try {
      const testOutput = childProcess.execSync(cmd, execArgs).toString().trim();

      const summaryLine = testOutput.substring(testOutput.lastIndexOf("\n"));

      const errCountRegex = /(\d+) errors/;
      const errCount = Number((summaryLine.match(errCountRegex) || [])[1]);

      const failureCountRegex = /(\d+) failures/;
      const failureCount = Number(
        (summaryLine.match(failureCountRegex) || [])[1]
      );

      if (errCount || failureCount) {
        testRun.failed(
          test,
          new vscode.TestMessage("Test failed"),
          Date.now() - start
        );
        vscode.window.showErrorMessage(testOutput);
      } else {
        testRun.passed(test, Date.now() - start);
      }
    } catch (err: any) {
      testRun.failed(
        test,
        new vscode.TestMessage("Test failed"),
        Date.now() - start
      );
      // vscode.window.showWarningMessage("Test failed to run.");
      // vscode.window.showErrorMessage(err.stdout);
      // throw err;
    }
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
