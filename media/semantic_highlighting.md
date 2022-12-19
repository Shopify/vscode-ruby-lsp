## Semantic Highlighting

Semantic Highlighting allows VS Code to provide accurate syntax highlighting. For example, it can distinguish a local variable from a zero-arguments method invocation:

```ruby
def foo
  var = 1          # highlighted as a local variable
  some_invocation  # highlighted as a method invocation
  var              # highlighted as a local variable
end
```

TODO: Does this only work for typed files?

![Semantic Highlighting](ruby-lsp-misc/semantic_highlighting.gif)
