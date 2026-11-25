# The pipeline in detail

Read this when building a new object, tuning the look, or porting the engine.
Method after JIN2 (@jin_22ee); the formulas below are general graphics, and
the rose surface is the widely shared parametric rose.

## Contents
1. Surfaces and normals
2. The rose head and its bud
3. A cut gem from flat facets
4. Reveal order and the drawing tip
5. Lighting
6. Projection and the cell aspect
7. The cell buffers and the outline rule
8. Fill pools and shimmer
9. Glints and rays
10. Particles and reflection
11. The renderer: atlas, trails, glow
12. Performance budget

## 1. Surfaces and normals

Sample `at(u, v)` on an `nu x nv` grid. For grid point (i, j):

    du = P(i+1, j) - P(i-1, j)      (one-sided at the edges)
    dv = P(i, j+1) - P(i, j-1)
    n  = normalize(cross(du, dv))
    if dot(n, outward(P)) < 0: n = -n

`outward` is any direction the surface should face there: for a tube, the
point minus the nearest point on its axis; for a flower head, the horizontal
direction away from the stem plus a little up. Without it, half a surface can
light inside out.

Useful primitives:
- **Tube along a curve c(s)**: `c(s) + r(s) * (cos a, 0, sin a)` for a mostly
  vertical stem; build a frame (direction, side, up) for slanted tubes.
- **Leaf**: a pointed oval along a direction `d` from a base point, half-width
  `hw(s) = w * sin(pi s)^0.75`, folded on the midrib (`+ up * k|w|`) and
  drooping at the tip (`- up * k2 s^2`).
- **Torus band**: `(cos a (R + r cos b), sin a (R + r cos b), r' sin b)`;
  thin it under a stone with `r * (1 - 0.35 * max(0, sin a)^6)`.

## 2. The rose head and its bud

One spiral surface makes every petal. With `th` from 2.2 pi to 20 pi (outer
petals first) and `x` from 0 to 1 up each petal, `A = 1.6 + 4 * open`:

    phi = (pi / 2) * exp(-th / (A * pi))
    m   = (3.6 * th) mod 2 pi
    X   = 1 - 0.5 * (1.25 * (1 - m / pi)^2 - 0.25)^2
    y   = 1.95653 * x^2 * (1.27689 x - 1)^2 * sin(phi)
    r   = X * (x sin(phi) + y cos(phi))
    P   = size * (r sin th, X (x cos(phi) - y sin(phi)), r cos th)

Squash y a little while closed (`* (0.84 + 0.16 open)`). The closed bud is an
egg: `rb = 0.17 x^0.7 (1 - x)^0.75 / 0.367 * (1 - 0.3 thn) + 0.003`, with
`thn` the spiral position 0..1, at height `0.52 x`. Blend
`P = bud (1 - w) + open w` with `w = smoothstep(open / 0.6)`, so the bud
loosens before the petals lean out. The part id
`floor(3.6 th / 2 pi)` makes each petal lobe its own part, so outlines run
between petals. Mark `x > 0.93` as the rim kind (paler colour). Darken the
heart a little (`* (0.74 + 0.26 * (1 - thn))`) for depth.

Sample at least ~1400 x 32 for a head about 60 cells wide: the outer turns
sweep a long way round and sparse sampling leaves holes.

## 3. A cut gem from flat facets

A round brilliant, simplified, sixteen-fold: girdle ring at height `gy` and
radius `gr`, table ring at `ty`, `tr`, culet point below. Per segment i:
- crown: triangles (g0, g1, t0) and (g1, t1, t0), normal up and out;
- pavilion: (g0, g1, culet), normal down and out;
- table: (centre, t0, t1), normal straight up, all one part.
Each triangle is filled with points sharing one normal and is its own part.
"Fire": where a facet's brightness passes a threshold, switch its kind
between white and soft colours (pink, ice blue, mint) by a hash of the facet
and time, and mark it as a sparkle.

## 4. Reveal order and the drawing tip

Orders run 0..max: stem `s`, leaves `at + 0.05 + 0.25 s`, sepals `1 + 0.1 s`,
head `1.1 + 0.42 x + 0.1 (1 - thn)`. Ring: band by height round both sides,
prongs after, then the stone from the culet up. Each frame:

    head = (t - start) / (end - start) * max
    vis  = smoothstep((head - order) / soft)      soft about 0.05 to 0.09
    tip  = |head - order| < 0.03

