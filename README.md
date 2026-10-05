# Memory-Archive

A personal archive for thoughts, notes, images, files and online sources: everything that has
stayed with me, and a way to uncover what has shaped me as an artist.

This is an **exploratory prototype**. See [DESIGN.md](DESIGN.md) for the structure, the reasoning
behind it and the open questions.

## Try it

Open `index.html` in a browser. No install or server needed. For example:

```sh
open index.html          # macOS
# or serve it:
python3 -m http.server   # then visit http://localhost:8000
```

It starts with example entries so there is something to explore. Remove them with
**Remove examples** at the bottom of the sidebar. Entries you made in an earlier version are
carried over automatically (tags become collections).

## How it's organised

- **Three kinds of entry**, by where something comes from:
  - **Notes**: your own writing, in full Markdown
  - **Finds**: things from outside (images, links, quotes, files), with who made them
  - **Works**: your own pieces
- **Collections** you make yourself (themes, obsessions, project research). An entry can be in several.
  Entries without one appear under **Unsorted**.
- **Formative**: one switch for the few things that truly shaped you.
- **People**: everyone named in the “by” field of a find, with their own page.
- **Connections**: link two entries and write *why*, or mention one in your writing with `[[Title]]`.

Every list can be shown as **List**, **Grid** or **Graph**, and grouped by **Year**, **Kind**,
**Collection** or **Person**. Works have a **Lineage** tab that traces what shaped them.

## Writing

The editor writes Markdown with a live preview (Write / Split / Preview). It supports headings,
lists, checklists, quotes, links, code, tables and images (pasted or dropped images are stored
with the entry). Type `[[` to link another entry; pick a title that doesn't exist yet to create a
link to a new note. Renaming an entry updates the links that point to it.

## Quick capture and keys

- Paste a link, image or text anywhere to start a new entry, or drop files on the page.
- `N` new entry (then `N` note, `F` find, `W` work) · `/` search · `1` `2` `3` list / grid / graph
- On an entry: `←` `→` previous / next · `E` edit
- In the editor: `⌘/Ctrl S` save · `⌘/Ctrl B` `I` `K` bold, italic, link · `Esc` cancel

## Look and feel

The interface uses the design system of [daanwalder.com](https://daanwalder.com): paper `#f1f0eb`
and ink `#0e0e0e`, Signal Blue `#254fff` as the only accent, Familjen Grotesk and IBM Plex Mono,
hairline rules on a 12 column grid and `[ BRACKETED ]` actions.

## Storage and files

Data is stored in this browser (IndexedDB). Use **Export** in the sidebar for a JSON backup and
**Import** to restore it.

- `fonts/`: Familjen Grotesk and IBM Plex Mono (SIL Open Font License)
- `vendor/`: [marked](https://github.com/markedjs/marked) (MIT) for Markdown and
  [DOMPurify](https://github.com/cure53/DOMPurify) (Apache 2.0 / MPL 2.0) to keep rendered HTML safe
