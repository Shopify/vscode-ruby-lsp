import { exec, ExecOptions } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";

import * as vscode from "vscode";

const asyncExec = promisify(exec);

export class Ruby {
  public rubyVersion?: string;
  public yjitEnabled?: boolean;
  private workingFolder: string;
  private versionManager?: string;

  constructor() {
    this.workingFolder = vscode.workspace.workspaceFolders![0].uri.fsPath;
  }

  async activateRuby() {
    this.versionManager = vscode.workspace
      .getConfiguration("rubyLsp")
      .get("rubyVersionManager")!;

    try {
      switch (this.versionManager) {
        case "asdf":
          await this.activate("asdf exec ruby");
          break;
        case "chruby":
          await this.activateChruby();
          break;
        case "rbenv":
          await this.activate("rbenv exec ruby");
          break;
        case "rvm":
          await this.activate("rvm-auto-ruby");
          break;
        default:
          await this.activateFallback();
          break;
      }

      vscode.window.setStatusBarMessage(`Ruby ${this.rubyVersion}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to activate ${this.versionManager} environment: ${error.message}`
      );
    }
  }

  private async activateFallback() {
    const shadowenv = vscode.extensions.getExtension(
      "shopify.vscode-shadowenv"
    );

    if (shadowenv) {
      await shadowenv.activate();
      await this.delay(500);
    }

    await this.collectRubyInformation("ruby");
  }

  private async activateChruby() {
    const rubyVersion = await this.readRubyVersion();
    await this.activate(`chruby-exec "${rubyVersion}" -- ruby`);
  }

  private async activate(rubyCommand: string) {
    let shellProfilePath;
    // eslint-disable-next-line no-process-env
    const shell = process.env.SHELL?.split("/").pop();
    // eslint-disable-next-line no-process-env
    const home = process.env.HOME;

    switch (shell) {
      case "fish":
        shellProfilePath = `${home}/.config/fish/config.fish`;
        break;
      case "zsh":
        shellProfilePath = `${home}/.zshrc`;
        break;
      default:
        shellProfilePath = `${home}/.bashrc`;
        break;
    }

    // eslint-disable-next-line no-process-env
    process.env = await this.collectRubyInformation(
      `source ${shellProfilePath} > /dev/null 2>&1 && ${rubyCommand}`,
      { shell, cwd: this.workingFolder }
    );
  }

  private async collectRubyInformation(
    rubyCommand: string,
    opts?: ExecOptions
  ): Promise<{ [key: string]: string }> {
    const result = await asyncExec(
      `${rubyCommand} -rjson -e "puts JSON.dump(env: ENV.to_h, version: RUBY_VERSION, yjit: defined?(RubyVM::YJIT))"`,
      { ...opts, encoding: "utf-8" }
    );

    const info = JSON.parse(result.stdout);

    this.rubyVersion = info.version;
    this.yjitEnabled = info.yjit === "constant";

    return info.env;
  }

  private async readRubyVersion() {
    try {
      const version = await readFile(
        `${this.workingFolder}/.ruby-version`,
        "utf8"
      );

      return version.trim();
    } catch (error: any) {
      if (error.code === "ENOENT") {
        throw new Error("No .ruby-version file was found");
      } else {
        throw error;
      }
    }
  }

  private async delay(mseconds: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, mseconds);
    });
  }
}
