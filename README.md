<p align="center">
  <img alt="Ruby LSP logo" width="200" src="icon.png" />
</p>

# Ruby LSP (VS Code extension)

> [!IMPORTANT]
> The code in this repository has moved! Find the Ruby LSP VS Code extension in our
> [monorepo](https://github.com/Shopify/ruby-lsp/tree/main/vscode).

## Why switch to a monorepo?

Having the VS Code extension and the server implementation be separate repositories was leading to duplicate work. For
example:

- The same bug reports or feature suggestions being created in both repositories
- Duplicate documentation
- Documentation that's not consolidated in a single place, requiring users to check multiple places to get the
  information they needed
- Duplicate integration tests

To consolidate all Ruby LSP information and better serve users, we decided to merge everything into a monorepo. The
[ruby-lsp](https://github.com/Shopify/ruby-lsp) repository is now the home for both the server and the VS Code
extension.

All issues and commit history were transferred to keep the history and context of the extension.
