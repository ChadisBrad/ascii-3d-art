/**
 * shapes.js: two worked pieces for ascii3d.js, a rose that grows and opens and
 * a diamond ring that is drawn in by light and turns. Each is a scene with
 * step(t, g, view) that fills a character grid for time t (seconds); the demo
 * page runs them. Written for the skill from the method JIN2 (@jin_22ee)
 * showed; the code is independent. Use them as templates for other objects.
 */

import {
    TAU, camera, clamp, cloud, clearGrid, concat, facet, glintRays, outlinesAndFill, particles, project, rasterize, reveal, rotateY, seeded, shade, smooth, surface,
} from "./ascii3d.js";

// ---------------------------------------------------------------- shared effects

/** Sparks thrown off the drawing tip, falling with gravity. */
function sparksFrom(tipPts, t, rand, count, out) {
    out.length = 0;
    if (!tipPts.length) return out;
    for (let k = 0; k < count; k++) {
        const r = rand[k];
        const base = tipPts[(r[0] * tipPts.length) | 0];
        const age = (t * 1.7 + r[1]) % 1, a = r[2] * TAU, s = 0.3 + 0.5 * r[3], up = 0.3 + 0.7 * r[4];
        const tt = age * 0.55;
        out.push([base[0] + Math.cos(a) * s * tt, base[1] + up * tt - 0.7 * tt * tt, base[2] + Math.sin(a) * s * tt, (1 - age) ** 1.4 * (0.6 + 0.4 * Math.sin(age * 25 + a)), r[3] > 0.6 ? 1 : 0]);
    }
    return out;
}

/** Points into flat arrays for particles(). */
function packParticles(list, kindOf) {
    const n = list.length, c = cloud(n), glow = new Float32Array(n), kinds = new Uint8Array(n);
    list.forEach((q, k) => {
        c.p[k * 3] = q[0];
        c.p[k * 3 + 1] = q[1];
        c.p[k * 3 + 2] = q[2];
        glow[k] = q[3];
        kinds[k] = kindOf(q[4]);
    });
    return { c, glow, kinds };
}

/** A dim mirror of the body below a floor at y = floor, drawn as particles. */
function reflection(body, lum, vis, floor, kind) {
    const list = [];
    for (let k = 0; k < body.n; k += 2) {
        if (vis[k] < 0.96) continue;
        list.push([body.p[k * 3], 2 * floor - body.p[k * 3 + 1], body.p[k * 3 + 2], 0.18 * clamp(lum[k], 0, 1.2), kind]);
    }
    return list;
}

// ---------------------------------------------------------------- the rose

const R = { STEM: 0, LEAF: 1, SEPAL: 2, PETAL: 3, EDGE: 4, GLINT: 5, FIRE: 6, ICE: 7, DUST: 8, REFL: 9 };
export const ROSE_PALETTE = [[70, 214, 96], [52, 196, 84], [86, 206, 104], [255, 40, 70], [255, 128, 152], [255, 255, 255], [255, 182, 208], [190, 222, 255], [255, 214, 150], [150, 64, 84]];

const HEAD_Y = 0.22;
const stemAt = (s) => [0.045 * Math.sin(s * 3.1 + 0.4) - 0.02, -1.15 + s * (HEAD_Y + 1.15), 0.02 * Math.sin(s * 2)];

/** A pointed oval leaf from a point on the stem, folded on its midrib, its tip bending down. */
function leaf(at, side, length, lift, part) {
    const base = stemAt(at);
    let d = [side * Math.cos(lift), Math.sin(lift), 0.25 * side];
    const dl = Math.hypot(...d);
    d = d.map((v) => v / dl);
    const wide = [d[1] * 1 - 0, -(d[0] * 1), 0].map((v, i, a) => v / (Math.hypot(...a) || 1));
    const up = [wide[1] * d[2] - wide[2] * d[1], wide[2] * d[0] - wide[0] * d[2], wide[0] * d[1] - wide[1] * d[0]];
    return surface(60, 21, (s, v) => {
        const w = v * 2 - 1;
        const hw = 0.15 * Math.pow(Math.sin(Math.PI * s), 0.75) * (length / 0.42);
        const fold = 0.05 * Math.abs(w) - 0.1 * s * s;
        return [0, 1, 2].map((i) => base[i] + d[i] * (0.07 + s * length) + wide[i] * w * hw + up[i] * fold);
    }, { part, kind: R.LEAF, order: (s) => at + 0.05 + s * 0.25, outward: () => up });
}

