# Memory Archive: design exploration

A personal archive for everything that inspires, informs or triggers me. It also works as a tool
for finding out what has shaped me as an artist.

This document collects ideas for what the archive could be. The prototype in this repo
(`index.html`) is a sketch to react to. It is not a decision.

---

## 1. The archive has two jobs

| Keeping | Uncovering |
|---|---|
| Fast capture of anything: a thought, a photo, a link, a file | Seeing patterns I wasn't aware of |
| Nothing gets lost | Tracing a piece of my work back to its roots |
| Low friction, so I actually use it | Being surprised by my own past |

Most tools (Notion, Pinterest, Google Drive) only do the first job well. What makes this archive
mine is the second job, and that depends on **connections and reasons** more than on folders.

## 2. Principles

1. **One pool, many lenses.** Every item lives in one place. Structure comes from how I *look*
   at the pool: by time, by image, by connection, by lineage. I don't have to file things in
   advance.
2. **The "why" is the most valuable data.** A link between two things is useful. The sentence
   *"after that critique, she showed me less could be enough"* is what uncovers who I am.
   Every connection can carry a reason.
3. **Record when it entered my life, not when I uploaded it.** A childhood memory captured
   today belongs in 1998. This makes the timeline a biography.
4. **My own work is the anchor.** Works are special items. Influences gather around them, and
   the Lineage lens traces them backwards.
5. **Resonance over category.** Besides *what* something is (image, note, source), the archive
   records *how* it affects me: it **inspires**, **informs** or **triggers** me. Triggers
   (irritation, discomfort, resistance) shape an artist as much as admiration does.
6. **Capture is quick, reflection comes later.** Drop something in now and add meaning later.
   *Drift* brings old items back so they can be reflected on again.

## 3. Metaphors to explore

Each metaphor suggests a different structure and look. Try them out loud: which one feels like *your* archive?

### The Studio Wall
Everything pinned up side by side, at a glance. Visual-first, loose, rearrangeable.
*Look:* masonry, images large, little text. *Prototype:* the **Wall** lens.
*Could grow into:* a free canvas where you place and cluster items by hand (like Kosmik or Milanote).

### The Constellation / Mycelium
Nothing has a fixed place. Everything is defined by what it touches, and clusters appear on their own.
*Look:* a dark or paper-coloured field with nodes and threads. *Prototype:* the **Constellation** lens.
*Watch out:* graphs look impressive but can become a hairball. They work best filtered (one tag, one period).

### The Strata / Excavation
Layers of time, like sediment. Dig down to see what was there in 2014, under everything since.
*Look:* a vertical timeline with years as layers. *Prototype:* the **Stream** lens.
*Could grow into:* "chapters" of life (art school, a move, a relationship) as named layers,
and a yearly ritual of writing what defined that layer.

### The Family Tree / Lineage
My work has ancestors. Who are its parents and grandparents?
*Look:* rings or generations moving outwards from a work. *Prototype:* the **Lineage** lens.
*Could grow into:* direction on connections ("A influenced B"), so a real ancestry
can be drawn, and a printable "lineage sheet" for each work, useful for statements and portfolios.

### The Cabinet of Curiosities (Wunderkammer)
Drawers and boxes. Small curated collections ("things that are red", "voices I return to").
*Look:* a physical, tactile feel with drawers, labels and objects.
*Could grow into:* **collections** as a second layer above tags. These are hand-made, ordered and annotated, like an exhibition.

### The Garden
Ideas are seeds that grow, need tending, or go dormant.
*Could grow into:* item "states" (seed → sprouting → evergreen) that show which inspirations
are still alive in my work and which have been composted.

These metaphors can be combined. The prototype already mixes four of them as lenses on one pool.

## 4. Data model (as in the prototype)

```
Item
  type        thought | note | image | source | quote | file | work
  title, body
  url         for online sources
  image/file  uploaded media
  date        when it entered my life (not upload date)
  resonance   inspires | informs | triggers
  tags        free, lightweight

Connection
  a, b        two items
  note        WHY they are connected  ← the most important field
```

Ideas to consider adding:
- **Direction** on connections (influenced / responded to / contradicts).
- **Collections**: curated, ordered selections with an intro text.
- **People** as first-class items (teachers, artists, friends) since many influences come through a person.
- **Places** with a map lens: where was I when this struck me?
- **Intensity** (a small or a life-changing impression).
- **Revisits**: a log of each time I came back to an item and what I thought then. This
  shows how my reading of a source changes over the years.

## 5. Rituals (how the archive gets used)

Structure only helps if the archive is used regularly. Possible rituals:
- **Daily capture**: under 10 seconds, from the phone (share-sheet or e-mail-in).
- **Weekly connect**: 15 minutes to add reasons and connections to the week's captures.
- **Drift**: one random older item at a time, to reflect on again.
- **Per work**: when finishing a piece, trace its lineage and write down what fed it.
- **Yearly strata**: look at the year's layer and name what defined it.

## 6. Questions for me to reflect on

1. When I think of my influences, do I *see* them (images), *hear* them (voices, quotes) or
   *feel* them (moments, places)? The answer decides which lens should be home.
2. Do I want the archive to be calm and quiet, or rich and overwhelming like a crowded wall?
3. Is this strictly private, or could parts of it become public, as a portfolio, a website or even an artwork?
4. Do I trust myself to tag and connect, or do I want the archive to *suggest* connections
   (e.g. "these three items share a colour / a word / a year")?
5. What is the smallest unit: a single image, or a whole moment (photo + feeling + place)?
6. Where do I capture most: phone, laptop, sketchbook? (Scanning analogue material matters for an artist.)

## 7. Technical paths forward

The prototype is a single HTML page with no build step and no server. Data stays in the browser
(localStorage, about 5 MB, so not enough for many photos). Use **Export** for backups.

Possible next steps, roughly from small to big:

1. **Keep it local, store data as files**: save items as Markdown + images in a folder (also
   readable in Obsidian), so the archive outlives any app.
2. **Add a small back-end** (e.g. Supabase or PocketBase) for real storage, phone access and photos in full size.
3. **Phone capture**: a share-sheet target / PWA so links and photos go in with one tap.
4. **Smart suggestions**: let an AI model propose connections, describe images, and pull
   metadata from links. The suggestions should always be confirmed by me.
5. **Publishing**: turn a lineage or collection into a public page.

Existing tools that partly do this, worth trying for comparison: **Are.na** (closest
in spirit, made for artists, "channels" of blocks), **Obsidian** (notes + graph, local files),
**Kosmik / Milanote** (visual canvas), **Tana / Capacities** (typed objects). None of them puts
*lineage of my own work* and *resonance* at the centre, which is the reason to build something of my own.
