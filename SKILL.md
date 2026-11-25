---
name: ascii-3d-art
description: 'Make glowing, lit, outlined 3D objects drawn only with characters (letters, numbers, symbols), in the style of JIN2 (@jin_22ee): a rose that grows and blooms, a diamond ring drawn in by light, any object built from 3D surfaces, lit, outlined with | / \ - _ and filled with letters by brightness, with sparkles, sparks, glow and trails. Use this whenever someone wants ASCII art, text art or "made of letters" art of an object or animation, an ASCII flower, ring, cake, gift or logo, a glowing character-based 3D render for a website, canvas, video or terminal, or says "like that ascii account", "JIN2 style", "ascii code art", even if they never say "3D". Not for converting photos into ASCII (that is a different pipeline: sample the image per cell), and not for plain text banners (figlet).'
---

# ASCII 3D art (the JIN2 method)

The look: a dark screen, an object made of thousands of characters, lit like a 3D model, outlined in slashes and bars that follow its edges, filled with letters that get denser where it is brighter, sparkles with four-pointed rays, sparks that fall, soft glow. It is drawn in by a travelling point of light and then moves (blooms, turns, sways).

Credit: the method comes from JIN2 (@jin_22ee, github.com/JIN2-ASCII, "IN BLOOM" rose and "WILL YOU" diamond ring). His code is free to read, study and change for personal projects, but not for commercial use without his written permission, and he asks for credit. So:
- Never copy his code into a project. Use the engine in `scripts/` (an independent implementation written from the method) or write your own.
- Credit "after JIN2 (@jin_22ee)" wherever the result is shown or posted.
- For client or commercial work, the method is general graphics technique and fine to use; his code and his artworks are not.

## The method, in eight steps

Each step says why it matters; the numbers are starting points that worked.

1. **Build the object as a point cloud that knows its normals.** Every part (stem, leaf, petals, band, facets) is a parametric surface `at(u, v) -> [x, y, z]` sampled on a grid. The normal at each point is the cross product of the two grid directions (finite differences), flipped to face outward. Normals are what make it look 3D once lit. Give each point a `part` id (outlines are drawn between parts) and a `kind` (its colour slot).
   - Flat facets (a cut gem): fill each triangle with points that all share ONE normal, and make each facet its own part. Whole facets then flash at once and get outlined from their neighbours, which is what reads as "cut stone".
   - Sample densely. A cell left empty inside the object draws a false outline round the hole and the texture turns to noise. Aim for several points per character cell over the whole visible surface, especially on parts that sweep a long way round (outer petals).

2. **Animate the geometry, not the picture.** Rebuild or transform the points each frame: a bud blended into an open flower (`p = bud * (1 - w) + open * w`, w eased), a slow turn about the vertical axis, a sway, loose outer parts lagging the motion.

3. **Reveal with a travelling light.** Give every point an `order` (when it is drawn: stem bottom to top, then leaves, then the head from its base). A "head" value sweeps through the orders; points behind it show (with a soft edge), points right at it are the bright tip that seems to draw the object, throwing sparks.

4. **Light it.** Brightness = ambient (about 0.6, so the shadow side still reads as letters) + diffuse from a fixed key light from above + sharp Blinn-Phong highlights from the key and from a rim light that slowly circles. A moving rim light is what makes metal shine and facets sparkle over time.

5. **Project with a still camera.** Perspective from an eye a little above the object, like a product photograph. Multiply y by the grid's aspect (grid pixel width / pixel height) so circles stay round, because character cells are taller than wide.

