import * as vscode from "vscode";

import { Ruby } from "./ruby";

type GemPath = GemDirectoryPath | GemFilePath;
type BundlerNode = Gem | GemPath;

export class Bundler implements vscode.TreeDataProvider<BundlerNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<any> =
    new vscode.EventEmitter<any>();

  // eslint-disable-next-line @typescript-eslint/member-ordering
  readonly onDidChangeTreeData: vscode.Event<any> =
    this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext, private ruby: Ruby) {
    this.ruby = ruby;
    this.context.subscriptions.push(
      vscode.window.createTreeView("bundler", { treeDataProvider: this }),
      vscode.commands.registerCommand("bundler.remove", (gem) =>
        this.removeGem(gem)
      )
    );
  }

  getTreeItem(
    element: BundlerNode
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }

  getChildren(
    element?: BundlerNode | undefined
  ): vscode.ProviderResult<BundlerNode[]> {
    if (element) {
      return this.fetchGemEntries(element);
    } else {
      return this.fetchDependencies();
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  private async fetchGemEntries(element: BundlerNode): Promise<GemPath[]> {
    const dir = element.resourceUri;
    const entries = await vscode.workspace.fs.readDirectory(dir);

    return entries.map(([name, type]) => {
      if (type === vscode.FileType.Directory) {
        return new GemDirectoryPath(vscode.Uri.joinPath(dir, name));
      } else {
        return new GemFilePath(vscode.Uri.joinPath(dir, name));
      }
    });
  }

  private async runBundleCommand(command: string) {
    return (
      await this.ruby.run(`bundle ${command}`, { withOriginalGemfile: true })
    )?.stdout;
  }

  private async fetchDependencies(): Promise<Gem[]> {
    const versionList = await this.runBundleCommand("list");

    if (!versionList) {
      return [];
    }

    const pathList = (await this.runBundleCommand("list --paths"))?.split("\n");

    if (!pathList) {
      return [];
    }

    return Array.from(versionList.matchAll(/ {2}\* ([^(]+) \(([^)]+)\)/g)).map(
      ([_, name, version], idx) => {
        return new Gem(name, version, vscode.Uri.file(pathList[idx]));
      }
    );
  }

  private async removeGem(gem: Gem): Promise<void> {
    const result = await vscode.window.showWarningMessage(
      `Are you sure you want to remove the gem '${gem.name}' from the Gemfile?`,
      { title: "Yes" },
      { title: "No", isCloseAffordance: true }
    );

    if (result?.title === "Yes") {
      await this.runBundleCommand(`remove ${gem.name}`);
      this.refresh();
    }
  }
}

class Gem extends vscode.TreeItem {
  constructor(
    public readonly name: string,
    public readonly version: string,
    public readonly resourceUri: vscode.Uri
  ) {
    super(`${name} (${version})`, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = "gem";
    this.iconPath = new vscode.ThemeIcon("ruby");
  }
}

class GemDirectoryPath extends vscode.TreeItem {
  constructor(public readonly resourceUri: vscode.Uri) {
    super(resourceUri, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = "gem-directory-path";
    this.description = true;

    this.command = {
      command: "list.toggleExpand",
      title: "Toggle",
    };
  }
}

class GemFilePath extends vscode.TreeItem {
  constructor(public readonly resourceUri: vscode.Uri) {
    super(resourceUri, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "gem-file-path";
    this.description = true;

    this.command = {
      command: "vscode.open",
      title: "Open",
      arguments: [resourceUri],
    };
  }
}
