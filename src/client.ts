import path from "path";
import fs from "fs";
import { performance as Perf } from "perf_hooks";

import * as vscode from "vscode";
import {
  LanguageClientOptions,
  LanguageClient,
  Executable,
  RevealOutputChannelOn,
  CodeLens,
  Range,
  ExecutableOptions,
  ServerOptions,
  MessageSignature,
  State,
} from "vscode-languageclient/node";

import { asyncExec, LOG_CHANNEL, LSP_NAME, ClientInterface } from "./common";
import { Telemetry, RequestEvent } from "./telemetry";
import { Ruby } from "./ruby";

interface EnabledFeatures {
  [key: string]: boolean;
}

// Get the executables to start the server based on the user's configuration
function lspExecutables(cwd: string, env: NodeJS.ProcessEnv): ServerOptions {
  let run: Executable;
  let debug: Executable;
  const branch: string = vscode.workspace
    .getConfiguration("rubyLsp")
    .get("branch")!;
  const customBundleGemfile: string = vscode.workspace
    .getConfiguration("rubyLsp")
    .get("bundleGemfile")!;

  const executableOptions: ExecutableOptions = { cwd, env, shell: true };

  // If there's a user defined custom bundle, we run the LSP with `bundle exec` and just trust the user configured
  // their bundle. Otherwise, we run the global install of the LSP and use our custom bundle logic in the server
  if (customBundleGemfile.length > 0) {
    run = {
      command: "bundle",
      args: ["exec", "ruby-lsp"],
      options: executableOptions,
    };

    debug = {
      command: "bundle",
      args: ["exec", "ruby-lsp", "--debug"],
      options: executableOptions,
    };
  } else {
    run = {
      command: "ruby-lsp",
      args: branch.length > 0 ? ["--branch", branch] : [],
      options: executableOptions,
    };

    debug = {
      command: "ruby-lsp",
      args: ["--debug"],
      options: executableOptions,
    };
  }

  return { run, debug };
}

function clientOptions(
  configuration: vscode.WorkspaceConfiguration,
): LanguageClientOptions {
  const pullOn: "change" | "save" | "both" =
    configuration.get("pullDiagnosticsOn")!;

  const diagnosticPullOptions = {
    onChange: pullOn === "change" || pullOn === "both",
    onSave: pullOn === "save" || pullOn === "both",
  };

  const features: EnabledFeatures = configuration.get("enabledFeatures")!;
  const enabledFeatures = Object.keys(features).filter((key) => features[key]);

  return {
    documentSelector: [{ language: "ruby" }],
    diagnosticCollectionName: LSP_NAME,
    outputChannel: LOG_CHANNEL,
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    diagnosticPullOptions,
    initializationOptions: {
      enabledFeatures,
      experimentalFeaturesEnabled: configuration.get(
        "enableExperimentalFeatures",
      ),
      formatter: configuration.get("formatter"),
    },
  };
}

export default class Client extends LanguageClient implements ClientInterface {
  public readonly ruby: Ruby;
  private readonly workingDirectory: string;
  private readonly telemetry: Telemetry;
  private readonly createTestItems: (response: CodeLens[]) => void;
  private readonly baseFolder;
  private requestId = 0;

  #context: vscode.ExtensionContext;
  #formatter: string;

  constructor(
    context: vscode.ExtensionContext,
    telemetry: Telemetry,
    ruby: Ruby,
    createTestItems: (response: CodeLens[]) => void,
    workingFolder: string,
  ) {
    super(
      LSP_NAME,
      lspExecutables(workingFolder, ruby.env),
      clientOptions(vscode.workspace.getConfiguration("rubyLsp")),
    );

    // Middleware are part of client options, but because they must reference `this`, we cannot make it a part of the
    // `super` call (TypeScript does not allow accessing `this` before invoking `super`)
    this.registerMiddleware();

    this.workingDirectory = workingFolder;
    this.baseFolder = path.basename(this.workingDirectory);
    this.telemetry = telemetry;
    this.createTestItems = createTestItems;
    this.#context = context;
    this.ruby = ruby;
    this.#formatter = "";
  }

  // Perform tasks that can only happen once the custom bundle logic from the server is finalized and the client is
  // already running
  async performAfterStart() {
    await this.determineFormatter();
    this.telemetry.serverVersion = await this.getServerVersion();
  }

  async restart() {
    if (this.rebaseInProgress()) {
      return;
    }

    try {
      if (this.state === State.Running) {
        await this.stop();
        await this.start();
      } else {
        await this.start();
      }
    } catch (error: any) {
      LOG_CHANNEL.error(`Error restarting the server: ${error.message}`);
    }
  }

