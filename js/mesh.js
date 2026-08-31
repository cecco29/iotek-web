// js/mesh.js -- el vocabulario de lineas de Iotek.
// Regla dura: los segmentos se agrupan por (grupo, opacidad). Sin agrupar,
// un modelo son mil draw calls; agrupado, diez. Por eso las opacidades son
// un vocabulario cerrado y no un numero libre.
export const C = { FOSFORO: 0x86E5FF, PLACA: 0x0A3049, BLANCO: 0xFFFFFF };
export const suave = t => t * t * (3 - 2 * t);
export const tope  = (v, a, b) => Math.min(b, Math.max(a, v));

export class Lotes {
  constructor(THREE) { this.THREE = THREE; this.lotes = new Map(); }

  seg(a, b, o, grupo) {
    const k = `${grupo}|${o}`;
    let l = this.lotes.get(k);
    if (!l) { l = { grupo, o, v: [] }; this.lotes.set(k, l); }
    l.v.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  }

  marco(w, d, y, o, grupo, cx = 0, cz = 0) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    this.seg([x0, y, z0], [x1, y, z0], o, grupo);
    this.seg([x1, y, z0], [x1, y, z1], o, grupo);
    this.seg([x1, y, z1], [x0, y, z1], o, grupo);
    this.seg([x0, y, z1], [x0, y, z0], o, grupo);
  }

  aristas(w, h, d, x, y, z, o, grupo) {
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y, y1 = y + h, z0 = z - d / 2, z1 = z + d / 2;
    for (const [a, b] of [
      [[x0,y0,z0],[x1,y0,z0]],[[x1,y0,z0],[x1,y0,z1]],[[x1,y0,z1],[x0,y0,z1]],[[x0,y0,z1],[x0,y0,z0]],
      [[x0,y1,z0],[x1,y1,z0]],[[x1,y1,z0],[x1,y1,z1]],[[x1,y1,z1],[x0,y1,z1]],[[x0,y1,z1],[x0,y1,z0]],
      [[x0,y0,z0],[x0,y1,z0]],[[x1,y0,z0],[x1,y1,z0]],[[x1,y0,z1],[x1,y1,z1]],[[x0,y0,z1],[x0,y1,z1]],
    ]) this.seg(a, b, o, grupo);
  }

  volumen(w, h, d, x, y, z, lo, fo, grupo) {
    this.aristas(w, h, d, x, y, z, lo, grupo);
    this.marco(w, d, y + h, fo, grupo, x, z);
  }

  volcar(destino) {
    const { THREE } = this, salida = new Map();
    for (const [k, l] of this.lotes) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(l.v, 3));
      // toneMapped:false -- el vocabulario de realce esta escrito en color
      // final (fosforo y blanco puro). Si el renderer tiene tone mapping
      // (moviles.html lo usa para el camion solido) la curva se comeria el
      // blanco del organo activo y desaturaria el cian.
      const m = new THREE.LineBasicMaterial({
        color: C.FOSFORO, transparent: true, opacity: l.o, toneMapped: false,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const ls = new THREE.LineSegments(g, m);
      ls.userData.grupo = l.grupo; ls.userData.o = l.o;
      destino.add(ls); salida.set(k, ls);
    }
    this.lotes.clear();
    return salida;
  }

  puntos(cantidad, extension) {
    const { THREE } = this;
    const c = document.createElement("canvas"); c.width = c.height = 32;
    const ctx = c.getContext("2d");
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(255,255,255,.9)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    const pos = new Float32Array(cantidad * 3);
    for (let i = 0; i < cantidad; i++) {
      pos[i * 3]     = (Math.random() - .5) * extension;
      pos[i * 3 + 1] = Math.random() * 6;
      pos[i * 3 + 2] = (Math.random() - .5) * extension;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({
      map: tex, color: C.FOSFORO, size: 2, sizeAttenuation: true, toneMapped: false,
      transparent: true, opacity: .18, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(g, m);
  }
}
