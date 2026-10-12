// Copied from FinHR (owner 12/10/2026: an uploaded signature showed black because the old editor saved JPEG).
// Stamp and signature uploads (owner"s report 08/10/2026: they printed too small). A photo or scan usually has
// paper around the ink: make the paper colour transparent and cut the empty margin away, so the ink itself
// fills the box on the documents. Done in the browser before upload; the result is a PNG.
// `keepPaper` (logos, owner 12/10/2026: an uploaded logo printed tiny): only cut the empty margin, colours stay as they are.
export async function tidyImage(file: Blob, keepPaper = false): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return file;
    g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h); const px = d.data;
    // the paper colour: the average of the opaque pixels along the edges
    const ink = new Uint8Array(w * h).fill(1); // keepPaper: 0 = paper
    let n = 0, R = 0, G = 0, B = 0;
    const edge = (x: number, y: number) => { const i = (y * w + x) * 4; if ((px[i + 3] ?? 0) > 200) { R += px[i] ?? 0; G += px[i + 1] ?? 0; B += px[i + 2] ?? 0; n++; } };
    for (let x = 0; x < w; x++) { edge(x, 0); edge(x, h - 1); }
    for (let y = 0; y < h; y++) { edge(0, y); edge(w - 1, y); }
    if (n) {
      R /= n; G /= n; B /= n;
      const light = R + G + B > 450; // only a light background (paper) is removed, never a dark one
      if (light) for (let i = 0; i < px.length; i += 4) {
        const dist = Math.hypot((px[i] ?? 0) - R, (px[i + 1] ?? 0) - G, (px[i + 2] ?? 0) - B);
        if (keepPaper) { if (dist < 40) ink[i / 4] = 0; continue; }
        if (dist < 40) px[i + 3] = 0; else if (dist < 80) px[i + 3] = Math.min(px[i + 3] ?? 0, Math.round(((dist - 40) / 40) * 255)); // soft edge
      }
    }
    // cut away the empty margin
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((px[(y * w + x) * 4 + 3] ?? 0) > 24 && ink[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return file; // nothing left: keep the original
    const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02);
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    g.putImageData(d, 0, 0);
    const out = document.createElement("canvas"); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext("2d")!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return await new Promise<Blob>((ok) => out.toBlob((b) => ok(b ?? file), "image/png"));
  } catch { return file; } finally { URL.revokeObjectURL(url); }
}