  get formatter(): string {
    return this.#formatter;
  }

  get serverVersion(): string | undefined {
    return this.telemetry.serverVersion;
  }

  async determineFormatter() {
    const configuration = vscode.workspace.getConfiguration("rubyLsp");
    const configuredFormatter: string = configuration.get("formatter")!;

    if (configuredFormatter === "auto") {
      if (await this.projectHasDependency(/^rubocop/)) {
        this.#formatter = "rubocop";
      } else if (await this.projectHasDependency(/^syntax_tree$/)) {
        this.#formatter = "syntax_tree";
      } else {
        this.#formatter = "none";
      }
    } else {
      this.#formatter = configuredFormatter;
    }
  }

  get context(): vscode.ExtensionContext {
    return this.#context;
  }

  private set context(context: vscode.ExtensionContext) {
    this.#context = context;
  }

  async sendShowSyntaxTreeRequest(
    uri: vscode.Uri,
    range?: Range,
  ): Promise<{ ast: string } | null> {
    return this.sendRequest("rubyLsp/textDocument/showSyntaxTree", {
      textDocument: { uri: uri.toString() },
      range,
    });
  }

  private async projectHasDependency(gemNamePattern: RegExp): Promise<boolean> {
    try {
      // We can't include `BUNDLE_GEMFILE` here, because we want to check if the project's bundle includes the
      // dependency and not our custom bundle
      const { BUNDLE_GEMFILE, ...withoutBundleGemfileEnv } = this.ruby.env;

      // exit with an error if gemNamePattern not a dependency or is a transitive dependency.
      // exit with success if gemNamePattern is a direct dependency.

      // NOTE: If changing this behavior, it's likely that the gem will also need changed.
      const script = `
        gemfile_dependencies = Bundler.locked_gems.dependencies.keys
        gemspec_dependencies = Bundler.locked_gems.sources.grep(Bundler::Source::Gemspec).flat_map do
          _1.gemspec&.dependencies&.map(&:name)
        end
        exit 1 unless (gemfile_dependencies + gemspec_dependencies).any?(${gemNamePattern})
      `;
      await asyncExec(`ruby -rbundler/setup -e "${script}"`, {
        cwd: this.workingDirectory,
        env: withoutBundleGemfileEnv,
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  private async getServerVersion(): Promise<string> {
    const customBundle: string = vscode.workspace
      .getConfiguration("rubyLsp")
      .get("bundleGemfile")!;

    let bundleGemfile;

    // If a custom Gemfile was configured outside of the project, use that. Otherwise, prefer our custom bundle over the
    // app's bundle
    if (customBundle.length > 0) {
      bundleGemfile = path.isAbsolute(customBundle)
        ? customBundle
        : path.resolve(path.join(this.workingDirectory, customBundle));
    } else if (
      fs.existsSync(path.join(this.workingDirectory, ".ruby-lsp", "Gemfile"))
    ) {
      bundleGemfile = path.join(this.workingDirectory, ".ruby-lsp", "Gemfile");
    } else if (
      fs.existsSync(path.join(this.workingDirectory, ".ruby-lsp", "gems.rb"))
    ) {
      bundleGemfile = path.join(this.workingDirectory, ".ruby-lsp", "gems.rb");
    } else if (fs.existsSync(path.join(this.workingDirectory, "gems.rb"))) {
      bundleGemfile = path.join(this.workingDirectory, "gems.rb");
    } else {
      bundleGemfile = path.join(this.workingDirectory, "Gemfile");
    }

    const result = await asyncExec(
      `bundle exec ruby -e "require 'ruby-lsp'; STDERR.print(RubyLsp::VERSION)"`,
      {
        cwd: this.workingDirectory,
        env: { ...this.ruby.env, BUNDLE_GEMFILE: bundleGemfile },
      },
    );

    return result.stderr;
  }

  // If the `.git` folder exists and `.git/rebase-merge` or `.git/rebase-apply` exists, then we're in the middle of a
  // rebase
  private rebaseInProgress() {
    const gitFolder = path.join(this.workingDirectory, ".git");

    return (
      fs.existsSync(gitFolder) &&
      (fs.existsSync(path.join(gitFolder, "rebase-merge")) ||
        fs.existsSync(path.join(gitFolder, "rebase-apply")))
    );
  }

  private async benchmarkMiddleware<T>(
    type: string | MessageSignature,
    params: any,
    runRequest: () => Promise<T>,
  ): Promise<T> {
    // Because of the custom bundle logic in the server, we can only fetch the server version after launching it. That
    // means some requests may be received before the computed the version. For those, we cannot send telemetry
    if (this.serverVersion === undefined) {
      return runRequest();
    }

    const request = typeof type === "string" ? type : type.method;

    // The first few requests are not representative for telemetry. Their response time is much higher than the rest
    // because they are inflate by the time we spend indexing and by regular "warming up" of the server (like
    // autoloading constants or running signature blocks).
    if (this.requestId < 50) {
      this.requestId++;
      return runRequest();
    }

    const telemetryData: RequestEvent = {
      request,
      rubyVersion: this.ruby.rubyVersion!,
      yjitEnabled: this.ruby.yjitEnabled!,
      lspVersion: this.serverVersion,
      requestTime: 0,
    };

    // If there are parameters in the request, include those
    if (params) {
      const castParam = { ...params } as { textDocument?: { uri: string } };

      if ("textDocument" in castParam) {
        const uri = castParam.textDocument?.uri.replace(
          // eslint-disable-next-line no-process-env
          process.env.HOME!,
          "~",
        );

        delete castParam.textDocument;
        telemetryData.uri = uri;
      }

      telemetryData.params = JSON.stringify(castParam);
    }

    let result: T | undefined;
    let errorResult;
    const benchmarkId = this.requestId++;

    // Execute the request measuring the time it takes to receive the response
    Perf.mark(`${benchmarkId}.start`);
    try {
      result = await runRequest();
    } catch (error: any) {
      // If any errors occurred in the request, we'll receive these from the LSP server
      telemetryData.errorClass = error.data.errorClass;
      telemetryData.errorMessage = error.data.errorMessage;
      telemetryData.backtrace = error.data.backtrace;
      errorResult = error;
    }
    Perf.mark(`${benchmarkId}.end`);

    // Insert benchmarked response time into telemetry data
    const bench = Perf.measure(
      "benchmarks",
      `${benchmarkId}.start`,
      `${benchmarkId}.end`,
    );
    telemetryData.requestTime = bench.duration;
    this.telemetry.sendEvent(telemetryData);

    // If there has been an error, we must throw it again. Otherwise we can return the result
    if (errorResult) {
      if (
        this.baseFolder === "ruby-lsp" ||
        this.baseFolder === "ruby-lsp-rails"
      ) {
        vscode.window.showErrorMessage(
          `Ruby LSP error ${errorResult.data.errorClass}: ${errorResult.data.errorMessage}\n\n
                ${errorResult.data.backtrace}`,
        );
      }

      throw errorResult;
    }

    return result!;
  }

  // Register the middleware in the client options
  private registerMiddleware() {
    this.clientOptions.middleware = {
      provideCodeLenses: async (document, token, next) => {
        const response = await next(document, token);

        if (response) {
          const testLenses = response.filter(
            (codeLens) => (codeLens as CodeLens).data.type === "test",
          ) as CodeLens[];

          if (testLenses.length) {
            this.createTestItems(testLenses);
          }
        }

        return response;
      },
      provideOnTypeFormattingEdits: async (
        document,
        position,
        ch,
        options,
        token,
        _next,
      ) => {
        const response: vscode.TextEdit[] | null = await this.sendRequest(
          "textDocument/onTypeFormatting",
          {
            textDocument: { uri: document.uri.toString() },
            position,
            ch,
            options,
          },
          token,
        );

        if (!response) {
          return null;
        }

        // Find the $0 anchor to move the cursor
        const cursorPosition = response.find((edit) => edit.newText === "$0");

        if (!cursorPosition) {
          return response;
        }

        // Remove the edit including the $0 anchor
        response.splice(response.indexOf(cursorPosition), 1);

        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.set(document.uri, response);
        await vscode.workspace.applyEdit(workspaceEdit);

        await vscode.window.activeTextEditor!.insertSnippet(
          new vscode.SnippetString(cursorPosition.newText),
          new vscode.Selection(
            cursorPosition.range.start,
            cursorPosition.range.end,
          ),
        );

        return null;
      },
      sendRequest: async <TP, T>(
        type: string | MessageSignature,
        param: TP | undefined,
        token: vscode.CancellationToken,
        next: (
          type: string | MessageSignature,
          param?: TP,
          token?: vscode.CancellationToken,
        ) => Promise<T>,
      ) => {
        return this.benchmarkMiddleware(type, param, () =>
          next(type, param, token),
        );
      },
      sendNotification: async <TR>(
        type: string | MessageSignature,
        next: (type: string | MessageSignature, params?: TR) => Promise<void>,
        params: TR,
      ) => {
        return this.benchmarkMiddleware(type, params, () => next(type, params));
      },
    };
  }
}