/** Five sepals under the head, folding back as it opens. */
function sepals(open) {
    const list = [];
    for (let i = 0; i < 5; i++) {
        const a0 = (TAU * i) / 5 + 0.3;
        list.push(surface(26, 7, (s, v) => {
            const w = v * 2 - 1;
            const beta = 1.05 + 0.35 * open + (0.55 + 0.75 * open) * s;
            const L = 0.36 - 0.06 * open;
            const r = 0.045 + L * s * Math.sin(beta);
            const ang = a0 + (w * 0.1 * Math.pow(1 - s, 1.3)) / Math.max(r / 0.2, 0.25);
            return [Math.cos(ang) * r, HEAD_Y + 0.02 + L * s * Math.cos(beta), Math.sin(ang) * r];
        }, { part: 3, kind: R.SEPAL, order: (s) => 1 + 0.1 * s, outward: (x, y, z) => [x, -0.6, z] }));
    }
    return concat(list);
}

/**
 * The head: the widely shared parametric rose surface (one spiral that makes
 * every petal), blended from a closed egg-shaped bud as `open` goes 0 to 1.
 * th runs round the spiral (outer petals first), xx up each petal.
 */
// sampled densely: the outer petals sweep a long way round, and a cell left empty inside the
// flower draws a false outline round the hole (560 round the spiral left three-cell gaps)
const TH0 = 2.2 * Math.PI, TH1 = 20 * Math.PI, NT = 1400, NX = 32;
function head(open) {
    const A = 1.6 + 4 * open, w = smooth(open / 0.6);
    return surface(NT, NX, (u, xx) => {
        const th = TH0 + u * (TH1 - TH0), thn = u;
        const phi = (Math.PI / 2) * Math.exp(-th / (A * Math.PI));
        const m = (3.6 * th) % TAU;
        const X = 1 - 0.5 * Math.pow(1.25 * Math.pow(1 - m / Math.PI, 2) - 0.25, 2);
        const y = 1.95653 * xx * xx * Math.pow(1.27689 * xx - 1, 2) * Math.sin(phi);
        const r = X * (xx * Math.sin(phi) + y * Math.cos(phi));
        const S = 0.8;
        const ox = r * Math.sin(th) * S * (1.05 - 0.05 * open);
        const oy = X * (xx * Math.cos(phi) - y * Math.sin(phi)) * S * (0.84 + 0.16 * open) + HEAD_Y;
        const oz = r * Math.cos(th) * S * (1.05 - 0.05 * open);
        const rb = (0.17 * Math.pow(xx, 0.7) * Math.pow(1 - xx, 0.75)) / 0.367 * (1 - 0.3 * thn) + 0.003;
        const bx = rb * Math.sin(th), by = HEAD_Y + 0.03 + 0.52 * xx * (1 - 0.06 * thn), bz = rb * Math.cos(th);
        return [bx * (1 - w) + ox * w, by * (1 - w) + oy * w, bz * (1 - w) + oz * w];
    }, {
        // each turn of the spiral's lobes is its own petal: outlines are drawn between them
        part: (u) => 10 + Math.floor((3.6 * (TH0 + u * (TH1 - TH0))) / TAU),
        kind: (u, xx) => (xx > 0.93 ? R.EDGE : R.PETAL),
        order: (u, xx) => 1.1 + xx * 0.42 + (1 - u) * 0.1,
        outward: (x, y, z) => [x, 0.2 * Math.hypot(x, z), z],
    });
}

