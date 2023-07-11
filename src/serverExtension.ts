import * as vscode from "vscode";

interface ExtensionStore {
  [key: string]: { activated: boolean };
}

export default class ServerExtension {
  public name: string;
  public errors: string[];
  private context: vscode.ExtensionContext;
  private eventEmitter: vscode.EventEmitter<string>;
  #activated = true;

  constructor(
    context: vscode.ExtensionContext,
    eventEmitter: vscode.EventEmitter<string>,
    name: string,
    errors: string[]
  ) {
    this.name = name;
    this.errors = errors;
    this.context = context;
    this.eventEmitter = eventEmitter;
    this.#activated = this.extensionEntry().activated;
  }

  errored() {
    return this.errors.length > 0;
  }

  get activated() {
    return this.#activated;
  }

  set activated(activated: boolean) {
    // If the `activated` value of this extension is being changed, then we want to both set `#activated` and remember
    // the configuration in the workspaceState
    if (this.activated !== activated) {
      const extensions: ExtensionStore =
        this.context.workspaceState.get("rubyLsp.extensions") ?? {};

      if (extensions[this.name] === undefined) {
        extensions[this.name] = { activated };
      } else {
        extensions[this.name].activated = activated;
      }

      this.#activated = activated;
      this.context.workspaceState.update("rubyLsp.extensions", extensions);

      // The client listens to this event to trigger a restart in case a server extension was activated or deactivated.
      // See Client#registerAutoRestarts
      this.eventEmitter.fire("activation");
    }
  }

  private extensionEntry() {
    const currentExtensions: ExtensionStore =
      this.context.workspaceState.get("rubyLsp.extensions") ?? {};

    return currentExtensions[this.name] || { activated: true };
  }
}