Hidden points are skipped; tip points are drawn as bright glints and seed
sparks.

## 5. Lighting

    key  = normalize(-0.35, 0.85, 0.65)          fixed, above and to one side
    rim  = normalize(cos 0.8t, 0.4, sin 0.8t)     circling slowly
    h1   = normalize(key + view), h2 = normalize(rim + view)
    lum  = 0.62 + 0.6 max(0, n.key) + 0.3 (max(0, n.h1)^24 + 0.7 max(0, n.h2)^18)

Metals and gems: raise the specular weight and exponents (0.45, 30, 22).

## 6. Projection and the cell aspect

Camera basis from eye and target (forward, right, up). For a point relative
to the eye: `rx, ry, rz` (rz clamped above 0.2), then

    sx = (0.5 + rx / rz * F * 0.5) * cols
    sy = (0.5 - ry / rz * F * 0.5 * aspect) * rows,   aspect = cols * cellW / (rows * cellH)

F about 2.7 to 3.0. Keep the camera still; move the object.

## 7. The cell buffers and the outline rule

Buffers per cell: part (-1 empty), depth, brightness, kind, glint flag.
Write a point if it is nearer than the cell's depth (or sort far to near and
let later writes win). Then for each filled cell look at the 8 neighbours. A
neighbour is "outside" if it is empty, or is another part further back by
more than a gap (about 0.035 world units). Sum the offsets to outside
neighbours into (gx, gy). The cell is an edge if any of its 4 direct
neighbours is outside. Glyph:

    |gx| > 2|gy|        ->  |
    |gy| > 2|gx|        ->  _ if gy > 0 (outside below), - if outside above
    gx * gy > 0         ->  \
    otherwise           ->  /

Edge cells are drawn bright (at least 0.85).

## 8. Fill pools and shimmer

Four pools, dark to bright. Level = floor(brightness * 3.2) clamped. Within
the pool pick by a cell hash `h = (y * 7919 + x * 104729) mod 9973`, offset
by `floor(t * 4 + h mod 11)`, so the letters drift slowly and no two
neighbours match. Remap inside brightness to 0.45..1 so even the shadow side
glows faintly.

## 9. Glints and rays

Sparkle cells become `*`. Pick the few brightest (spaced several cells
apart), and draw arms: sideways `-` stepping two cells per row unit (cells are
tall), vertical `|`, diagonal `/` `\` at half reach, each arm fading out and
only overwriting dimmer cells. Pulse the reach with
`base + swing * (0.5 + 0.5 sin(7t + n))`.

## 10. Particles and reflection

- Sparks: from tip points, random direction, upward kick, gravity, life about
  a second, glow `(1 - age)^1.4` with a flicker.
- Dust: a slow orbit of points round the object, each twinkling
  (`max(0, sin(...))^6`), fading in over the first seconds.
- Burst: when drawing ends, a ring of points expanding fast then slowing
  (`r = r0 + R (1 - exp(-2k))`), fading over two seconds.
- Orbits: two tilted circles of gold dust turning in opposite directions.
- Reflection: the visible body mirrored below a floor (`y -> 2 floor - y`),
  brightness about 0.18 of the body's, drawn with the dark pool.
Particles never overwrite body cells and never show through a nearer body.

## 11. The renderer: atlas, trails, glow

- Atlas: for each kind and each of 8 brightness steps, draw every character in
  that colour into a strip. A frame is then one `drawImage` per cell.
- Trails: keep a canvas; each frame darken it to about half (draw black at
  alpha 0.5), then draw the new frame with `lighten` (per channel max).
- Glow: shrink the kept picture to 1/4 and again to 1/10, stretch both back
  over it with `lighter` at about 0.55 and 0.45 alpha.
- Font: a monospace at about 95% of the cell height; centre each glyph.

## 12. Performance budget

Per frame: rebuild changed geometry (allocation-free in production: write into
reused typed arrays, not `[x, y, z]` arrays per point), shade and project every
point (a few multiply-adds each), one pass over the cells for outlines and
fill, one image copy per non-empty cell, three full-canvas composites. The
reference demo: rose about 45k points, 14ms a frame on a desktop; ring about
2 to 3ms. For phones aim under 8ms on a desktop: cut points, cut columns, cap
DPR at 2, 30 frames a second, and draw a still frame under reduced motion.