export function roseScene() {
    const stem = surface(14, 200, (u, s) => {
        const c = stemAt(s), r = 0.026 + 0.006 * (1 - s), a = u * TAU;
        return [c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r];
    }, { part: 0, kind: R.STEM, order: (u, s) => s, outward: (x, y, z) => { const c = stemAt((y + 1.15) / (HEAD_Y + 1.15)); return [x - c[0], 0, z - c[2]]; } });
    const leaves = concat([leaf(0.32, -1, 0.42, 0.35, 1), leaf(0.55, 1, 0.36, 0.45, 2)]);
    const rnd = seeded(13), spk = Array.from({ length: 900 }, () => [rnd(), rnd(), rnd(), rnd(), rnd()]);
    const dust = Array.from({ length: 420 }, () => [rnd(), rnd(), rnd(), rnd(), rnd()]);
    const dew = Array.from({ length: 36 }, () => [rnd(), rnd()]);
    const cam = camera([0, 1.75, 4], [0, -0.05, 0], 2.9);
    const DRAW = [0.3, 5.4], OMAX = 1.66, FLOOR = -1.22;
    const bloom = (t) => { const u = clamp((t - 5.5) / 9); return u * (2 - u) * 0.55 + u * u * (3 - 2 * u) * 0.45; };
    const sway = (t) => 0.22 * Math.sin(Math.max(t - 7, 0) * 0.35) * smooth((t - 7) / 4);
    let turned = null, proj = null, lum = null, rv = null;
    const sparkList = [];

    return {
        title: "rose",
        palette: ROSE_PALETTE,
        length: 20,
        /** Fill the grid for time t. view = { cols, rows, aspect }. */
        step(t, g, { cols, rows, aspect }) {
            const open = bloom(t);
            const flower = head(open);
            const body = concat([stem, leaves, sepals(open), flower]);
            turned = rotateY(body, sway(t), turned && turned.n === body.n ? turned : undefined);
            const key = [-0.35, 0.85, 0.65].map((v) => v / Math.hypot(-0.35, 0.85, 0.65));
            const rim = [Math.cos(t * 0.8), 0.4, Math.sin(t * 0.8)].map((v, i, a) => v / Math.hypot(...a));
            lum = shade(turned, { key, rim, view: cam.view }, lum && lum.length === body.n ? lum : undefined);
            // the heart of the flower a little darker, for depth
            const f0 = body.n - flower.n;
            for (let k = f0; k < body.n; k++) {
                const u = ((k - f0) % NT) / (NT - 1);
                lum[k] *= 0.74 + 0.26 * (1 - u);
            }
            const head_ = ((t - DRAW[0]) / (DRAW[1] - DRAW[0])) * OMAX;
            rv = reveal(turned.order, head_, 0.07, 0.03, rv && rv.vis.length === body.n ? rv : undefined);
            proj = project(turned, cam, cols, rows, aspect, proj && proj.sx.length === body.n ? proj : undefined);
            // dew: a few outer petal points glint once it is open
            const glints = new Set([R.GLINT]);
            if (open > 0.85) {
                for (const d of dew) {
                    const k = f0 + ((d[0] * flower.n * 0.35) | 0);
                    const tw = Math.pow(clamp(Math.sin(t * 3 + d[1] * 30)), 8);
                    if (tw > 0.4) {
                        turned.kind[k] = R.GLINT;
                        lum[k] = Math.max(lum[k], 0.6 + 0.6 * tw);
                    }
                }
            }
            clearGrid(g);
            rasterize(g, turned, proj, lum, { vis: rv.vis, tip: rv.tip, tipKind: R.GLINT, glintKinds: glints });
            outlinesAndFill(g, t);
            // particles: sparks from the tip while it draws, slow dust, the floor reflection
            const tips = [];
            for (let k = 0; k < body.n; k += 7) if (rv.tip[k]) tips.push([turned.p[k * 3], turned.p[k * 3 + 1], turned.p[k * 3 + 2]]);
            sparksFrom(t < DRAW[1] + 0.2 ? tips : [], t, spk, 600, sparkList);
            const dustList = dust.map((q) => {
                const a = q[0] * TAU + t * (0.05 + 0.08 * q[1]), r = 0.55 + 1.6 * Math.pow(q[2], 0.7);
                const tw = Math.pow(clamp(Math.sin(t * (1.2 + 2.5 * q[1]) + q[4] * 40)), 6);
                return [Math.cos(a) * r, -1.1 + 2.3 * q[3] + 0.05 * Math.sin(t * 0.6 + q[4] * TAU), Math.sin(a) * r * 0.6 - 0.35, (0.1 + 0.85 * tw) * smooth((t - 1 - q[3] * 3) / 1.5), q[4] < 0.12 ? 2 : q[4] < 0.3 ? 3 : 1];
            });
            const all = packParticles([...sparkList, ...dustList, ...reflection(turned, lum, rv.vis, FLOOR, 4)], (k) => [R.DUST, R.GLINT, R.ICE, R.FIRE, R.REFL][k]);
            particles(g, project(all.c, cam, cols, rows, aspect), all.glow, all.kinds, { dim: new Set([R.REFL]) });
            glintRays(g, t, { count: 4, kind: R.GLINT });
            return { bloom: open };
        },
    };
}

// ---------------------------------------------------------------- the diamond ring

const D = { BAND: 0, PRONG: 1, GEM: 2, GLINT: 3, FIRE_R: 4, FIRE_B: 5, FIRE_G: 6, DUST: 7, REFL: 8 };
export const RING_PALETTE = [[255, 204, 120], [236, 226, 212], [206, 230, 255], [255, 255, 255], [255, 150, 172], [150, 200, 255], [178, 255, 204], [255, 214, 150], [96, 86, 74]];

