## Installation

### Install the gem

Install the gem into the `development` group, for example:

```
group :development do
  gem "ruby-lsp", require: false
end
```

The `ruby-lsp` gem must be part of the `Gemfile` – it is not possible to use a globally installed version.

### Set your version manager

Ruby LSP needs to know which Ruby version manager you are using.

<a class="link__configure" title="Settings" href="command:ruby-lsp.showSettingsPage">Open the extension settings</a> to set that.

### Enabling/Disabling Features

All of the extensions features enabled by default, but disabling specific features is supported by editing the User Settings (JS)

```json
"rubyLsp.enabledFeatures": {
  "formatting": false
}
```

For a full list of configurable features, see [`package.json`](https://github.com/Shopify/vscode-ruby-lsp/blob/main/package.json).
