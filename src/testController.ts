import { exec } from "child_process";
import { promisify } from "util";

import * as vscode from "vscode";
import { CodeLens } from "vscode-languageclient/node";

import { Ruby } from "./ruby";
import { Command } from "./status";

const asyncExec = promisify(exec);

export class TestController {
  private testController: vscode.TestController;
  private testCommands: WeakMap<
    vscode.TestItem,
    { command: string; identifier: string }
  >;

  private testRunProfile: vscode.TestRunProfile;
  private testDebugProfile: vscode.TestRunProfile;
  private debugTag: vscode.TestTag = new vscode.TestTag("debug");
  private workingFolder: string;
  private terminal: vscode.Terminal | undefined;
  private ruby: Ruby;

  constructor(
    context: vscode.ExtensionContext,
    workingFolder: string,
    ruby: Ruby
  ) {
    this.workingFolder = workingFolder;
    this.ruby = ruby;

    this.testController = vscode.tests.createTestController(
      "rubyTests",
      "Ruby Tests"
    );

    this.testCommands = new WeakMap<
      vscode.TestItem,
      { command: string; identifier: string }
    >();

    this.testRunProfile = this.testController.createRunProfile(
      "Run",
      vscode.TestRunProfileKind.Run,
      (request, token) => {
        this.runHandler(request, token);
      },
      true
    );

    this.testDebugProfile = this.testController.createRunProfile(
      "Debug",
      vscode.TestRunProfileKind.Debug,
      (request, token) => {
        this.debugHandler(request, token);
      },
      false,
      this.debugTag
    );

    vscode.commands.executeCommand("testing.clearTestResults");
    vscode.window.onDidCloseTerminal((terminal: vscode.Terminal): void => {
      if (terminal === this.terminal) this.terminal = undefined;
    });

    context.subscriptions.push(
      this.testController,
      vscode.commands.registerCommand(
        Command.RunTest,
        (_path, name, _command) => {
          this.runOnClick(name);
        }
      ),
      vscode.commands.registerCommand(
        Command.RunTestInTerminal,
        this.runTestInTerminal.bind(this)
      ),
      vscode.commands.registerCommand(
        Command.DebugTest,
        this.debugTest.bind(this)
      )
    );
  }

  createTestItems(response: CodeLens[]) {
    this.testController.items.forEach((test) => {
      this.testController.items.delete(test.id);
      this.testCommands.delete(test);
    });

    let classTest: vscode.TestItem;
    const uri = vscode.Uri.from({
      scheme: "file",
      path: response[0].command!.arguments![0],
    });

    response.forEach((res) => {
      const [_, name, command, location] = res.command!.arguments!;
      let testItem;

      let id = name.replace(/\s/g, "_");

      if (res.data?.kind === "example") {
        // When running Rails tests the names don't automatically include `test_`. We need it to find tests later
        if (!id.startsWith("test_")) {
          id = `test_${id}`;
        }

        testItem = this.testController.createTestItem(id, name, uri);
        testItem.tags = [new vscode.TestTag("example"), this.debugTag];
        classTest.children.add(testItem);
      } else if (res.data?.kind === "group") {
        testItem = this.testController.createTestItem(id, name, uri);
        testItem.tags = [new vscode.TestTag("group")];
        classTest = testItem;
        classTest.canResolveChildren = true;
        this.testController.items.add(testItem);
      }

      testItem!.range = new vscode.Range(
        new vscode.Position(location.start_line, location.start_column),
        new vscode.Position(location.end_line, location.end_column)
      );

      let identifier: string = command.split(" ").pop();

      // When executing Minitest or test-unit examples, we need to remove the forward slashes from the name regex from
      // the identifier. This is not the case for Rails tests which use colon and line number.
      if (!identifier.includes(":")) {
        identifier = identifier.substring(1, identifier.length - 2);
      }

      this.testCommands.set(testItem!, {
        command,
        identifier,
      });
    });
  }

  dispose() {
    this.testRunProfile.dispose();
    this.testDebugProfile.dispose();
    this.testController.dispose();
  }

  private debugTest(_path: string, _name: string, command: string) {
    return vscode.debug.startDebugging(undefined, {
      type: "ruby_lsp",
      name: "Debug",
      request: "launch",
      program: command,
      env: { ...this.ruby.env, DISABLE_SPRING: "1" },
    });
  }