6. **Points to letters.** For each character cell:
   - the nearest point wins (keep a depth per cell);
   - a cell is an edge if a neighbour (up, down, left, right) is empty or belongs to another part that sits further back by more than a small gap; the direction to the outside neighbours picks the edge glyph: mostly sideways `|`, mostly up/down `-` (top) or `_` (bottom), diagonal `/` or `\`;
   - inside cells take a letter from a pool chosen by brightness, dark to bright, for example `.:;il!` `rcvxz=+t` `aeosun{}<>` `8B#$&%@Q`, picked by a per-cell hash that drifts slowly with time (a shimmer, never banding);
   - sparkle points (glints, lit facets, dew) become `*`, and the few brightest, spaced apart, throw four-pointed rays of `-` `|` `/` `\` that fade outward and pulse in length.

7. **Particles and reflection.** Sparks off the drawing tip with gravity, twinkling dust drifting round the object, a burst ring of light when it finishes, a dim mirror of the object below a floor line. Particles only go into empty cells: `*` bright, `+` middling, `.` faint; the reflection uses the dark pool.

8. **Glyphs to pixels.** Pre-render every character once per colour and brightness step (an atlas) so a frame is one image copy per cell. Colour = the kind's colour times brightness. Fade the previous frame (about half) and keep the brighter of old and new: trails. Add two blurred copies (made by shrinking) on top as light: glow. Pure black background.

## Using the engine in scripts/

- `scripts/ascii3d.js`: the engine, a dependency-free ES module (JSDoc types; paste into TypeScript with light annotation). `surface`, `facet`, `concat`, `rotateY`, `camera`, `project`, `shade`, `reveal`, `grid`, `rasterize`, `outlinesAndFill`, `glintRays`, `particles`, `createRenderer`.
- `scripts/shapes.js`: two complete pieces to copy from, `roseScene()` (stem, folded leaves, sepals, the widely shared parametric rose surface blended from a bud, dew, sparks, dust, reflection) and `ringScene()` (torus band, four prongs, a sixteen-fold brilliant of flat facets with "fire", sparks, a burst ring, two tilted golden orbits, a slow turn).
- `scripts/demo.html`: runs both. Serve the folder over http (module scripts do not load from file://), open `demo.html?scene=rose` or `?scene=ring`. `window.__ascii.at(t)` draws the frame for time t and stops the clock, for screenshots.

A new object: write each part as a `surface(nu, nv, (u, v) => [x, y, z], { part, kind, order, outward })`, give it a palette (one RGB per kind), and copy a scene's `step(t, g, view)`: transform, `shade`, `reveal`, `project`, `clearGrid`, `rasterize`, `outlinesAndFill`, particles, `glintRays`. Then `renderer.draw(g)`.

For the formulas (the rose surface, the bud, the facet normals, the outline rule, the lighting) and the deeper tuning, read `references/pipeline.md`.

## Tuning and traps

- **Grid size**: about 120 x 68 cells of 9 x 14 px suits a 1080 x 960 picture. Fewer cells make it chunkier and cheaper; on a phone 70 to 90 columns is plenty.
- **Noise everywhere** = holes: raise the sampling of the sweeping parts before anything else. Too many outlines inside one smooth part = the depth gap is too small.
- **Flat-looking object**: ambient too high or the key light too frontal; move the key above and to the side, let the rim light circle.
- **Rays fanning into stacks of bars**: the brightest glints are neighbours; pick them spaced apart (the engine's `spread`).
- **Performance**: the cost is the points (rebuild, shade, project) plus one image copy per cell. The demo rose is about 45k points and 14ms a frame on a desktop, the ring 2 to 3ms. On phones: fewer points (sample by arc length rather than uniformly), cap the device pixel ratio at 2, run at 30 frames a second, skip rebuilding geometry that has not changed, and reuse typed arrays instead of allocating per point.
- **Reduced motion**: draw the finished object once, no reveal, no particles.
- **Colour**: one colour per kind (stem greens, petal red, a paler pink for petal rims, white glints, a pink and an ice blue for "fire", warm gold for dust, a dim tone for the reflection) times brightness. Keep the background black so the glow reads.

## Small pictures (cards, corners, icons)

Learned making a potted tulip (behind a toy's water, about 300 x 330 px) and a puffy heart (a letter's corner, 118 x 138 px) for a small web app of cards:
- **Chunky and simple reads as cute**: a big head, a short stem, a round little pot, three to six big petals. Spiral roses turn to noise below about 60 columns.
- **Cells about 4.6 x 7.2 CSS px**: small enough to read as a picture, big enough to read as letters.
- **Face flat parts to the camera.** A leaf whose width runs along the view axis is seen edge-on and shows as a thin line; lay its width across the picture and cup it gently forward.
- **Sample surfaces of revolution densely round** (90 to 100 steps for a pot): a front column of empty cells draws a false seam straight down the middle.
- **Mind the host's timing.** If something hands over soon after the payoff (a toy moving on 2.6 s after the win), speed the payoff up so it finishes in view.
- **Background**: leave the grid's canvas clear to sit on a dark scene; on a pale page give it its own small dark print behind (a `backdrop`).
- **Frames**: redraw about 30 a second while it grows, about 15 at rest, and blit the cached canvas in between, so a host drawing every frame pays almost nothing.

## Checking the result

Render frames at fixed times (draw a second of frames before each, so trails and particles build as they would live), make a contact sheet, and look at it: the object should read at a glance, outlines should trace real edges (not holes), the inside should be letters, and sparkles should be few and spaced. Measure the frame time. On a website the real phone is the judge.

## In Python instead

JIN2 works in Python (NumPy for the points, pygame-ce for the window, glyph atlas and blur). The same eight steps apply with NumPy arrays: vectorise the surfaces and the lighting, scatter into the cell buffers ordered far to near so the nearest wins, and blit glyph masks tinted per cell.
