# Adapter Examples

These adapters are optional examples. They are not part of the `gv-loop` core task queue.

Use them as references for bridging an external queue into `gv-loop task add`, or copy one into your own workflow and change it freely.

## `.scratch` Markdown Issues

`scratch-issues.ts` targets local markdown issue folders shaped like:

```text
.scratch/<feature>/issues/<NN>-<slug>.md
```

This layout is useful for local AFK workflows inspired by Matt Pocock's agent skills:

https://github.com/mattpocock/skills
