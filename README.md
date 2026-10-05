# Memory-Archive

A personal archive for thoughts, notes, photos, files and online sources: everything that
inspires, informs or triggers me, and a way to uncover what has shaped me as an artist.

This is an **exploratory prototype**. See [DESIGN.md](DESIGN.md) for the ideas behind it and the open questions.

## Try it

Open `index.html` in a browser. No install or server needed. For example:

```sh
open index.html          # macOS
# or serve it:
python3 -m http.server   # then visit http://localhost:8000
```

It starts with example items so there is something to explore. Remove them with **Remove examples** in the footer.

## Look and feel

The interface uses the design system of [daanwalder.com](https://daanwalder.com): paper `#f1f0eb` and ink
`#0e0e0e`, Signal Blue `#254fff` as the only accent (Signal Red `#ff3b1f` marks what *triggers*),
Familjen Grotesk for words and IBM Plex Mono for labels, hairline rules on a 12 column grid, and
`[ BRACKETED ]` actions. The fonts are included in `fonts/` (SIL Open Font License).

## What's in it

- **Capture**: thoughts, notes, images, sources (links), quotes, files and your own works.
  Or drop files anywhere on the page.
- **Resonance**: mark whether something *inspires*, *informs* or *triggers* you.
- **Connections with a reason**: link any two items and write *why* they belong together.
- **Four lenses on the same archive:**
  - **Index**: a list by year of when things entered your life, with a floating preview on hover
  - **Wall**: a visual pin-up board
  - **Constellation**: everything as a web of connections (drag to rearrange)
  - **Lineage**: pick one of your works and trace its influences outwards
- **Drift**: surfaces a random item, with older ones more likely.
- **Receiving**: paste a link, text or image anywhere to start a new entry, or drop files on the page.
- **Keys**: `N` new entry · `/` search · `1`–`4` switch lens · `←` `→` browse entries · `Esc` close · `⌘/Ctrl ↵` save.
- **Export / Import** as JSON. Data is stored only in your browser, so export regularly.
