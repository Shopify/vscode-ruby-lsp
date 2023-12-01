import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import * as vscode from "vscode";

import { Ruby } from "../../ruby";

const PATH_SEPARATOR = os.platform() === "win32" ? ";" : ":";

suite("Ruby environment activation", () => {
  const assertRubyEnv = (rubyEnv: {
    GEM_HOME: string;
    GEM_PATH: string;
    PATH: string;
  }) => {
    const gemPathParts = rubyEnv.GEM_PATH.split(PATH_SEPARATOR);
    assert.match(rubyEnv.GEM_HOME, /.gem\/ruby\/3.2.\d/);
    assert.strictEqual(gemPathParts[0], rubyEnv.GEM_HOME);
    assert.match(gemPathParts[1], /lib\/ruby\/gems\/3.2.0/);
  };

  const context = {
    extensionMode: vscode.ExtensionMode.Test,
    subscriptions: [],
    workspaceState: {
      get: (_name: string) => undefined,
      update: (_name: string, _value: any) => Promise.resolve(),
    },
  } as unknown as vscode.ExtensionContext;

  test("fetches Ruby environment for .ruby-version", async () => {
    const tmpPath = fs.mkdtempSync(path.join(os.tmpdir(), "ruby-lsp-test-"));
    const ruby = new Ruby(
      {
        uri: { fsPath: tmpPath },
      } as vscode.WorkspaceFolder,
      context,
    );
    fs.writeFileSync(path.join(tmpPath, ".ruby-version"), "3.2.2");
    const rubyEnv = await ruby.activate();

    assertRubyEnv(rubyEnv);
    fs.rmSync(tmpPath, { recursive: true, force: true });
  });

  test("fetches Ruby environment for global rbenv version", async () => {
    const tmpPath = fs.mkdtempSync(path.join(os.tmpdir(), "ruby-lsp-test-"));
    const ruby = new Ruby(
      {
        uri: { fsPath: tmpPath },
      } as vscode.WorkspaceFolder,
      context,
    );
    const dir = path.join(os.homedir(), ".rbenv");
    const shouldRemoveDir = !fs.existsSync(dir);

    if (shouldRemoveDir) {
      fs.mkdirSync(dir);
    }

    const versionPath = path.join(dir, "version");
    let originalVersion;
    if (fs.existsSync(versionPath)) {
      originalVersion = fs.readFileSync(versionPath, "utf8");
    }

    fs.writeFileSync(versionPath, "3.2.2");
    const rubyEnv = await ruby.activate();

    assertRubyEnv(rubyEnv);

    if (shouldRemoveDir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }

    if (originalVersion) {
      fs.writeFileSync(versionPath, originalVersion);
    }
    fs.rmSync(tmpPath, { recursive: true, force: true });
  });

  test("fetches Ruby environment for .ruby-version using engine", async () => {
    const tmpPath = fs.mkdtempSync(path.join(os.tmpdir(), "ruby-lsp-test-"));
    const ruby = new Ruby(
      {
        uri: { fsPath: tmpPath },
      } as vscode.WorkspaceFolder,
      context,
    );
    fs.writeFileSync(path.join(tmpPath, ".ruby-version"), "ruby-3.2.2");
    const rubyEnv = await ruby.activate();

    assertRubyEnv(rubyEnv);
    fs.rmSync(tmpPath, { recursive: true, force: true });
  });

  test("fetches Ruby environment for .ruby-version with .ruby-gemset", async () => {
    const tmpPath = fs.mkdtempSync(path.join(os.tmpdir(), "ruby-lsp-test-"));
    const ruby = new Ruby(
      {
        uri: { fsPath: tmpPath },
      } as vscode.WorkspaceFolder,
      context,
    );
    fs.writeFileSync(path.join(tmpPath, ".ruby-version"), "3.2.2");
    fs.writeFileSync(path.join(tmpPath, ".ruby-gemset"), "hello");
    const rubyEnv = await ruby.activate();

    assertRubyEnv(rubyEnv);
    fs.rmSync(tmpPath, { recursive: true, force: true });
  });

  test("fetches Ruby environment for dev.yml", async () => {
    const tmpPath = fs.mkdtempSync(path.join(os.tmpdir(), "ruby-lsp-test-"));
    const ruby = new Ruby(
      {
        uri: { fsPath: tmpPath },
      } as vscode.WorkspaceFolder,
      context,
    );
    fs.writeFileSync(path.join(tmpPath, "dev.yml"), "- ruby: '3.2.2'");
    const rubyEnv = await ruby.activate();

    assertRubyEnv(rubyEnv);
    fs.rmSync(tmpPath, { recursive: true, force: true });
  });

  test("fetches Ruby environment for .tool-versions", async () => {
    const tmpPath = fs.mkdtempSync(path.join(os.tmpdir(), "ruby-lsp-test-"));
    const ruby = new Ruby(
      {
        uri: { fsPath: tmpPath },
      } as vscode.WorkspaceFolder,
      context,
    );
    fs.writeFileSync(path.join(tmpPath, ".tool-versions"), "ruby 3.2.2");
    const rubyEnv = await ruby.activate();
    assertRubyEnv(rubyEnv);
    fs.rmSync(tmpPath, { recursive: true, force: true });
  });

  test("fetches Ruby environment for .rtx.toml", async () => {
    const tmpPath = fs.mkdtempSync(path.join(os.tmpdir(), "ruby-lsp-test-"));
    const ruby = new Ruby(
      {
        uri: { fsPath: tmpPath },
      } as vscode.WorkspaceFolder,
      context,
    );
    fs.writeFileSync(
      path.join(tmpPath, ".rtx.toml"),
      `[tools]
       ruby = '3.2.2'`,
    );
    const rubyEnv = await ruby.activate();
    assertRubyEnv(rubyEnv);
    fs.rmSync(tmpPath, { recursive: true, force: true });
  });
});
