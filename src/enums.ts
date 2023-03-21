export enum ServerState {
  Starting = "Starting",
  Running = "Running",
  Stopped = "Stopped",
  Error = "Error",
}

// Lists every Command in the Ruby LSP
export enum Command {
  Start = "rubyLsp.start",
  Stop = "rubyLsp.stop",
  Restart = "rubyLsp.restart",
  Update = "rubyLsp.update",
  ToggleExperimentalFeatures = "rubyLsp.toggleExperimentalFeatures",
  ServerOptions = "rubyLsp.serverOptions",
  ToggleYjit = "rubyLsp.toggleYjit",
  SelectVersionManager = "rubyLsp.selectRubyVersionManager",
  ToggleFeatures = "rubyLsp.toggleFeatures",
}

export enum VersionManager {
  Asdf = "asdf",
  Auto = "auto",
  Chruby = "chruby",
  Rbenv = "rbenv",
  Rvm = "rvm",
  Shadowenv = "shadowenv",
  None = "none",
}
