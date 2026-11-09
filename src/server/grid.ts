/** Rejilla espacial para encontrar rápido a los enemigos cercanos a un punto. */
export class SpatialGrid<T extends { x: number; y: number }> {
  private cells = new Map<number, T[]>();
  constructor(private cellSize = 80) {}

  private key(cx: number, cy: number) {
    return (cx + 1000) * 4096 + (cy + 1000);
  }

  rebuild(items: Iterable<T>) {
    this.cells.clear();
    for (const it of items) {
      const k = this.key(Math.floor(it.x / this.cellSize), Math.floor(it.y / this.cellSize));
      let c = this.cells.get(k);
      if (!c) this.cells.set(k, (c = []));
      c.push(it);
    }
  }

  /** Devuelve los elementos en las celdas que tocan el círculo (sin filtrar por distancia exacta). */
  query(x: number, y: number, r: number, out: T[] = []): T[] {
    out.length = 0;
    const s = this.cellSize;
    const x0 = Math.floor((x - r) / s), x1 = Math.floor((x + r) / s);
    const y0 = Math.floor((y - r) / s), y1 = Math.floor((y + r) / s);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const c = this.cells.get(this.key(cx, cy));
        if (c) for (const it of c) out.push(it);
      }
    return out;
  }
}