  private runTestInTerminal(_path: string, _name: string, command: string) {
    if (this.terminal === undefined) {
      this.terminal = vscode.window.createTerminal({ name: "Run test" });
    }
    this.terminal.show();
    this.terminal.sendText(command);
  }

  private async debugHandler(
    request: vscode.TestRunRequest,
    _token: vscode.CancellationToken
  ) {
    const run = this.testController.createTestRun(request, undefined, true);
    const test = request.include![0];

    const start = Date.now();
    await this.debugTest("", "", this.testCommands.get(test)!.command);
    run.passed(test, Date.now() - start);
    run.end();
  }

  private async runHandler(
    request: vscode.TestRunRequest,
    _token: vscode.CancellationToken
  ) {
    const run = this.testController.createTestRun(request, undefined, true);
    const allTests: vscode.TestItem[] = [];

    (request.include ?? this.testController.items).forEach((test) => {
      allTests.push(test);
    });

    let queue = this.flattenTestList(request, allTests);
    const identifiers = queue.map((t) => this.testCommands.get(t)!.identifier);
    const command = this.testCommands.get(queue[0])!.command.split(" ");
    // Remove the test identifier from the command to get just the base command (e.g.: bin/rails test)
    command.pop();

    // If it's a Rails test, we can just concatenate all identifiers, which will result in `foo.rb:5 foo.rb:10`.
    // Otherwise, we build a regex that will match all tests we want to run
    if (identifiers[0].includes(":")) {
      command.push(identifiers.join(" "));
    } else {
      command.push(`"/(${identifiers.join(")|(")})/"`);
    }

    const start = Date.now();
    try {
      await asyncExec(command.join(" "), {
        cwd: this.workingFolder,
        env: this.ruby.env,
      });
    } catch (error: any) {
      // Splitting by `Failure:` will give us the initial summary in the first element and all failures in the rest
      const failures: string[] = error.stdout.split("Failure:");
      let match: RegExpMatchArray | null;
      let testId: string;
      failures.shift();

      // Because we run all tests in one command, we have to match each failure to its respective test item
      failures.forEach((failure) => {
        let normalizedMessage;
        const parts = failure.split("\n");

        if (parts[0] === "") {
          // Minitest
          normalizedMessage = parts.slice(1, 4).join("\n");
          match = normalizedMessage.match(/(.*) \[/);
          testId = match![1];
        } else {
          // test-unit
          normalizedMessage = parts[0];
          match = normalizedMessage.match(/\s*(.*)\((.*)\):/);
          testId = `${match![2]}#${match![1]}`;
        }

        const failedTest = queue.find((test) => {
          const fullId = test.parent ? `${test.parent.id}#${test.id}` : test.id;
          return testId.endsWith(fullId);
        })!;

        run.failed(
          failedTest,
          new vscode.TestMessage(normalizedMessage),
          Date.now() - start
        );

        queue = queue.filter((test) => test !== failedTest);
      });
    }

    // After we marked the failures, the remaining tests in the queue have all passed
    queue.forEach((test) => {
      run.passed(test, Date.now() - start);
    });

    // Make sure to end the run after all tests have been executed
    run.end();
  }

  private flattenTestList(
    request: vscode.TestRunRequest,
    items: vscode.TestItem[]
  ) {
    const queue = [...items];
    const flattenList = [];

    while (queue.length > 0) {
      const test = queue.pop()!;

      if (
        test.tags.find((tag) => tag.id === "example") &&
        !request.exclude?.includes(test)
      ) {
        flattenList.push(test);
      }

      test.children.forEach((test) => queue.push(test));
    }

    return flattenList;
  }

  private async runOnClick(testId: string) {
    const test = this.findTestById(this.testController.items, testId);

    if (!test) return;

    vscode.commands.executeCommand("vscode.revealTestInExplorer", test);
    let tokenSource: vscode.CancellationTokenSource | null =
      new vscode.CancellationTokenSource();

    tokenSource.token.onCancellationRequested(() => {
      tokenSource?.dispose();
      tokenSource = null;

      vscode.window.showInformationMessage("Cancelled the progress");
    });

    const testRun = new vscode.TestRunRequest([test], [], this.testRunProfile);

    this.testRunProfile.runHandler(testRun, tokenSource.token);
  }

  private findTestById(testItems: vscode.TestItemCollection, testId: string) {
    let testItem = testItems.get(testId);

    if (testItem) return testItem;

    testItems.forEach((test) => {
      const childTestItem = this.findTestById(test.children, testId);
      if (childTestItem) testItem = childTestItem;
    });

    return testItem;
  }
}
