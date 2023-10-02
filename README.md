<p align="center">
  <img alt="Ruby LSP logo" width="200" src="icon.png" />
</p>

[![Build Status](https://github.com/Shopify/vscode-ruby-lsp/workflows/CI/badge.svg)](https://github.com/Shopify/vscode-ruby-lsp/actions/workflows/ci.yml)
[![Ruby LSP extension](https://img.shields.io/badge/VS%20Code-Ruby%20LSP-success?logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=Shopify.ruby-lsp)
[![Ruby DX Slack](https://img.shields.io/badge/Slack-Ruby%20DX-success?logo=slack)](https://join.slack.com/t/ruby-dx/shared_invite/zt-1zjp7lmgk-zL7bGvze8gj5hFaYS~r5vg)

# Ruby LSP (VS Code extension)

The Ruby LSP is an extension that provides performant rich features for Ruby. It connects to the
[ruby-lsp](https://github.com/Shopify/ruby-lsp) language server gem to analyze Ruby code and enhance the user
experience.

Want to discuss Ruby developer experience? Consider joining the public
[Ruby DX Slack workspace](https://join.slack.com/t/ruby-dx/shared_invite/zt-1zjp7lmgk-zL7bGvze8gj5hFaYS~r5vg).

## Usage

Search for `Shopify.ruby-lsp` in the extensions tab and click install.

By default, the Ruby LSP will generate a `.ruby-lsp` folder with a custom bundle that includes the server gem.
Additionally, it will attempt to use available version managers to select the correct Ruby version for any given
project. Refer to configuration for more options.

## Features

![Ruby LSP demo](extras/ruby_lsp_demo.gif)

The Ruby LSP features include

- Semantic highlighting
- Symbol search and code outline
- RuboCop errors and warnings (diagnostics)
- Format on save (with RuboCop or Syntax Tree)
- Format on type
- [Debugging support](#configuring-vs-code-debugger)
- Running and debugging tests through VS Code's UI
- Go to definition for classes, modules, constants and required files
- Showing documentaton on hover for classes, modules and constants
- Completion for classes, modules, constants and require paths
- Fuzzy search classes, modules and constants anywhere in the project and its dependencies (workspace symbol)

Adding method support for definition, completion, hover and workspace symbol is planned, but not yet completed.

See complete information about features in the [ruby-lsp server
documentation](https://shopify.github.io/ruby-lsp/RubyLsp/Requests.html).

### Commands

Available commands are listed below and can always be found by searching for the `Ruby LSP` prefix in the command
palette (Default hotkey: CMD + SHIFT + P).

| Command                              | Description                                             |
| ------------------------------------ | ------------------------------------------------------- |
| Ruby LSP: Start                      | Start the Ruby LSP server                               |
| Ruby LSP: Restart                    | Restart the Ruby LSP server                             |
| Ruby LSP: Stop                       | Stop the Ruby LSP server                                |
| Ruby LSP: Update language server gem | Updates the `ruby-lsp` server gem to the latest version |

### Snippets

This extension provides convenience snippets for common Ruby constructs, such as blocks, classes, methods or even unit
test boilerplates. Find the full list [here](https://github.com/Shopify/vscode-ruby-lsp/blob/main/snippets.json).

### Configuration

#### Enable or disable features

The Ruby LSP has all its features enabled by default, but disabling specific features is supported. To do so, open the
language status center right next to the language mode Ruby and select `Manage` right next to enabled features.

![Ruby LSP status center](extras/ruby_lsp_status_center.png)

#### Ruby version managers

To boot the server properly, the Ruby LSP uses a version manager to activate the right environment variables that point
Bundler to the Ruby and gem paths. This is especially necessary when switching between projects that use different Ruby
versions - since those paths change and need to be reactivated.

By default, the Ruby LSP will attempt to automatically determine which version manager it should use, checking which
ones are available (`auto` option). If that fails, then the version manager must be manually configured. You can do so
by clicking `Change version manager` in the language status center or by changing your VS Code user settings.

```jsonc
// Available options are
// "auto" (select version manager automatically)
// "none" (do not use a version manager)
// "custom" (use rubyLsp.customRubyCommand for finding/activating Ruby)
// "asdf"
// "chruby"
// "rbenv"
// "rvm"
// "shadowenv"
"rubyLsp.rubyVersionManager": "chruby"
```

To make sure that the Ruby LSP can find the version manager scripts, make sure that they are loaded in the shell's
configuration script (e.g.: ~/.bashrc, ~/.zshrc) and that the SHELL environment variable is set and pointing to the
default shell.

> [!NOTE]
>
> For manager-specific notes, setting up custom activation for managers not listed above,
> and community-contributed examples, please see [version managers](VERSION_MANAGERS.md).

#### Configuring a formatter

The tool to be used for formatting files can be configured with the following setting.

```jsonc
// Available options
//    auto: automatically detect the formatter based on the app's bundle (default)
//    none: do not use a formatter (disables format on save and related diagnostics)
//    all other options are the name of the formatter (e.g.: rubocop or syntax_tree)
"rubyLsp.formatter": "auto"
```

#### Using a custom Gemfile

If you are working on a project using an older version of Ruby not supported by Ruby LSP, then you may specify a
separate `Gemfile` for development tools. You can include the `ruby-lsp` in it and point to that Gemfile by using the
following configuration:

**Note**: when using this, gems will not be installed automatically and neither will `ruby-lsp` upgrades.

```jsonc
{
  "rubyLsp.bundleGemfile": "../../relative/path/to/Gemfile", // using a relative path from the current project
  "rubyLsp.bundleGemfile": "/absolute/path/to/Gemfile" // using an absolute path
}
```

#### Configuring VS Code debugger

To configure the VS Code debugger, you can use the "Debug: Add configuration..." command to create a
`launch.json` file in the `.vscode` folder of your project.

This command would generate the following configuration:

```jsonc
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "ruby_lsp",
      "name": "Debug",
      "request": "launch",
      "program": "ruby ${file}"
    },
    {
      "type": "ruby_lsp",
      "request": "launch",
      "name": "Debug test file",
      "program": "ruby -Itest ${relativeFile}"
    },
    {
      "type": "ruby_lsp",
      "request": "attach",
      "name": "Attach to existing server"
    }
  ]
}
```

## Troubleshooting

To verify if the Ruby LSP has been activated properly, you can

- Check if any of the features are working, such as format on save or file outline
- Open VS Code's `Output` panel, select the `Ruby LSP` channel and verify if `Ruby LSP is ready` was printed

If the Ruby LSP is failing to start, follow these steps

1. Double-check that the right [Ruby version manager](#ruby-version-managers) is configured
2. Double-check that all of the requirements for the version manager are present. For example, `chruby` requires a
   `.ruby-version` file to exist in the project's top level
3. If using v0.2.0 of this extension or above, double-check that the `ruby-lsp` gem is not present in the project's main
   `Gemfile`
4. Reload the VS Code window by opening the command palette and selecting `Developer: Reload window`

If these steps don't fix the initialization issue, attempt to manually install gems using the Ruby LSP's custom
`Gemfile` by running.

```shell
BUNDLE_GEMFILE=/path/to/your/project/.ruby-lsp/Gemfile bundle install
```

If after these steps the Ruby LSP is still not initializing properly, please report the issue
[here](https://github.com/Shopify/vscode-ruby-lsp/issues/new?labels=bug&template=bug_template.yml).

## Migrating from bundle

**Note**: The following applies if migrating from a version earlier than v0.2.0.

If you previously included the `ruby-lsp` gem in the bundle (as part of the project's `Gemfile` or `gemspec`) then
follow these steps to migrate to newer versions of the Ruby LSP - for which the gem no longer needs to be added to the
bundle.

1. Warn developers working on the project that they'll need to update to the latest Ruby LSP extension (older versions
   require the `ruby-lsp` gem in the bundle and therefore won't work if it is removed)
2. Remove the `ruby-lsp` from the bundle (remove the entry from the project's `Gemfile`)
3. Run bundle to make sure `Gemfile.lock` is updated
4. [Restart](#commands) the Ruby LSP extension or restart VS Code to allow Ruby LSP to use the new setup

## Telemetry

On its own, the Ruby LSP does not collect any telemetry by default, but it does support hooking up to a private metrics
service if desired.

In order to receive metrics requests, a private plugin must export the `ruby-lsp.getPrivateTelemetryApi` command, which
should return an object that implements the `TelemetryApi` interface defined
[here](https://github.com/Shopify/vscode-ruby-lsp/blob/main/src/telemetry.ts).

Fields included by default are defined in `TelemetryEvent`
[here](https://github.com/Shopify/vscode-ruby-lsp/blob/main/src/telemetry.ts). The exported API object can add any
other data of interest and publish it to a private service.

For example,

```typescript
// Create the API class in a private plugin
class MyApi implements TemeletryApi {
  sendEvent(event: TelemetryEvent): Promise<void> {
    // Add timestamp to collected metrics
    const payload = {
      timestamp: Date.now(),
      ...event,
    };

    // Send metrics to a private service
    myFavouriteHttpClient.post("private-metrics-url", payload);
  }
}

// Register the command to return an object of the API
vscode.commands.registerCommand(
  "ruby-lsp.getPrivateTelemetryApi",
  () => new MyApi(),
);
```

## Formatting

When `rubyLsp.formatter` is set to `auto`, Ruby LSP tries to determine which formatter to use.

If the bundle has a **direct** dependency on a supported formatter, such as `rubocop` or `syntax_tree`, that will be used.
Otherwise, formatting will be disabled and you will need add one to the bundle.

## Contributing

Bug reports and pull requests are welcome on GitHub at https://github.com/Shopify/vscode-ruby-lsp.
This project is intended to be a safe, welcoming space for collaboration, and contributors
are expected to adhere to the
[Contributor Covenant](https://github.com/Shopify/vscode-ruby-lsp/blob/main/CODE_OF_CONDUCT.md)
code of conduct.

Before contributing, please make sure to [sign the Contributor License Agreement](https://cla.shopify.com).

### Debugging

Interactive debugging works for both running the extension or tests. In the debug panel, select whether to run the
extension in development mode or run tests, set up some breakpoints and start with F5.

### Tracing LSP requests and responses

LSP server tracing can be controlled through the `ruby lsp.trace.server` config key in the `.vscode/settings.json`
config file.

Possible values are:

- `off`: no tracing
- `messages`: display requests and responses notifications
- `verbose`: display each request and response as JSON

### Debugging the server using VS Code

The `launch.json` contains a 'Minitest - current file' configuration for the debugger.

1. Add a breakpoint using the VS Code UI.
1. Open the relevant test file.
1. Open the **Run and Debug** panel on the sidebar.
1. Ensure `Minitest - current file` is selected in the top dropdown.
1. Press `F5` OR click the green triangle next to the top dropdown. VS Code will then run the test file with debugger activated.
1. When the breakpoint is triggered, the process will pause and VS Code will connect to the debugger and activate the debugger UI.
1. Open the Debug Console view to use the debugger's REPL.

## License

This extension is available as open source under the terms of the
[MIT License](https://github.com/Shopify/vscode-ruby-lsp/blob/main/LICENSE.txt).