function ringBody() {
    const RB = 0.55, TUBE = 0.065;
    const up = (y) => Math.abs(Math.atan2(Math.sin(y), Math.cos(y)));
    // the band: a torus standing up, thinner under the stone; drawn from the bottom up both sides
    const band = surface(420, 36, (u, v) => {
        const a = u * TAU, b = v * TAU;
        const rr = TUBE * (1 - 0.35 * Math.pow(Math.max(0, Math.sin(a)), 6));
        const cx = Math.cos(a), cy = Math.sin(a);
        return [cx * (RB + rr * Math.cos(b)), cy * (RB + rr * Math.cos(b)), rr * 1.5 * Math.sin(b)];
    }, { part: 0, kind: D.BAND, order: (u) => up(u * TAU + Math.PI / 2) / Math.PI, outward: (x, y, z) => { const a = Math.atan2(y, x); return [x - Math.cos(a) * RB, y - Math.sin(a) * RB, z]; } });
    // four prongs from the band's top to the stone's girdle
    const GY = 0.88, GR = 0.25, TY = 1.0, TR = 0.135, CY = 0.66;
    const prongs = [];
    for (let i = 0; i < 4; i++) {
        const a = (TAU * (i + 0.5)) / 4;
        const base = [0.08 * Math.cos(a), RB + 0.02, 0.08 * Math.sin(a)], tip = [(GR + 0.015) * Math.cos(a), TY - 0.03, (GR + 0.015) * Math.sin(a)];
        const d = tip.map((v, k) => v - base[k]), dl = Math.hypot(...d), dn = d.map((v) => v / dl);
        const s0 = [dn[1], -dn[0], 0].map((v, k, arr) => v / (Math.hypot(...arr) || 1)), w0 = [dn[1] * s0[2] - dn[2] * s0[1], dn[2] * s0[0] - dn[0] * s0[2], dn[0] * s0[1] - dn[1] * s0[0]];
        prongs.push(surface(10, 34, (u, s) => {
            const ph = u * TAU, n = [0, 1, 2].map((k) => Math.cos(ph) * s0[k] + Math.sin(ph) * w0[k]);
            return [0, 1, 2].map((k) => base[k] + d[k] * s + n[k] * 0.022);
        }, {
            part: 1,
            kind: D.PRONG,
            order: (u, s) => 1 + s * 0.25,
            // away from the prong's own axis
            outward: (x, y, z) => {
                const q = [x - base[0], y - base[1], z - base[2]], s = q[0] * dn[0] + q[1] * dn[1] + q[2] * dn[2];
                return [q[0] - dn[0] * s, q[1] - dn[1] * s, q[2] - dn[2] * s];
            },
        }));
    }
    // the stone: a round brilliant, sixteen-fold. Every facet is flat, with one normal, and is its own part
    const facets = [];
    let id = 0;
    const gem = (p) => 1.25 + ((p[1] - CY) / (TY - CY)) * 0.45;
    for (let i = 0; i < 16; i++) {
        const a0 = (TAU * i) / 16, a1 = (TAU * (i + 1)) / 16;
        const g0 = [GR * Math.cos(a0), GY, GR * Math.sin(a0)], g1 = [GR * Math.cos(a1), GY, GR * Math.sin(a1)];
        const t0 = [TR * Math.cos(a0), TY, TR * Math.sin(a0)], t1 = [TR * Math.cos(a1), TY, TR * Math.sin(a1)];
        const cul = [0, CY, 0], top = [0, TY, 0];
        const nrm = (p, q, r, wantUp) => { const u = q.map((v, k) => v - p[k]), v = r.map((x, k) => x - p[k]); let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; if ((n[1] > 0) !== wantUp) n = n.map((x) => -x); return n; };
        const crown = nrm(g0, g1, t0, true);
        facets.push(facet(g0, g1, t0, crown, { part: 10 + id++, kind: D.GEM, order: gem }));
        facets.push(facet(g1, t1, t0, [crown[0], crown[1] * 1.15, crown[2]], { part: 10 + id++, kind: D.GEM, order: gem }));
        facets.push(facet(g0, g1, cul, nrm(g0, g1, cul, false), { part: 10 + id++, kind: D.GEM, order: gem }));
        facets.push(facet(top, t0, t1, [0, 1, 0], { part: 9, kind: D.GEM, order: gem }));
    }
    return concat([band, ...prongs, ...facets]);
}

export function ringScene() {
    const body = ringBody();
    // a little above, like a jeweller's photograph, with room over the stone for its rays
    const cam = camera([0, 0.75, 3.6], [0, 0.32, 0], 2.7);
    const DRAW = [0.3, 5.6], TURN = 12, FLOOR = -0.78;
    const rnd = seeded(14);
    const spk = Array.from({ length: 900 }, () => [rnd(), rnd(), rnd(), rnd(), rnd()]);
    const burstR = Array.from({ length: 520 }, () => [rnd(), rnd(), rnd()]);
    const halo = Array.from({ length: 700 }, () => [rnd(), rnd()]);
    let turned = null, proj = null, lum = null, rv = null;
    const sparkList = [];
    const omax = body.order.reduce((m, v) => Math.max(m, v), 0);
    return {
        title: "diamond ring",
        palette: RING_PALETTE,
        length: 20,
        step(t, g, { cols, rows, aspect }) {
            const spin = (TAU * Math.max(t - DRAW[1] - 0.6, 0)) / TURN;
            turned = rotateY(body, spin, turned ?? undefined);
            const key = [0, 0.8, 0.6].map((v) => v / Math.hypot(0, 0.8, 0.6));
            const rim = [Math.cos(t * 0.9), 0.5, Math.sin(t * 0.9)].map((v, i, a) => v / Math.hypot(...a));
            lum = shade(turned, { key, rim, view: cam.view, specular: 0.45, keyPower: 30, rimPower: 22 }, lum ?? undefined);
            // fire: facets that catch the light flicker between white and soft colours
            for (let k = 0; k < turned.n; k++) {
                if (turned.kind[k] !== D.GEM && turned.kind[k] < D.GLINT) continue;
                if (body.kind[k] !== D.GEM) continue;
                const f = turned.part[k];
                const hit = lum[k] > 1.15;
                const pick = (f * 7 + Math.floor(t * 6)) % 9;
                turned.kind[k] = hit ? (pick < 3 ? D.FIRE_R : pick < 5 ? D.FIRE_B : pick < 6 ? D.FIRE_G : D.GLINT) : D.GEM;
            }
            const head = ((t - DRAW[0]) / (DRAW[1] - DRAW[0])) * omax;
            rv = reveal(turned.order, head, 0.06, 0.035, rv ?? undefined);
            proj = project(turned, cam, cols, rows, aspect, proj ?? undefined);
            clearGrid(g);
            rasterize(g, turned, proj, lum, { vis: rv.vis, tip: rv.tip, tipKind: D.GLINT, glintKinds: new Set([D.GLINT, D.FIRE_R, D.FIRE_B, D.FIRE_G]) });
            outlinesAndFill(g, t);
            // particles: sparks from the tip, the ring of light when it is finished, two golden orbits, the reflection
            const tips = [];
            for (let k = 0; k < body.n; k += 9) if (rv.tip[k]) tips.push([turned.p[k * 3], turned.p[k * 3 + 1], turned.p[k * 3 + 2]]);
            sparksFrom(t < DRAW[1] + 0.2 ? tips : [], t, spk, 700, sparkList);
            const list = [...sparkList];
            const kb = t - DRAW[1] - 0.1;
            if (kb > 0 && kb < 2.2) {
                for (const q of burstR) {
                    const a = q[0] * TAU, r = 0.85 + 2.4 * (1 - Math.exp(-kb * 2)) * (0.97 + 0.06 * q[1]);
                    list.push([Math.cos(a) * r, 0.42 + Math.sin(a) * r, (q[2] - 0.5) * 0.05 - 0.4, Math.pow(clamp(1 - kb / 2.2), 1.5), q[1] < 0.25 ? 2 : q[1] < 0.45 ? 3 : 1]);
                }
            }
            const on = smooth((t - DRAW[1] - 0.3) / 1.5);
            if (on > 0) {
                halo.forEach((q, i) => {
                    const tilt = i % 2 ? -0.55 : 0.55, a = q[0] * TAU + t * (i % 2 ? -0.7 : 0.9), r = 1.05 + 0.04 * q[1];
                    const x = Math.cos(a) * r, z = Math.sin(a) * r;
                    list.push([x, 0.42 + z * Math.sin(tilt), z * Math.cos(tilt), on * (0.25 + 0.6 * Math.pow(clamp(Math.sin(t * 3 + q[1] * 40)), 4)), 0]);
                });
            }
            const all = packParticles([...list, ...reflection(turned, lum, rv.vis, FLOOR, 4)], (k) => [D.DUST, D.GLINT, D.FIRE_R, D.FIRE_B, D.REFL][k]);
            particles(g, project(all.c, cam, cols, rows, aspect), all.glow, all.kinds, { dim: new Set([D.REFL]) });
            glintRays(g, t, { count: 4, kind: D.GLINT });
            return { turn: spin };
        },
    };
}
