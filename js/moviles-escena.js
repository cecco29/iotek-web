// Escena de moviles.html: un camion de perfil avanza por una ruta.
// La camara queda fija respecto del camion -- lo que se mueve es el mundo.
//
// Ejes: la ruta corre sobre Z, el camion mira a +Z y la camara vive en -X.
// Con eso "adelante" es la derecha de la pantalla, y al avanzar el mundo
// corre hacia la izquierda (MOVILES.md, "Camara y encuadre").
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { C, Lotes, suave, tope } from "./mesh.js";

const LARGO_RUTA = 600;   // unidades de mundo que recorre el progreso 0..1
const X_CAMION   = 0;     // el camion no se mueve: se mueve el mundo
const Z_MIRA     = -1.5;  // centro visual del camion sobre el eje de la ruta
const ANCHO_RUTA = 7;     // media calzada
const GRADO = Math.PI / 180;

/* ── Las cinco paradas ──────────────────────────────────────────────
   Los porticos viven DENTRO de `mundo`, en Z local fija; el camion vive
   fuera, clavado en el origen. Entonces la Z de mundo de un portico es
   `zLocal + mundo.position.z`, y baja a medida que el progreso crece
   (`avanzar` corre el mundo hacia -Z). El portico 01 es la compuerta que
   convierte el camion de solido a mesh; los otros cuatro solo marcan.   */
const Z_PORTICO_01     = 92;    // Z local del portico de lectura
// LARGO_RUTA / 5, y no es un numero suelto: el layout le da a cada parada un
// bloque de 100vh dentro de un rango de scroll de 500vh, o sea exactamente un
// quinto del progreso. Si la separacion sobre la ruta no vale ese mismo quinto,
// cada parada se enciende un poco antes que la anterior y su bloque de texto
// aparece mas abajo en pantalla, parada a parada (con 105 la deriva era de
// 12.5vh por parada: el texto arrancaba a 177px y terminaba a 627px de un
// viewport de 900, encima del alambre del camion en la 04 y la 05).
const ESPACIO_PORTICOS = 120;   // separacion entre paradas sobre la ruta
const OP_APAGADO = .26;         // vocabulario de realce: activo en blanco, resto al 26%
// Vocabulario cerrado de organos. El indice es el numero de parada 0..4.
const ORGANOS = ["org-ubicacion", "org-conducta", "org-estado", "org-consumo", "org-geocerca"];

// (`PARADAS` se calcula mas abajo: necesita las cotas del camion.)

/* ── Camara ─────────────────────────────────────────────────────────
   Casi lateral, con 12 grados de tres cuartos: la elevacion pura queda
   plana y no se le lee la cara a la cabina.                            */
const TRES_CUARTOS = 12 * GRADO;   // giro respecto de la lateral pura

// El encuadre se pide en NDC, no en grados ni con un lookAt a ojo: -1 es el
// borde de abajo (o el izquierdo), +1 el de arriba (o el derecho).
//   horizonte -0.40  ->  el horizonte cae al 70% de la altura
//   piso      -0.86  ->  las ruedas de este lado, al 93%
//   paneo     -0.16  ->  el camion clavado cerca del 42% del ancho
const ENCUADRE_ANCHO   = { d: 27, horizonte: -0.40, piso: -0.86, paneo: -0.16 };
// En mobile el cuadro es angosto y alto: la camara se aleja para que el
// camion entre entero a lo largo, y el horizonte sube.
const ENCUADRE_ANGOSTO = { d: 78, horizonte: -0.46, piso: -0.80, paneo: -0.03 };

/* EL EMPUJE POR PARADA
   Cada parada corre la camara un poco hacia SU organo, igual que en Abismo
   cada parada mira a su zona. Son DELTAS sobre el encuadre base, no encuadres
   completos: `k` multiplica la distancia y el resto se suma en NDC, asi que
   valen igual en los dos aspectos y no hay que mantener diez encuadres.
   Los sentidos no son obvios y conviene tenerlos a mano:
     horizonte  mas negativo -> el horizonte baja en pantalla
     piso       mas negativo -> la camara SUBE (la linea de piso cae al borde)
     paneo      mas negativo -> el camion corre a la izquierda, o sea que
                                entra en cuadro lo que tiene por delante
   REGLA DURA, y es la que cuesta una ronda de arreglos: `horizonte` y `piso`
   se mueven JUNTOS. La altura de camara sale de la DIFERENCIA entre los dos
   (piso - horizonte), y la posicion del camion en pantalla sale del valor
   ABSOLUTO de `horizonte`. Bajar la camara tocando solo `piso` sube el camion
   dentro del cuadro y lo mete en la zona del texto. Cada empuje de aca esta
   calculado para dejar el techo del remolque (y=4.9) donde lo deja el
   encuadre base -- NDC -0.26, o sea el 63% de la altura -- variando altura y
   distancia, que es lo que se ve.
   Alturas de camara resultantes en desktop, contra las cotas del camion (eje
   a 0.85, tanque a 1.18, parabrisas de 3.55 a 4.20, techo de caja a 4.90):
   3.70 / 3.26 / 1.94 / 2.60 / 26.0.
   Ojo con acercarse mas: con el techo a NDC -0.26 y las gomas dentro del
   cuadro, el camion no entra entero por debajo de d 23. (La 05 es la
   excepcion: mira el piso desde arriba, el camion se acorta por escorzo y
   entra igual.)                                                           */
const EMPUJE_NEUTRO = { k: 1, horizonte: 0, piso: 0, paneo: 0 };
const EMPUJES = [
  { k: 1.00, horizonte:  .00, piso:  .00, paneo:  .00 },  // 01 ubicacion: el plano de lectura no se toca
  { k:  .86, horizonte: -.03, piso: -.05, paneo: -.26 },  // 02 conducta: a la altura del parabrisas, sobre la cabina
  { k:  .93, horizonte: -.25, piso: -.06, paneo: -.12 },  // 03 estado: baja al piso, entre las gomas
  { k:  .89, horizonte: -.18, piso: -.09, paneo: -.22 },  // 04 consumo: bajo el chasis, sobre el tanque
  /* 05 geocercas: el unico empuje que NO es un ajuste del plano lateral, y el
     unico que se resolvio midiendo la escena en vez de a ojo.
     - `horizonte` 2.20 lo deja en 1.80 ABSOLUTO, o sea afuera del cuadro por
       arriba: de ahi para abajo todo lo que se ve es piso. Es la unica manera
       de que un poligono apoyado en el suelo lea como zona; con el horizonte
       adentro se aplasta por escorzo y salen tres rayas.
     - `piso` sube a -.36 absoluto por una razon geometrica exacta: la mitad
       del poligono esta MAS CERCA de la camara que el camion, y `piso` es la
       NDC donde cae la linea de piso del camion. Con `piso` cerca de -1 (que
       es donde estaba) esa mitad queda debajo del borde inferior POR
       DEFINICION. Era la causa real de que se vieran 2 vertices de 6.
     - `paneo` -.56 absoluto no es cosmetico: el mastil del portico 05 mide
       8.6 m y desde una camara alta se le va la punta hacia arriba, justo a la
       zona del texto. Correr el mundo a la izquierda lo saca del bloque en vez
       de taparlo. Verificado sobre los 508 vertices reales del grupo, no sobre
       un modelo a mano del portico -- el muestreo grueso se escapaba. */
  { k: 1.30, horizonte: 2.20, piso:  .50, paneo: -.40 },
];
// En el cuadro angosto el camion entra justo a lo largo: ahi el empuje va a
// media fuerza o un plano corto le come la cola.
const ATENUAR_ANGOSTO = .55;

/* LA 05 ANGOSTA NO SE DERIVA DEL CUADRO ANCHO.
   Es la unica parada con encuadre propio, y no por gusto: un corredor de 22
   unidades sobre la ruta, visto en un cuadro vertical de 390x844, no entra
   NUNCA con los deltas del cuadro ancho atenuados. Medido barriendo el espacio
   de encuadres: 2.46 millones de combinaciones rechazadas por eso solo. Lo que
   si funciona es subir mucho mas la camara (67 m) y ACERCARLA (k .60 sobre los
   78 del encuadre angosto, no alejarla), porque en un cuadro alto y angosto el
   eje largo del poligono cae sobre la vertical de la pantalla, que es la
   dimension que sobra. El costo es que el camion queda en 72 px de alto, y esta
   aceptado: en la 05 el sujeto es la zona, no el vehiculo.
   Estos valores son FINALES, no se atenuan (ver EMPUJES_ANGOSTO). */
const EMPUJE_05_ANGOSTO = { k: .60, horizonte: 3.40, piso: .20, paneo: -.10 };

/* EL CAMION
   Tractor trompudo (capo largo, no cab-over) con semirremolque: silueta
   larga y baja, que es la que deja al camion ocupar el ancho de la pantalla
   sin salirse del tercio inferior. Las cotas se leen en metros: la caja mide
   12.3 y el tractor 4.8, que es la proporcion real de un equipo de larga
   distancia. Cotas compartidas: los organos se cuelgan de estas piezas, no
   de numeros sueltos.
   IMPORTANTE: el largo total (-10.00 .. 7.11) es el mismo de antes de
   detallar la trompa. El encuadre de camara esta afinado contra ese largo y
   en mobile el camion entra justo, asi que lo que gano el tractor se le
   desconto a la caja en vez de estirar el conjunto.                     */
const REMOLQUE = { w: 4.2, h: 3.0, d: 12.3, y: 1.9, z: -3.85 }; // -10.00 .. 2.30
const CABINA   = { w: 4.0, h: 2.7, d:  2.4, y: 1.5, z:  3.55 }; //   2.35 .. 4.75
const Z_TROMPA = 7.11;              // cara del paragolpes: el punto mas adelantado
const R_RUEDA = 0.85;
const X_RUEDA = 2.15;
const ANCHO_RUEDA = 0.56;
const R_LLANTA = 0.52;              // disco de la llanta, hundido dentro de la goma
// direccion + tandem de tractor + tandem de remolque: diez gomas, que es lo
// que lleva un equipo de larga distancia (con tres ejes leia como camioncito).
const Z_EJES  = [5.70, 1.70, -0.10, -7.60, -9.40];

/* PERFILES
   Poligonos (z, y) que se barren sobre X. Son la diferencia entre un camion
   y una caja: el capo baja hacia la parrilla, el parabrisas se reclina y el
   carenado de techo empalma con la caja. Tienen que ser CONVEXOS: las tapas
   del solido se triangulan en abanico desde el vertice 0.                */
const Z_CAB0 = CABINA.z - CABINA.d / 2, Z_CAB1 = CABINA.z + CABINA.d / 2;
const Y_TECHO = CABINA.y + CABINA.h;      // 4.20
const Y_PARABRISAS = 3.55;                // donde el capo entrega al vidrio
const CAPO = { w: 3.5, z1: 6.75, y0: 1.72, y1: 3.02 };
const PARAGOLPES = { w: 3.9, h: .62, d: .36, y: 1.02 };
// La parrilla no va pegada a la cara del capo: sobresale dentro de una caja
// de cromo, y las lineas se dibujan sobre esa cara adelantada. Solido y mesh
// leen la misma cota, si no el gemelo queda hundido medio decimetro.
const Z_PARRILLA = CAPO.z1 + .13;

const P_CABINA = [
  [Z_CAB0, CABINA.y], [Z_CAB1, CABINA.y],
  [Z_CAB1, Y_PARABRISAS],          // base del parabrisas
  [Z_CAB1 - .33, Y_TECHO],         // el vidrio se reclina 0.33 hacia atras
  [Z_CAB0, Y_TECHO],
];
const P_CAPO = [
  [Z_CAB1, CAPO.y0], [CAPO.z1, CAPO.y0],
  [CAPO.z1, CAPO.y1],              // borde alto de la parrilla
  [Z_CAB1, Y_PARABRISAS],          // sube 0.53 hasta el parabrisas
];
const P_DEFLECTOR = [              // carenado: iguala la altura de la caja
  [Z_CAB1 - .45, Y_TECHO], [Z_CAB0 + .05, REMOLQUE.y + REMOLQUE.h + .10],
  [Z_CAB0 + .05, Y_TECHO],
];
// Tanque de combustible: octogono, que de perfil lee como cilindro. El
// tanque vive bajo la puerta, entre el eje de direccion y el tandem.
const TANQUE = { x: 1.92, w: .82, z: 3.75, largo: 2.7, y: 1.18, r: .52 };
const P_TANQUE = (() => {
  const { z, largo, y, r } = TANQUE, L = largo / 2, c = .18;
  return [
    [z - L, y - r + c], [z - L + c, y - r], [z + L - c, y - r], [z + L, y - r + c],
    [z + L, y + r - c], [z + L - c, y + r], [z - L + c, y + r], [z - L, y + r - c],
  ];
})();
// Caños de escape verticales detras de la cabina, uno por flanco.
const ESCAPE = { x: 2.18, z: 2.88, r: .14, y0: 1.70, y1: 5.62 };

// Progreso 0..1 de cada parada: el portico ya termino de barrer el camion y
// le quedo apenas atras. Medido contra el centro del camion, en la parada 01
// la mitad del vehiculo seguiria en solido.
// Dan 0.18 / 0.38 / 0.58 / 0.78 / 0.98: separadas de a un quinto exacto, que
// es lo que el layout le asigna a cada bloque de texto (ver ESPACIO_PORTICOS).
// CONVENCION (la consume la Task 6): `paradas` NO son Z de mundo, son valores
// de progreso listos para comparar contra el progreso de scroll. La Z de mundo
// cambiaria de signo segun quien la mire (el mundo corre hacia -Z), asi que se
// resuelve una sola vez aca.
const Z_LEIDO = REMOLQUE.z - REMOLQUE.d / 2 - 6;   // cola del camion, con margen
const PARADAS = [0, 1, 2, 3, 4].map(
  i => (Z_PORTICO_01 + i * ESPACIO_PORTICOS - Z_LEIDO) / LARGO_RUTA);
// Indice de la parada mas cercana a un progreso dado.
const paradaEn = progreso => PARADAS.reduce(
  (mejor, p, i) => (Math.abs(progreso - p) < Math.abs(progreso - PARADAS[mejor]) ? i : mejor), 0);

/* El empuje interpolado en un progreso dado. Los nudos son las cinco paradas
   mas uno neutro en 0, que es el plano general con el que abre la pagina.
   `suave` en cada tramo deja la derivada en cero AL LLEGAR a cada nudo: la
   camara se aquieta en la parada en vez de cruzarla de largo, que es lo que
   convierte cinco encuadres en cinco planos. Despues de la ultima parada
   sostiene su encuadre hasta el cierre.                                   */
/* Hay dos juegos de nudos, uno por aspecto, y la ATENUACION SE RESUELVE ACA y
   no por cuadro. Antes `fijarCamara` multiplicaba cada delta por `fuerza` y
   topeaba `k` en cada llamada; eso ya no sirve, porque la 05 angosta tiene
   valores propios que NO hay que atenuar (ver EMPUJE_05_ANGOSTO). Resolverlo
   al armar la tabla deja los dos casos explicitos y saca cuatro
   multiplicaciones del bucle.
   El tope `min(k,1)` en el cuadro angosto sigue vigente para las paradas 01-04:
   ahi el camion entra justo a lo largo y un retroceso extra le come la cola. */
const atenuar = e => ({
  k:         1 + (Math.min(e.k, 1) - 1) * ATENUAR_ANGOSTO,
  horizonte: e.horizonte * ATENUAR_ANGOSTO,
  piso:      e.piso      * ATENUAR_ANGOSTO,
  paneo:     e.paneo     * ATENUAR_ANGOSTO,
});
const EMPUJES_ANGOSTO = [...EMPUJES.slice(0, 4).map(atenuar), EMPUJE_05_ANGOSTO];
const nudosDe = tabla => [{ p: 0, e: EMPUJE_NEUTRO }, ...PARADAS.map((p, i) => ({ p, e: tabla[i] }))];
const NUDOS_ANCHO   = nudosDe(EMPUJES);
const NUDOS_ANGOSTO = nudosDe(EMPUJES_ANGOSTO);
// objeto de trabajo: `avanzar` corre por cuadro y no vale la pena basurear
const empuje = { k: 1, horizonte: 0, piso: 0, paneo: 0 };
function empujeEn(progreso, nudos) {
  let i = 0;
  while (i < nudos.length - 2 && progreso > nudos[i + 1].p) i++;
  const a = nudos[i].e, b = nudos[i + 1].e;
  const t = suave(tope((progreso - nudos[i].p) / (nudos[i + 1].p - nudos[i].p), 0, 1));
  for (const clave of ["k", "horizonte", "piso", "paneo"]) {
    empuje[clave] = a[clave] + (b[clave] - a[clave]) * t;
  }
  return empuje;
}

// Z de mundo del portico que en este momento tiene el camion mas cerca. Los
// porticos viven en `mundo`, asi que su Z de mundo es zLocal + mundo.position.z.
function zPorticoCercano(zMundo) {
  let mejor = Infinity;
  for (let i = 0; i < 5; i++) {
    const z = Z_PORTICO_01 + i * ESPACIO_PORTICOS + zMundo;
    if (Math.abs(z) < Math.abs(mejor)) mejor = z;
  }
  return mejor;
}
const INTENSIDAD_PORTICO = 620;   // candelas: PointLight con decay 2, a ~9 de la chapa

export function montarEscena(host) {
  // Presupuesto: en pantallas chicas o maquinas de pocos nucleos se baja el
  // mapa de sombra y se apagan los mapas de detalle. Es lo unico que cambia
  // entre las dos calidades -- la luz y los materiales son los mismos.
  const liviano = Math.min(window.innerWidth, window.innerHeight) < 620
               || (navigator.hardwareConcurrency || 8) <= 4;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    // el verificador lee pixeles del canvas ya presentado
    preserveDrawingBuffer: new URLSearchParams(location.search).has("verificar"),
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x051826, 1);
  /* Tone mapping ACES + exposicion: es lo que convierte el render "de motor"
     en render fotografico. Sin curva, un metal con un especular fuerte se
     recorta en blanco plano y el resto del flanco se hunde en el fondo; con
     ACES el rolloff conserva el degrade del reflejo.
     Solo toca al camion solido: las lineas y los puntos de `mesh.js` llevan
     `toneMapped:false` justamente para que el vocabulario de realce siga
     saliendo en fosforo y blanco puro exactos. */
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  // PCF a secas y no PCFSoft: el plano que recibe la sombra ocupa media
  // pantalla y el filtro blando cuesta tres veces mas por pixel. A esta
  // escala de sombra (una mancha bajo el vehiculo) no se distingue.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  host.appendChild(renderer.domElement);

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(38, 1, 0.1, 2000);
  camara.rotation.order = "YXZ";

  // Luz + entorno: solo afectan a los materiales PBR del camion solido (las
  // lineas y superficies MeshBasic del resto de la escena no reaccionan a
  // luces ni a environment), asi que esto no le cambia el look a nada mas.
  const { pmrem, luzPortico } = iluminarCamion(escena, renderer, liviano);

  const mundo = new THREE.Group();      // todo lo que se desplaza con el scroll
  escena.add(mundo);

  const lotes = new Lotes(THREE);
  construirRuta(lotes);
  construirFondo(lotes, mundo);
  for (let i = 0; i < 5; i++) construirPortico(lotes, Z_PORTICO_01 + i * ESPACIO_PORTICOS, i);
  // la estela termina donde esta la trompa del camion en la parada 01
  construirEstela(lotes, Z_PORTICO_01 - Z_LEIDO + Z_TROMPA);
  // La geocerca va CENTRADA en el camion en el instante de la parada 05, no
  // colgada del portico: la 05 promete "envolviendo el tramo", y un poligono
  // que queda al costado del vehiculo lee como mancha en el piso. En la
  // parada 05 el mundo esta en -PARADAS[4]*LARGO_RUTA, asi que esa es la Z
  // local que cae sobre el camion (+2 lo corre apenas hacia la trompa).
  // El -0.7 sale de la cuenta, no del gusto: con 22 unidades de largo para un
  // camion de 17, la ventana en la que el poligono lo contiene entero es
  // [-1.53, +0.07]. En 0 el borde trasero queda tangente a la cola; -0.7 es el
  // centro de esa ventana y deja margen en las dos puntas.
  construirGeocerca(lotes, PARADAS[4] * LARGO_RUTA - 0.7);
  // El Map de volcar() se descarta apenas se llama, asi que se guarda: de
  // aca salen las lineas "org-geocerca" y "org-ubicacion" que viven en el
  // mundo (la geocerca y la estela son de la ruta, no del vehiculo).
  const lineasMundo = lotes.volcar(mundo);

  // Recibe la sombra del camion. `ShadowMaterial` no pinta nada donde no hay
  // sombra, asi que no aparece un rectangulo de piso sobre el abismo: solo
  // se ve la mancha bajo el vehiculo. Va apenas POR DEBAJO de las lineas de
  // la ruta (y=0) y sin escribir profundidad, para no taparlas.
  // El plano se queda corto a proposito: solo el rectangulo donde puede caer
  // la sombra. Cada pixel de este plano paga una consulta al mapa de sombra
  // aunque este iluminado, asi que estirarlo a toda la ruta es relleno puro.
  const sombraPiso = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 24),
    new THREE.ShadowMaterial({ opacity: .62, depthWrite: false }),
  );
  sombraPiso.rotation.x = -Math.PI / 2;
  sombraPiso.position.set(X_CAMION, -.012, Z_MIRA);
  sombraPiso.receiveShadow = true;
  sombraPiso.renderOrder = -1;
  escena.add(sombraPiso);

  // El camion queda fuera de `mundo`: esta clavado en el origen y es el
  // mundo el que le pasa por al lado. El mesh es su gemelo geometrico y
  // por eso vive tambien fuera, en las mismas coordenadas absolutas.
  const { grupo: camion, ruedas: ruedasSolidas } = construirCamionSolido(liviano);
  escena.add(camion);

  const camionMesh = new THREE.Group();
  escena.add(camionMesh);
  const lotesMesh = new Lotes(THREE);
  construirCamionMesh(lotesMesh);
  const lineasMesh = lotesMesh.volcar(camionMesh);
  // Las gomas del mesh salen del lote general: tienen que girar, y una linea
  // batcheada con el resto del organo no se puede rotar sola. Son diez lotes
  // chicos de mas (el doctrinario de DESIGN.md habla de decenas, no de miles).
  const { ruedas: ruedasMesh, mapas: mapasRuedas } = construirRuedasMesh(camionMesh);
  const ruedas = [...ruedasSolidas, ...ruedasMesh];

  /* LA COMPUERTA
     Dos planos de recorte en espacio de mundo, a la altura del portico 01:
     el solido sobrevive del lado todavia no leido (Z menor que la cortina),
     el mesh del lado ya leido. Se recalculan en `avanzar` porque lo que se
     mueve es el portico, no el camion.                                    */
  renderer.localClippingEnabled = true;
  const planoSolido = new THREE.Plane(new THREE.Vector3(0, 0, -1),  Z_PORTICO_01);
  const planoMesh   = new THREE.Plane(new THREE.Vector3(0, 0,  1), -Z_PORTICO_01);
  // sin filtrar por tipo: los cantos del camion solido son LineSegments, no
  // Mesh, y con un predicado `isMesh` quedarian visibles despues del portico.
  camion.traverse(o => {
    if (!o.material) return;
    o.material = o.material.clone();
    o.material.clippingPlanes = [planoSolido];
    // `clipShadows` es obligatorio con sombra: sin el, la mitad ya leida del
    // camion desaparece de la imagen pero sigue proyectando sombra en la ruta.
    o.material.clipShadows = true;
  });
  for (const mapa of [lineasMesh, ...mapasRuedas]) {
    for (const linea of mapa.values()) linea.material.clippingPlanes = [planoMesh];
  }

  const encenderOrgano = armarEncendido([lineasMundo, lineasMesh, ...mapasRuedas]);

  // Lo guarda `avanzar` para que un resize reencuadre en la parada en la que
  // esta el lector, y no lo devuelva al plano general del arranque.
  let progresoCamara = 0;

  function fijarCamara() {
    const angosto = camara.aspect < 1;
    const base = angosto ? ENCUADRE_ANGOSTO : ENCUADRE_ANCHO;
    // los deltas ya vienen atenuados por aspecto desde la tabla de nudos
    const emp = empujeEn(progresoCamara, angosto ? NUDOS_ANGOSTO : NUDOS_ANCHO);
    const e = {
      d:         base.d * emp.k,
      horizonte: base.horizonte + emp.horizonte,
      piso:      base.piso      + emp.piso,
      paneo:     base.paneo     + emp.paneo,
    };
    const medio = Math.tan(camara.fov * GRADO / 2);
    // el horizonte cae `horizonte` por debajo del eje => la camara cabecea
    // hacia arriba justo ese angulo.
    const cabeceo = Math.atan(-e.horizonte * medio);
    const alPiso  = Math.atan(-e.piso * medio);
    // `piso` se mide sobre el flanco cercano del camion, no sobre la banquina
    const dPiso   = e.d * Math.cos(TRES_CUARTOS) - REMOLQUE.w / 2;
    const altura  = dPiso * Math.tan(alPiso - cabeceo);
    // el ancho del cuadro depende del aspecto, asi que el paneo se pide en
    // NDC y recien aca se vuelve angulo.
    const paneo   = Math.atan(-e.paneo * medio * camara.aspect);

    camara.position.set(
      X_CAMION - e.d * Math.cos(TRES_CUARTOS),
      altura,
      Z_MIRA   + e.d * Math.sin(TRES_CUARTOS)
    );
    // mirando a +X: yaw base -90 grados, mas los tres cuartos, menos el paneo
    // que corre el camion a la izquierda del centro.
    camara.rotation.set(cabeceo, -Math.PI / 2 + TRES_CUARTOS - paneo, 0);
  }

  function redimensionar() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
    fijarCamara();
    render();
  }
  redimensionar();

  function avanzar(progreso) {
    // el mundo se desplaza hacia -Z a medida que progreso crece: la ruta
    // corre hacia la izquierda y el camion no se mueve en el encuadre.
    mundo.position.z = -progreso * LARGO_RUTA;
    // El unico movimiento propio de la camara en toda la pagina: el empuje
    // corto hacia el organo de cada parada. Cuesta seis trig por cuadro.
    progresoCamara = progreso;
    fijarCamara();
    // La cortina viaja pegada al portico, que esta dentro de `mundo`: su Z
    // de mundo baja cuadro a cuadro y barre el camion de trompa a cola.
    const zCortina = Z_PORTICO_01 + mundo.position.z;
    planoSolido.constant =  zCortina;   // conserva z < zCortina (sin leer)
    planoMesh.constant   = -zCortina;   // conserva z > zCortina (ya leido)

    const metros = progreso * LARGO_RUTA;

    /* Las gomas ruedan de verdad: el arco recorrido dividido el radio. Como
       el mundo corre hacia -Z, el camion avanza hacia +Z, y una rueda que
       avanza a +Z gira en sentido POSITIVO sobre X. Sin esto el camion
       patinaba: es el detalle que mas delataba que la escena era una maqueta
       desplazandose, y no cuesta un solo vertice.                          */
    const giro = metros / R_RUEDA;
    for (const r of ruedas) r.rotation.x = giro;

    /* Suspension. Dos senos desfasados en altura y un cabeceo diez veces mas
       chico: alcanza para que el conjunto pese. Se aplica a los DOS camiones
       -- solido y mesh comparten transform o la costura del portico se abre. */
    const alza    = Math.sin(metros * .62) * .020 + Math.sin(metros * 1.9 + 1.1) * .011;
    const cabeceo = Math.sin(metros * .41 + .7) * .0022;
    for (const g of [camion, camionMesh]) {
      g.position.y = alza;
      g.rotation.x = cabeceo;
    }

    /* La luz del portico. Cada porton de lectura lleva su propia lampara, y
       al pasar barre el flanco con un reflejo que corre de trompa a cola: es
       el unico movimiento de luz de la pagina y es lo que hace que la chapa
       se lea como chapa y no como color plano. Se apaga con la distancia
       para que entre paradas la escena vuelva a la luz de estudio.          */
    const zP = zPorticoCercano(mundo.position.z);
    luzPortico.position.set(-2.4, ALTO_MASTIL - 1.1, zP);
    luzPortico.intensity = INTENSIDAD_PORTICO * suave(Math.max(0, 1 - Math.abs(zP) / 42));
  }

  function leerFondo(rectCliente) {
    // usado por el verificador: lee el pixel del canvas bajo un rect del DOM.
    const r = host.getBoundingClientRect();
    const dpr = renderer.getPixelRatio();
    const x = Math.round((rectCliente.left - r.left + rectCliente.width  / 2) * dpr);
    const y = Math.round((rectCliente.top  - r.top  + rectCliente.height / 2) * dpr);
    const { width, height } = renderer.domElement;
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    const gl = renderer.getContext();
    const px = new Uint8Array(4);
    gl.readPixels(x, height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return [px[0], px[1], px[2]];
  }

  function render() { renderer.render(escena, camara); }

  function destruir() {
    pmrem.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
  }

  return {
    avanzar, redimensionar, render, leerFondo, destruir, encenderOrgano,
    // `paradas` en metrica de progreso 0..1 (ver PARADAS arriba), y
    // `paradaEn(progreso)` para no repetir el reduce en cada consumidor.
    paradas: PARADAS, paradaEn,
    camion, camionMesh, mundo, camara, escena, largoRuta: LARGO_RUTA,
  };
}

/* ══════════════════════════════════════════════════════════════════
   EL MUNDO
   ══════════════════════════════════════════════════════════════════ */

function construirRuta(lotes) {
  // doble linea de banquina, continua, y marcas centrales en ritmo mono.
  const z0 = -60, z1 = LARGO_RUTA + 60;
  lotes.seg([-ANCHO_RUTA, 0, z0], [-ANCHO_RUTA, 0, z1], .22, "ruta");
  lotes.seg([ ANCHO_RUTA, 0, z0], [ ANCHO_RUTA, 0, z1], .22, "ruta");
  for (let z = z0; z < z1; z += 6) {
    lotes.seg([0, 0, z], [0, 0, z + 3], .14, "ruta-marca");
  }
}

function construirFondo(lotes, mundo) {
  // Campo de puntos tenue fuera de la banquina. Va todo del lado opuesto a
  // la camara: lo que queda detras de ella (x < -27) no se ve nunca.
  for (let i = 0; i < 4; i++) {
    const p = lotes.puntos(420, 300);
    p.position.set(170, 0, -100 + i * 250);
    mundo.add(p);
  }
  // Hitos lejanos en paralaje. Existen solo para que se perciba velocidad:
  // linea al 8%, dos profundidades desfasadas para que no marchen a compas.
  // Van 3 mas alla de LARGO_RUTA para que a progreso 1 (mundo en -LARGO_RUTA)
  // siempre quede alguno por delante del camion, no solo detras.
  for (let i = 0; i < 12; i++) {
    const lejos = i % 2 === 0;
    const alto = lejos ? 22 : 13;
    lotes.volumen(2.4, alto, 2.4, lejos ? 132 : 86, 0, -30 + i * 80 + (lejos ? 0 : 25),
                  .08, .08, "hito");
  }
}

/* ══════════════════════════════════════════════════════════════════
   LUZ Y ENTORNO
   El resto de la escena (rutas, porticos, el mesh de lineas) es todo
   MeshBasicMaterial/LineBasicMaterial: no reacciona a luces ni a
   `escena.environment`. Solo el camion solido usa materiales PBR, asi
   que esto ilumina el camion sin tocarle el look a nada mas alrededor.
   El entorno es una escena chiquita (piso + un par de "ventanas"
   brillantes) reducida a un cubemap con PMREMGenerator: es lo que le da
   al container metalizado algo para reflejar, si no el metalness se ve
   negro y plano fuera del punto de brillo especular directo.
   ══════════════════════════════════════════════════════════════════ */

function crearEntornoEstudio() {
  const env = new THREE.Scene();

  /* La cupula. Antes eran seis paredes de color plano; ahora es un degrade
     con HORIZONTE DURO: claro arriba, casi negro abajo, con el corte al
     medio. Eso es lo que le da al metal la linea de horizonte que separa
     "cielo" de "piso" en el reflejo -- sin ella un flanco liso devuelve un
     unico gris y se lee como carton pintado, no como chapa.                */
  const cupula = new THREE.Mesh(
    new THREE.SphereGeometry(44, 24, 16),
    new THREE.MeshBasicMaterial({
      map: texturaCupula(), side: THREE.BackSide, toneMapped: false,
    }),
  );
  env.add(cupula);

  /* Las tiras. Un softbox cuadrado se refleja como una mancha; una tira
     larga y baja, paralela a la ruta, se refleja como una BANDA que corre
     todo el flanco. Es la diferencia entre "hay una luz" y "hay una
     superficie" -- y es como se fotografia un vehiculo.

     DONDE ponerlas no es libre. Un environment se muestrea por DIRECCION, no
     por posicion, y un flanco vertical visto desde una camara casi a su
     altura refleja una direccion casi horizontal, apenas POR DEBAJO del
     horizonte. Poner la banda clave arriba -- que es lo intuitivo -- deja el
     flanco reflejando el hemisferio inferior, que estaba en negro: doce
     metros de caja se iban a negro por mas luz directa que recibieran.
     Por eso la banda principal vive a ras del horizonte y el hemisferio de
     abajo no es un pozo: es el asfalto devolviendo luz.                    */
  const tira = (x, y, z, rx, ry, w, h, color, brillo) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color, toneMapped: false, side: THREE.DoubleSide }),
    );
    m.material.color.multiplyScalar(brillo);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    env.add(m);
  };
  tira(-17, -1.0, 0, 0,  Math.PI / 2, 48, 5.6, 0xEAF5FF, 2.2);   // banda clave: la que ve el flanco
  tira(-17,  8.5, 0, 0,  Math.PI / 2, 48, 5.0, 0xDCEEFF, 1.6);   // banda alta: techo, deflector, capo
  tira( 17,  3.0, 0, 0, -Math.PI / 2, 42, 8.0, 0x6E9CBE, 0.9);   // rebote del lado opuesto
  tira(  0, 20.0, 0, Math.PI / 2, 0, 26, 26, 0xE8F4FF, 1.0);     // cenital
  tira(  0,  4.0, 18, 0, Math.PI, 16, 7, 0xDCEEFF, 1.8);         // adelante: le da algo al cromo de la trompa
  tira(  0,  7.0, -18, 0, 0, 12, 8, 0x7FA6C4, 1.0);              // atras: contraluz del techo de la caja

  return env;
}

// Degrade de cupula con corte al medio. v=0 es el polo +Y en SphereGeometry,
// asi que el pixel de arriba de la imagen es el cenit.
function texturaCupula() {
  const [c, ctx] = lienzo(4, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0,    "#8FB6D2");
  g.addColorStop(.36,  "#4E7590");
  g.addColorStop(.495, "#274C61");
  g.addColorStop(.505, "#12293A");   // horizonte: el corte tiene que ser duro
  g.addColorStop(.70,  "#0B1C28");
  g.addColorStop(1,    "#050D14");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function iluminarCamion(escena, renderer, liviano) {
  /* Clave. Alta, adelantada y del lado de la camara: es la que dibuja el
     flanco y la cara del capo. Es la unica que tira sombra -- sin sombra el
     camion flotaba un palmo sobre la ruta y ningun material lo arreglaba. */
  const sol = new THREE.DirectionalLight(0xEAF4FF, 2.1);
  sol.position.set(-14, 21, 13);
  sol.castShadow = true;
  const s = sol.shadow;
  s.mapSize.set(liviano ? 512 : 1024, liviano ? 512 : 1024);
  // El camion entra entero en 14 de radio (va de z -10 a 7.1). Un frustum
  // apretado es lo que hace que 1024 alcancen: en un frustum flojo la misma
  // resolucion da una sombra escalonada.
  s.camera.left = -14; s.camera.right = 14;
  s.camera.top  =  14; s.camera.bottom = -14;
  s.camera.near = 6;   s.camera.far = 62;
  s.bias = -0.0005;
  s.normalBias = 0.035;
  escena.add(sol);

  // Contraluz. Alta y atras, del lado opuesto: traza el canto superior de la
  // caja y despega la silueta del fondo. Va en fosforo, que es el unico
  // acento que DESIGN.md autoriza.
  const filo = new THREE.DirectionalLight(C.FOSFORO, 1.6);
  filo.position.set(9, 13, -19);
  escena.add(filo);

  // Rebote frio del lado opuesto, para que el flanco lejano no sea un agujero.
  const rebote = new THREE.DirectionalLight(0x9FC8EA, 0.32);
  rebote.position.set(11, 4, -7);
  escena.add(rebote);

  // Cielo/piso: el piso casi negro es a proposito, es lo que hunde los bajos.
  const ambiente = new THREE.HemisphereLight(0x8FB8D8, 0x02080E, 0.34);
  escena.add(ambiente);

  // Lampara del portico. Arranca apagada; `avanzar` la mueve al portico mas
  // cercano y le sube la intensidad al acercarse.
  const luzPortico = new THREE.PointLight(0xCDEBFF, 0, 60, 2);
  escena.add(luzPortico);

  const pmrem = new THREE.PMREMGenerator(renderer);
  escena.environment = pmrem.fromScene(crearEntornoEstudio(), 0.02).texture;
  return { pmrem, luzPortico };
}

/* ══════════════════════════════════════════════════════════════════
   TEXTURAS PROCEDURALES
   Cero assets: los mapas se dibujan en canvas al montar y se cachean por
   clave. Son mapas de DATO (relieve y rugosidad), no de color: van en
   espacio lineal. Una CanvasTexture arranca en sRGB, y dejarla asi hace
   que three le aplique la des-gamma y el relieve salga lavado.
   ══════════════════════════════════════════════════════════════════ */

const CACHE_TEX = new Map();
const unaVez = (clave, hacer) => {
  if (!CACHE_TEX.has(clave)) CACHE_TEX.set(clave, hacer());
  return CACHE_TEX.get(clave);
};

function lienzo(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d", { willReadFrequently: true })];
}

function texturaDato(canvas, repX = 1, repY = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// Sobel sobre un canvas de altura (canal rojo) -> mapa de normales tangente.
// Un solo camino para todos los relieves: nervios, ruido de pintura y taco.
function normalDeAltura(alt, fuerza) {
  const W = alt.width, H = alt.height;
  const src = alt.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const [c, ctx] = lienzo(W, H);
  const img = ctx.createImageData(W, H);
  const h = (x, y) => src[((((y % H) + H) % H) * W + (((x % W) + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * fuerza;
    const dy = (h(x, y + 1) - h(x, y - 1)) * fuerza;
    const inv = 1 / Math.hypot(dx, dy, 1);
    const k = (y * W + x) * 4;
    img.data[k]     = Math.round((-dx * inv * .5 + .5) * 255);
    img.data[k + 1] = Math.round((-dy * inv * .5 + .5) * 255);
    img.data[k + 2] = Math.round(( inv * .5 + .5) * 255);
    img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* Chapa corrugada del semirremolque. En un Box, la cara +-X mapea u sobre Z
   (el largo) y v sobre Y, asi que un relieve que solo varia en u sale como
   nervio VERTICAL repetido a lo largo -- que es exactamente un container.
   Es el cambio que mas hace: doce metros de rectangulo liso no se leen como
   caja de carga por mas metalness que se les ponga.                        */
function normalNervios() {
  return unaVez("nervios", () => {
    const NERV = 20, W = 1024, H = 16, [c, ctx] = lienzo(W, H);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    const p = W / NERV;
    for (let i = 0; i < NERV; i++) {
      const x0 = i * p;
      const g = ctx.createLinearGradient(x0, 0, x0 + p, 0);
      g.addColorStop(0, "#000"); g.addColorStop(.50, "#000");
      g.addColorStop(.64, "#fff"); g.addColorStop(.86, "#fff");
      g.addColorStop(.99, "#000");
      ctx.fillStyle = g; ctx.fillRect(x0, 0, p, H);
    }
    return texturaDato(normalDeAltura(c, 9));
  });
}

// Rugosidad de chapa: vetas de cepillado a lo largo + manchas de uso. Sin
// esto el aluminio devuelve un especular perfecto y parece cromo liquido.
function rugosidadChapa() {
  return unaVez("rugosidad-chapa", () => {
    const W = 512, H = 512, [c, ctx] = lienzo(W, H);
    ctx.fillStyle = "#6e6e6e"; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 1400; i++) {
      const y = Math.random() * H, v = 70 + Math.random() * 120;
      ctx.strokeStyle = `rgba(${v},${v},${v},.14)`;
      ctx.lineWidth = .5 + Math.random() * 1.2;
      const x = Math.random() * W, l = 30 + Math.random() * 220;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y + (Math.random() - .5) * 2); ctx.stroke();
    }
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * W, y = Math.random() * H, r = 20 + Math.random() * 90;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(190,190,190,.30)"); g.addColorStop(1, "rgba(190,190,190,0)");
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return texturaDato(c, 3, 2);
  });
}

/* "Piel de naranja" de la pintura. Un clearcoat perfectamente liso delata
   que es un render; la pintura real tiene una ondulacion finisima que le
   parte el reflejo. Va como clearcoatNormalMap con escala minima.         */
function normalPintura() {
  return unaVez("pintura", () => {
    const W = 256, [c, ctx] = lienzo(W, W);
    ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, W, W);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * W, y = Math.random() * W, r = 3 + Math.random() * 9;
      const v = Math.random() < .5 ? 255 : 0;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${v},${v},${v},.16)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return texturaDato(normalDeAltura(c, 2.2), 4, 4);
  });
}

// Goma: rugosidad casi plana con grano. Alcanza para que las diez gomas no
// sean diez elipses del mismo gris.
function rugosidadGoma() {
  return unaVez("goma", () => {
    const W = 128, [c, ctx] = lienzo(W, W);
    ctx.fillStyle = "#d8d8d8"; ctx.fillRect(0, 0, W, W);
    for (let i = 0; i < 2200; i++) {
      const v = 170 + Math.random() * 80;
      ctx.fillStyle = `rgba(${v},${v},${v},.5)`;
      ctx.fillRect(Math.random() * W, Math.random() * W, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    return texturaDato(c, 4, 2);
  });
}

/* ══════════════════════════════════════════════════════════════════
   EL CAMION SOLIDO
   Superficie con acabado PBR: chapa pintada en cabina y capo, container
   metalizado (aluminio cepillado) y goma mate en las ruedas. En la
   Task 5 el mesh de lineas lo reemplaza a partir de la cortina del
   portico; la forma de estas cajas no cambia despues.
   ══════════════════════════════════════════════════════════════════ */

function construirCamionSolido(liviano) {
  const g = new THREE.Group();

  // polygonOffset: hunde las caras un pelo en profundidad para que los
  // cantos de linea no peleen contra la superficie que envuelven.
  // DoubleSide porque los prismas de perfil se triangulan en abanico y no
  // vale la pena pelearse con el sentido de giro de cada tapa.
  // dithering: los degrades de un flanco de doce metros en azul oscuro
  // bandean en 8 bits; el ruido de tramado los rompe y no cuesta nada.
  const base = extra => ({
    side: THREE.DoubleSide, dithering: true,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    ...extra,
  });

  /* Pintura de vehiculo, no "chapa pintada": lo que la define es el barniz.
     Un clearcoat casi liso sobre una base semi-metalica da el doble reflejo
     -- el difuso de la pintura y el especular nitido del barniz -- que es lo
     que separa un auto de una caja de color.                               */
  const pintadaDe = color => new THREE.MeshPhysicalMaterial(base({
    color, metalness: .22, roughness: .38,
    clearcoat: 1, clearcoatRoughness: .075,
    clearcoatNormalMap: liviano ? null : normalPintura(),
    clearcoatNormalScale: new THREE.Vector2(.12, .12),
    envMapIntensity: .55,
  }));
  /* Container: aluminio corrugado. El nervio vertical es geometria falsa
     (mapa de normales) pero es lo que le da largo y ritmo a la caja: sin el
     son doce metros de rectangulo, y ningun valor de metalness arregla eso.
     `metalness` queda en .78 y no en 1: un metal puro no tiene difuso, o sea
     que un flanco plano depende SOLO del reflejo, y sobre un fondo nocturno
     eso es un agujero negro. Dejarle algo de difuso es lo que hace que la
     luz clave le dibuje el cuerpo.                                         */
  const contenedorDe = color => new THREE.MeshPhysicalMaterial(base({
    color, metalness: .78, roughness: .52,
    // El nervio se queda incluso en calidad liviana: es lo que distingue una
    // caja de carga de un prisma, y una consulta de textura es mas barata
    // que perder la lectura del objeto principal de la pagina.
    normalMap: normalNervios(),
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: liviano ? null : rugosidadChapa(),
    anisotropy: .5,                 // cepillado a lo largo: estira el reflejo
    clearcoat: .3, clearcoatRoughness: .28,
    envMapIntensity: 1.0,
  }));

  const chapa      = pintadaDe(C.PLACA);
  const contenedor = contenedorDe(C.PLACA);   // --placa, pero metalizado
  const trompa     = pintadaDe(0x0E3E5C);     // --placa-alta: despega el capo de la caja
  // Cromo. Tanques, escapes, paragolpes y llantas: es la firma de un tractor
  // trompudo y, sobre un fondo oscuro, lo unico que devuelve el horizonte del
  // entorno como una linea nitida. El tinte es frio para no salirse de paleta.
  const cromo = new THREE.MeshPhysicalMaterial(base({
    color: 0x8FB0C6, metalness: 1, roughness: .13, envMapIntensity: 1.0,
  }));
  // Aluminio pulido, no cromo: los tanques son la pieza mas grande del
  // tractor y en cromo espejo se volvian un bloque blanco que le comia el
  // contraste al texto de la parada. Misma familia, mas rugoso y mas oscuro.
  const aluminio = new THREE.MeshPhysicalMaterial(base({
    color: 0x4E687C, metalness: 1, roughness: .34, envMapIntensity: .75,
  }));
  const goma = new THREE.MeshStandardMaterial(base({
    color: 0x05121C, metalness: 0, roughness: .92,     // --fosa, sin colores nuevos
    roughnessMap: liviano ? null : rugosidadGoma(), envMapIntensity: .6,
  }));
  // Vidrio: opaco al 92% y casi especular. No usa `transmission` a proposito
  // -- refraccion real obliga a un pase extra de escena por cuadro.
  const vidrio = new THREE.MeshPhysicalMaterial(base({
    color: 0x01060B, metalness: .1, roughness: .035,
    clearcoat: 1, clearcoatRoughness: .02,
    // el entorno bajito a proposito: un vidrio vertical refleja justo la
    // banda clave y a intensidad plena la ventanilla salia mas clara que la
    // chapa, que es exactamente al reves de como se lee un vidrio de noche.
    envMapIntensity: .38, transparent: true, opacity: .92,
  }));
  const rejilla = new THREE.MeshStandardMaterial(base({
    color: 0x02090F, metalness: .6, roughness: .55,
  }));
  // Opticas: MeshBasic en fosforo y sin tone mapping, igual que las lineas.
  // Es la unica fuente de color propia del camion, y es la que lo deja
  // "encendido" en vez de estacionado.
  const optica = new THREE.MeshBasicMaterial({ color: C.FOSFORO, toneMapped: false });

  const caja = (w, h, d, x, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    g.add(m);
    return m;
  };
  const prisma = (perfil, w, x, mat) => {
    const m = new THREE.Mesh(prismaZY(perfil, w), mat);
    m.position.x = x;
    g.add(m);
    return m;
  };
  const panel = (w, h, x, y, z, rx, ry, mat) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    g.add(m);
    return m;
  };

  caja(REMOLQUE.w, REMOLQUE.h, REMOLQUE.d, X_CAMION, REMOLQUE.y, REMOLQUE.z, contenedor);
  prisma(P_CABINA, CABINA.w, X_CAMION, chapa);
  prisma(P_DEFLECTOR, CABINA.w - .4, X_CAMION, trompa);
  prisma(P_CAPO, CAPO.w, X_CAMION, trompa);
  caja(PARAGOLPES.w, PARAGOLPES.h, PARAGOLPES.d, X_CAMION, PARAGOLPES.y,
       Z_TROMPA - PARAGOLPES.d / 2, cromo);
  for (const s of [-1, 1]) prisma(P_TANQUE, TANQUE.w, X_CAMION + s * TANQUE.x, aluminio);

  /* Faldones aerodinamicos. El mesh ya los dibujaba y el solido no: entre el
     piso de la caja y la ruta habia seis metros de vacio, y un semi visto de
     perfil se lee por su masa continua. Ademas es la superficie que recoge
     la luz baja y le da un zocalo al vehiculo.                             */
  for (const s of [-1, 1]) {
    caja(.09, .80, 5.6, X_CAMION + s * (REMOLQUE.w / 2 - .05), 1.06, -3.8, chapa);
  }

  /* Trompa: caja de cromo con la rejilla hundida y dos opticas al costado.
     Antes la cara del capo era un plano de color liso y la parrilla vivia
     solo como lineas flotando encima; ahora las lineas se apoyan sobre una
     pieza que existe (`Z_PARRILLA` la comparten solido y mesh).            */
  const ANCHO_REJA = CAPO.w - 1.1;                 // el mismo que usa `parrilla`
  caja(ANCHO_REJA + .22, 1.10, .14, X_CAMION, 1.86, CAPO.z1 + .04, cromo);
  caja(ANCHO_REJA, .90, .04, X_CAMION, 1.96, CAPO.z1 + .10, rejilla);
  for (const s of [-1, 1]) {
    caja(.40, .48, .14, X_CAMION + s * 1.51, 2.14, CAPO.z1 + .04, cromo);
    panel(.34, .40, X_CAMION + s * 1.51, 2.38, CAPO.z1 + .115, 0, 0, optica);
  }

  /* Vidrios. El parabrisas se apoya sobre la cara reclinada del perfil de
     cabina: la inclinacion se deduce del propio perfil, no se escribe a
     mano, asi que si el perfil cambia el vidrio lo sigue.                  */
  {
    const dz = -.33, dy = Y_TECHO - Y_PARABRISAS;
    const incl = Math.atan2(-dz, dy);
    const n = [Math.sin(incl), Math.cos(incl)];      // normal (y, z) de la cara
    panel(CABINA.w - .30, Math.hypot(dz, dy),
          X_CAMION, (Y_PARABRISAS + Y_TECHO) / 2 + n[0] * .012,
          Z_CAB1 + dz / 2 + n[1] * .012, -incl, 0, vidrio);
    // Ventanilla, solo en el flanco cercano: del otro lado no se ve y el
    // vidrio transparente ahi solo suma orden de dibujo.
    panel(1.70, 1.00, X_CAMION - CABINA.w / 2 - .012, 3.48, 3.62, 0, -Math.PI / 2, vidrio);
  }

  // caños de escape: dos cilindros verticales pegados al fondo de la cabina
  for (const s of [-1, 1]) {
    const alto = ESCAPE.y1 - ESCAPE.y0;
    const cano = new THREE.Mesh(
      new THREE.CylinderGeometry(ESCAPE.r, ESCAPE.r, alto, 14), cromo);
    cano.position.set(X_CAMION + s * ESCAPE.x, ESCAPE.y0 + alto / 2, ESCAPE.z);
    g.add(cano);
  }
  // espejos: brazo corto y paleta vertical, uno por flanco
  for (const s of [-1, 1]) {
    caja(.42, .10, .10, X_CAMION + s * (CABINA.w / 2 + .21), 3.62, Z_CAB1 - .18, cromo);
    caja(.09, .78, .30, X_CAMION + s * (CABINA.w / 2 + .40), 3.02, Z_CAB1 - .12, cromo);
  }

  /* Luces de galibo. Las opticas de la trompa quedan casi de canto con esta
     camara; lo que SI se ve de perfil es el galibo: la fila del techo de
     cabina y los laterales de la caja. Es el detalle que convierte al camion
     en un camion de noche, y son cuatro MeshBasic en fosforo -- el mismo
     acento del resto de la pagina, sin tokens nuevos.                      */
  for (const dx of [-1.35, -.68, 0, .68, 1.35]) {
    caja(.16, .07, .10, X_CAMION + dx, Y_TECHO - .015, Z_CAB1 - .38, optica);
  }
  for (const z of [REMOLQUE.z - REMOLQUE.d / 2 + .5, REMOLQUE.z, REMOLQUE.z + REMOLQUE.d / 2 - .5]) {
    panel(.09, .16, X_CAMION - REMOLQUE.w / 2 - .012, REMOLQUE.y + .22, z, 0, -Math.PI / 2, optica);
  }

  // Cada rueda es un grupo propio: `avanzar` le pone el giro del recorrido.
  const ruedas = [];
  for (const z of Z_EJES) for (const s of [-1, 1]) {
    const r = armarRueda(z, s, { goma, cromo, aluminio });
    ruedas.push(r);
    g.add(r);
  }

  // Los cantos viven dentro del grupo del camion, no en el mundo.
  const bordes = new Lotes(THREE);
  const O = .5;
  bordes.aristas(REMOLQUE.w, REMOLQUE.h, REMOLQUE.d, X_CAMION, REMOLQUE.y, REMOLQUE.z, O, "camion-borde");
  bordes.aristas(PARAGOLPES.w, PARAGOLPES.h, PARAGOLPES.d, X_CAMION, PARAGOLPES.y,
                 Z_TROMPA - PARAGOLPES.d / 2, O, "camion-borde");
  perfilZY(bordes, P_CABINA, CABINA.w, X_CAMION, O, "camion-borde");
  perfilZY(bordes, P_CAPO, CAPO.w, X_CAMION, O, "camion-borde");
  perfilZY(bordes, P_DEFLECTOR, CABINA.w - .4, X_CAMION, O, "camion-borde");
  for (const s of [-1, 1]) {
    perfilZY(bordes, P_TANQUE, TANQUE.w, X_CAMION + s * TANQUE.x, O, "camion-borde");
    bordes.seg([X_CAMION + s * ESCAPE.x, ESCAPE.y0, ESCAPE.z - ESCAPE.r],
               [X_CAMION + s * ESCAPE.x, ESCAPE.y1, ESCAPE.z - ESCAPE.r], O, "camion-borde");
  }
  parrilla(bordes, Z_PARRILLA, O, "camion-borde");
  // La camara vive del lado -X para las dos filas de ruedas: el canto que
  // se ve de cada goma es siempre la cara mas cercana a -X, no la exterior
  // de su lado. En la fila lejana (s=1) esa cara es la interior -- dibujar
  // la exterior ahi deja el canto tapado por la propia goma (ver MOVILES.md).
  const offAro = ANCHO_RUEDA / 2 + .01;
  for (const z of Z_EJES) for (const s of [-1, 1]) {
    aro(bordes, X_CAMION + s * X_RUEDA - offAro, z, R_RUEDA, O, "camion-borde");
  }
  bordes.volcar(g);

  // Sombra: proyectan y reciben solo las mallas. Recibir tambien entre si es
  // lo que mete la caja de carga sobre el tandem y el capo sobre el chasis;
  // sin eso los bajos del camion quedan tan claros como el techo.
  g.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
  });

  return { grupo: g, ruedas };
}

/* ── La rueda ───────────────────────────────────────────────────────
   Grupo propio por rueda para que gire entera con el avance. La goma es un
   cilindro sobre X; la llanta, un disco calado que se ve porque la camara
   mira la cara exterior. Va SOLO en la fila cercana: de la lejana se ve la
   cara interior, que en un camion es chapa lisa (ver MOVILES.md).        */
function armarRueda(z, s, mats) {
  const g = new THREE.Group();
  g.position.set(X_CAMION + s * X_RUEDA, R_RUEDA, z);

  const goma = new THREE.Mesh(unaVez("geo-goma", () =>
    new THREE.CylinderGeometry(R_RUEDA, R_RUEDA, ANCHO_RUEDA, 24)), mats.goma);
  goma.rotation.z = Math.PI / 2;
  g.add(goma);

  if (s < 0) {
    const llanta = new THREE.Mesh(geoLlanta(), mats.cromo);
    llanta.rotation.y = -Math.PI / 2;            // la cara del disco mira a -X
    llanta.position.x = -(ANCHO_RUEDA / 2 + .014);
    g.add(llanta);

    const maza = new THREE.Mesh(unaVez("geo-maza", () =>
      new THREE.CylinderGeometry(.115, .145, .13, 14)), mats.cromo);
    maza.rotation.z = Math.PI / 2;
    maza.position.x = -(ANCHO_RUEDA / 2 + .065);
    g.add(maza);
  } else {
    // Fila lejana: lo que mira a la camara es la cara INTERIOR de la rueda,
    // que es un disco de acero sin calar. Sin el, la goma sola quedaba como
    // un agujero negro entre dos ruedas con llanta.
    const interior = new THREE.Mesh(unaVez("geo-interior", () =>
      new THREE.CircleGeometry(R_LLANTA * .92, 20)), mats.aluminio);
    interior.rotation.y = -Math.PI / 2;
    interior.position.x = -(ANCHO_RUEDA / 2 + .012);
    g.add(interior);
  }
  return g;
}

// Disco de llanta: corona con cinco calados. Los calados son lo que deja ver
// que la rueda gira -- un disco lleno, girando, se ve igual quieto.
function geoLlanta() {
  return unaVez("geo-llanta", () => {
    const s = new THREE.Shape();
    s.absarc(0, 0, R_LLANTA, 0, Math.PI * 2, false);
    for (let k = 0; k < 5; k++) {
      const a = k * (Math.PI * 2 / 5) + .32;
      const h = new THREE.Path();
      h.absarc(Math.cos(a) * .30, Math.sin(a) * .30, .125, 0, Math.PI * 2, true);
      s.holes.push(h);
    }
    return new THREE.ShapeGeometry(s, 22);
  });
}

/* ── Geometria de perfil ────────────────────────────────────────────
   Un poligono (z, y) barrido sobre X. `prismaZY` da la malla del solido y
   `perfilZY` las lineas del mesh: son la MISMA lista de puntos, que es lo
   que mantiene al gemelo geometrico en su sitio.                       */
function prismaZY(perfil, w) {
  const n = perfil.length, v = [];
  const P = (x, i) => [x, perfil[i][1], perfil[i][0]];
  const tri = (a, b, c) => v.push(...a, ...b, ...c);
  for (const x of [-w / 2, w / 2]) {          // tapas, en abanico (perfil convexo)
    for (let i = 1; i < n - 1; i++) tri(P(x, 0), P(x, i), P(x, i + 1));
  }
  for (let i = 0; i < n; i++) {               // faldon lateral
    const j = (i + 1) % n;
    tri(P(-w / 2, i), P(w / 2, i), P(w / 2, j));
    tri(P(-w / 2, i), P(w / 2, j), P(-w / 2, j));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  // UV por proyeccion plana sobre ZY, a escala de mundo. No sirve para un
  // mapa de color (el faldon queda estirado) pero si para el ruido fino del
  // barniz, que es isotropo: sin `uv` el mapa se lee siempre en (0,0) y el
  // clearcoat sale espejado.
  const uv = [];
  for (let i = 0; i < v.length; i += 3) uv.push(v[i + 2] * .5, v[i + 1] * .5);
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function perfilZY(lotes, perfil, w, x, o, grupo) {
  const x0 = x - w / 2, x1 = x + w / 2;
  for (const xf of [x0, x1]) for (let i = 0; i < perfil.length; i++) {
    const a = perfil[i], b = perfil[(i + 1) % perfil.length];
    lotes.seg([xf, a[1], a[0]], [xf, b[1], b[0]], o, grupo);
  }
  for (const p of perfil) lotes.seg([x0, p[1], p[0]], [x1, p[1], p[0]], o, grupo);
}

// Parrilla frontal: marco y barras horizontales sobre la cara del capo. La
// camara mira desde adelante-izquierda, asi que esta cara SI se ve.
function parrilla(lotes, z, o, grupo) {
  // La reja es mas angosta que el capo (antes casi lo llenaba): eso deja
  // lugar a los dos lados para opticas de verdad, que en el solido son
  // paneles de fosforo y en el mesh su contorno.
  const w = CAPO.w - 1.1, y0 = 1.96, y1 = CAPO.y1 - .16;
  const x0 = X_CAMION - w / 2, x1 = X_CAMION + w / 2;
  for (let i = 0; i <= 4; i++) {
    const y = y0 + (y1 - y0) * (i / 4);
    lotes.seg([x0, y, z], [x1, y, z], o, grupo);
  }
  lotes.seg([x0, y0, z], [x0, y1, z], o, grupo);
  lotes.seg([x1, y0, z], [x1, y1, z], o, grupo);
  // opticas a los costados de la parrilla
  for (const s of [-1, 1]) {
    const a = X_CAMION + s * (w / 2 + .14), b = X_CAMION + s * (CAPO.w / 2 - .07);
    for (const y of [2.18, 2.58]) lotes.seg([a, y, z], [b, y, z], o, grupo);
    lotes.seg([a, 2.18, z], [a, 2.58, z], o, grupo);
    lotes.seg([b, 2.18, z], [b, 2.58, z], o, grupo);
  }
}

// arco en el plano YZ, en grados medidos desde +Z hacia +Y
function arcoYZ(lotes, x, cy, cz, r, a0, a1, o, grupo, pasos = 10) {
  const p = i => {
    const a = (a0 + (a1 - a0) * (i / pasos)) * GRADO;
    return [x, cy + Math.sin(a) * r, cz + Math.cos(a) * r];
  };
  for (let i = 0; i < pasos; i++) lotes.seg(p(i), p(i + 1), o, grupo);
}

// circunferencia en el plano YZ, apoyada en el piso -- la cara de una rueda
function aro(lotes, x, z, r, o, grupo, lados = 20) {
  arcoYZ(lotes, x, r, z, r, 0, 360, o, grupo, lados);
}

/* ══════════════════════════════════════════════════════════════════
   EL PORTICO DE LECTURA
   Mastil, brazo en L sobre el carril, cabezal sensor, y el numero de
   parada grabado en el mastil (DESIGN.md prohibe antetitulos: el numero
   es senaletica del mundo, no rotulo de la seccion).
   El mastil va del lado +X, opuesto a la camara, para no taparle el
   camion; el brazo cruza la calzada entera.
   ══════════════════════════════════════════════════════════════════ */

const X_MASTIL    = ANCHO_RUTA + 1.5;   // 8.5: apenas fuera de la banquina
const ALTO_MASTIL = 8.6;

function construirPortico(lotes, z, numero) {
  lotes.aristas(.5, ALTO_MASTIL, .5, X_MASTIL, 0, z, .6, "portico");
  // brazo: de x=-4 (pasada la banquina de este lado) hasta el mastil
  const x0 = -4, ancho = X_MASTIL - x0;
  lotes.aristas(ancho, .34, .34, x0 + ancho / 2, ALTO_MASTIL - .5, z, .6, "portico");
  // cabezal sensor sobre el eje de la ruta
  lotes.aristas(.85, .7, 1.05, 0, ALTO_MASTIL - 1.3, z, .6, "portico");
  // El numero vive en una placa atornillada al mastil: el mastil solo tiene
  // 0.5 de canto y dos digitos no entran en esa cara sin salirse.
  const xPlaca = X_MASTIL - .27, alto = 1.15;
  placaYZ(lotes, xPlaca, 2.05, z, 2.2, alto + .5, .6, "portico");
  numeroMastil(lotes, numero + 1, xPlaca - .02, 2.25, z, alto, .6, "portico");

  if (numero === 0) {
    // La cortina de lectura: el plano de recorte se ve como dos hilos
    // verticales mas la traza en el piso. No van sobre el eje (x=0) porque
    // ahi el cuerpo del camion las tapa por profundidad -- van a los
    // costados de la caja, que es donde el corte se lee.
    for (const x of [-3.4, 3.4]) lotes.seg([x, ALTO_MASTIL - .68, z], [x, 0, z], .6, "portico");
    lotes.seg([-ANCHO_RUTA, .03, z], [ANCHO_RUTA, .03, z], .6, "portico");
  }
}

// rectangulo en el plano YZ, apoyado en `y` -- la placa de senaletica
function placaYZ(lotes, x, y, z, d, h, o, grupo) {
  const z0 = z - d / 2, z1 = z + d / 2, y1 = y + h;
  lotes.seg([x, y, z0], [x, y, z1], o, grupo);
  lotes.seg([x, y1, z0], [x, y1, z1], o, grupo);
  lotes.seg([x, y, z0], [x, y1, z0], o, grupo);
  lotes.seg([x, y, z1], [x, y1, z1], o, grupo);
}

// Digitos de siete segmentos en el plano YZ (la cara del mastil que mira a
// la camara). Se leen hacia +Z, que es la derecha de la pantalla.
const SIETE = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd" };

function numeroMastil(lotes, n, x, y, z, alto, o, grupo) {
  const texto = String(n).padStart(2, "0");
  const ancho = alto * .52, hueco = alto * .22;
  let zc = z - (texto.length * (ancho + hueco) - hueco) / 2;
  for (const ch of texto) {
    const z0 = zc, z1 = zc + ancho, y0 = y, y1 = y + alto, ym = y + alto / 2;
    const trazo = {
      a: [[z0, y1], [z1, y1]], b: [[z1, y1], [z1, ym]], c: [[z1, ym], [z1, y0]],
      d: [[z0, y0], [z1, y0]], e: [[z0, ym], [z0, y0]], f: [[z0, y1], [z0, ym]],
      g: [[z0, ym], [z1, ym]],
    };
    for (const k of SIETE[ch] || "") {
      const [[za, ya], [zb, yb]] = trazo[k];
      lotes.seg([x, ya, za], [x, yb, zb], o, grupo);
    }
    zc = z1 + hueco;
  }
}

/* ══════════════════════════════════════════════════════════════════
   EL CAMION MESH
   Gemelo geometrico del solido -- mismas cajas, mismas ruedas, mismas
   coordenadas -- pero como lineas agrupadas por organo. Los grupos son el
   vocabulario cerrado que consume `encenderOrgano`; "org-base" es lo que
   no es ningun organo en particular y por eso nunca se enciende.
   ══════════════════════════════════════════════════════════════════ */

function construirCamionMesh(lotes) {
  const O = OP_APAGADO;
  const X = X_CAMION;
  const zCola = REMOLQUE.z - REMOLQUE.d / 2;      // -10.00
  const zCajaF = REMOLQUE.z + REMOLQUE.d / 2;     //   2.30
  const yCaja1 = REMOLQUE.y + REMOLQUE.h;         //   4.90
  const xCaja = REMOLQUE.w / 2;

  /* --- base: caja, chasis, capo, paragolpes, guardabarros ---
     El capo y el paragolpes son carroceria, no capacidad: van con la caja
     en "org-base", que nunca se enciende.                              */
  lotes.aristas(REMOLQUE.w, REMOLQUE.h, REMOLQUE.d, X, REMOLQUE.y, REMOLQUE.z, O, "org-base");
  // nervios: sin ellos el semi son doce metros de rectangulo vacio
  for (const s of [-1, 1]) for (let i = 1; i <= 5; i++) {
    const z = zCola + (i * REMOLQUE.d) / 6;
    lotes.seg([X + s * xCaja, REMOLQUE.y, z], [X + s * xCaja, yCaja1, z], O, "org-base");
  }
  const yChasis = REMOLQUE.y - .25;
  for (const s of [-1, 1]) {
    lotes.seg([X + s * 1.5, yChasis, Z_TROMPA - .3], [X + s * 1.5, yChasis, zCola], O, "org-base");
  }
  for (const z of Z_EJES) {
    lotes.seg([X - 1.5, yChasis, z], [X + 1.5, yChasis, z], O, "org-base");
  }
  // plato de enganche sobre el tandem del tractor
  const zPlato = 1.15;
  lotes.marco(2.7, 1.8, yChasis + .12, O, "org-base", X, zPlato);
  lotes.seg([X - .35, yChasis + .12, zPlato - .9], [X, yChasis + .12, zPlato + .1], O, "org-base");
  lotes.seg([X + .35, yChasis + .12, zPlato - .9], [X, yChasis + .12, zPlato + .1], O, "org-base");
  // capo con su nervadura central, y el paragolpes
  perfilZY(lotes, P_CAPO, CAPO.w, X, O, "org-base");
  lotes.seg([X, Y_PARABRISAS, Z_CAB1], [X, CAPO.y1, CAPO.z1], O, "org-base");
  lotes.aristas(PARAGOLPES.w, PARAGOLPES.h, PARAGOLPES.d, X, PARAGOLPES.y,
                Z_TROMPA - PARAGOLPES.d / 2, O, "org-base");
  // guardabarros: arco sobre la rueda de direccion, en las dos caras
  for (const s of [-1, 1]) {
    arcoYZ(lotes, X + s * (X_RUEDA + .32), R_RUEDA, Z_EJES[0], R_RUEDA + .3, 12, 168, O, "org-base", 12);
  }
  // barreros detras de cada tandem
  for (const [z, ancho] of [[-1.15, 3.6], [zCola - .05, 3.9]]) {
    const a = X - ancho / 2, b = X + ancho / 2;
    lotes.seg([a, .30, z], [b, .30, z], O, "org-base");
    lotes.seg([a, 1.25, z], [b, 1.25, z], O, "org-base");
    lotes.seg([a, .30, z], [a, 1.25, z], O, "org-base");
    lotes.seg([b, .30, z], [b, 1.25, z], O, "org-base");
  }

  // --- 01 ubicacion: domo GPS en la proa del techo de la caja, que es el
  //     punto mas alto y despejado. La estela va en el mundo, sobre la ruta
  //     ya recorrida (ver construirEstela).
  const zDomo = zCajaF - .9;
  lotes.volumen(.9, .42, .9, X, yCaja1, zDomo, O, O, "org-ubicacion");
  lotes.seg([X, yCaja1 + .42, zDomo], [X, yCaja1 + 1.25, zDomo], O, "org-ubicacion");
  lotes.marco(1.5, 1.5, yCaja1 + .02, O, "org-ubicacion", X, zDomo);

  /* --- 02 conducta: cabina, parabrisas, puertas, espejos, conductor --- */
  perfilZY(lotes, P_CABINA, CABINA.w, X, O, "org-conducta");
  // parabrisas: rectangulo sobre la cara reclinada del perfil
  const vidA = [Z_CAB1 - .05, Y_PARABRISAS + .10], vidB = [Z_CAB1 - .30, Y_TECHO - .09];
  const xP = CABINA.w / 2 - .38;
  for (const s of [-1, 1]) {
    lotes.seg([X + s * xP, vidA[1], vidA[0]], [X + s * xP, vidB[1], vidB[0]], O, "org-conducta");
  }
  for (const v of [vidA, vidB]) {
    lotes.seg([X - xP, v[1], v[0]], [X + xP, v[1], v[0]], O, "org-conducta");
  }
  lotes.seg([X - 1.25, Y_PARABRISAS + .13, Z_CAB1 - .06], [X - .15, Y_TECHO - .14, Z_CAB1 - .29], O, "org-conducta");  // limpiaparabrisas
  // Puerta y ventanilla SOLO en el flanco cercano: dibujadas en los dos, la
  // camara casi lateral las superpone corridas y la cabina se vuelve un
  // enrejado. El perfil ya da el contorno del flanco lejano.
  {
    const x = X - CABINA.w / 2;
    const rect = (z0, z1, y0, y1) => {
      lotes.seg([x, y0, z0], [x, y0, z1], O, "org-conducta");
      lotes.seg([x, y1, z0], [x, y1, z1], O, "org-conducta");
      lotes.seg([x, y0, z0], [x, y1, z0], O, "org-conducta");
      lotes.seg([x, y0, z1], [x, y1, z1], O, "org-conducta");
    };
    rect(Z_CAB0 + .25, Z_CAB1 - .12, CABINA.y + .12, 4.06);     // puerta
    rect(Z_CAB0 + .42, Z_CAB1 - .28, 2.98, 3.98);               // ventanilla
    lotes.seg([x, 2.78, Z_CAB1 - .52], [x, 2.78, Z_CAB1 - .24], O, "org-conducta");  // manija
  }
  for (const s of [-1, 1]) {
    const x = X + s * CABINA.w / 2;
    // espejo: brazo hacia afuera y paleta vertical en el plano YZ
    const xe = X + s * (CABINA.w / 2 + .42);
    lotes.seg([x, 3.62, Z_CAB1 - .18], [xe, 3.62, Z_CAB1 - .12], O, "org-conducta");
    lotes.seg([x, 3.05, Z_CAB1 - .18], [xe, 3.05, Z_CAB1 - .12], O, "org-conducta");
    for (const [a, b] of [[[3.80, -.30], [3.80, .06]], [[3.02, -.30], [3.02, .06]],
                          [[3.80, -.30], [3.02, -.30]], [[3.80, .06], [3.02, .06]]]) {
      lotes.seg([xe, a[0], Z_CAB1 + a[1]], [xe, b[0], Z_CAB1 + b[1]], O, "org-conducta");
    }
  }
  /* El puesto de manejo se dibuja del lado -X, que es el de la camara: del
     otro lado la propia cabina lo tapa y el organo no se leeria.
     TODA la silueta vive en un unico plano YZ: cualquier trazo que varie en
     X queda de canto contra esta camara casi lateral y se lee como rayita.  */
  const xC = X - 1.0;
  const l = (a, b) => lotes.seg([xC, a[1], a[0]], [xC, b[1], b[0]], O, "org-conducta");
  // piso, asiento y respaldo
  l([Z_CAB0 + .55, 1.98], [Z_CAB1 - .15, 1.98]);
  l([2.91, 2.40], [3.51, 2.36]);                       // banqueta
  l([2.90, 2.42], [2.85, 3.62]);                       // respaldo
  l([2.85, 3.62], [2.81, 3.98]); l([2.81, 3.98], [3.05, 3.96]); l([3.05, 3.96], [3.03, 3.62]);
  l([2.85, 3.62], [3.03, 3.62]);                       // apoyacabezas
  // cuerpo: torso cerrado, cabeza, dos brazos al volante y una pierna. Va
  // corrido hacia atras respecto del volante para que la figura no quede
  // tapada por el aro.
  const HOMBRO = [3.43, 3.32], CADERA = [3.27, 2.52];
  l(HOMBRO, [3.59, 2.92]); l([3.59, 2.92], CADERA);    // frente del torso
  l(CADERA, [3.13, 3.16]); l([3.13, 3.16], HOMBRO);    // espalda
  l(HOMBRO, [3.47, 3.42]);                             // cuello
  circuloYZ(lotes, xC, 3.66, 3.57, .23, O, "org-conducta", 14);          // cabeza
  l([3.35, 3.80], [3.71, 3.74]);                       // visera de la gorra
  l(HOMBRO, [3.62, 2.98]); l([3.62, 2.98], [4.02, 3.33]);   // brazo cercano
  l([3.39, 3.28], [3.70, 3.02]); l([3.70, 3.02], [4.05, 3.31]);  // brazo del otro lado
  l(CADERA, [3.95, 2.44]); l([3.95, 2.44], [4.28, 2.02]);   // pierna
  // volante, columna y tablero
  circuloYZ(lotes, xC, 3.10, 4.25, .32, O, "org-conducta", 16);
  circuloYZ(lotes, xC, 3.10, 4.25, .08, O, "org-conducta", 8);
  l([4.02, 3.33], [4.48, 2.87]); l([4.02, 2.87], [4.48, 3.33]);   // rayos
  l([4.25, 3.10], [4.46, 2.72]);                       // columna
  l([4.38, 2.70], [4.70, 2.84]);                       // tablero
  // dashcam sobre el parabrisas, con su cono de vision hacia adelante
  const cam = [X, Y_TECHO - .30, Z_CAB1 - .22], zCono = Z_TROMPA + 4.2;
  lotes.volumen(.4, .24, .28, X, cam[1] - .24, cam[2] - .05, O, O, "org-conducta");
  const CONO = [[-2.0, -1.5], [2.0, -1.5], [2.0, 1.0], [-2.0, 1.0]];
  for (let i = 0; i < 4; i++) {
    const a = CONO[i], b = CONO[(i + 1) % 4];
    lotes.seg(cam, [X + a[0], cam[1] + a[1], zCono], O, "org-conducta");
    lotes.seg([X + a[0], cam[1] + a[1], zCono],
              [X + b[0], cam[1] + b[1], zCono], O, "org-conducta");
  }

  /* --- 03 estado: las diez gomas con su anillo de presion, los ejes, el
     motor bajo el capo, la parrilla del radiador y los caños de escape. --- */
  // Las gomas NO van en este lote: viven en `construirRuedasMesh`, una por
  // grupo, porque tienen que girar. Lo unico que queda aca son los ejes, que
  // no giran.
  for (const z of Z_EJES) {
    lotes.seg([X - X_RUEDA, R_RUEDA, z], [X + X_RUEDA, R_RUEDA, z], O, "org-estado");
  }
  lotes.volumen(1.7, 1.2, 1.6, X, 1.74, 5.75, O, O, "org-estado");   // bloque motor
  parrilla(lotes, Z_PARRILLA, O, "org-estado");                      // radiador y opticas
  for (const s of [-1, 1]) {
    const xe = X + s * ESCAPE.x;
    lotes.aristas(ESCAPE.r * 2, ESCAPE.y1 - ESCAPE.y0, ESCAPE.r * 2, xe, ESCAPE.y0, ESCAPE.z, O, "org-estado");
    lotes.seg([xe, ESCAPE.y0, ESCAPE.z], [X + s * 1.2, 1.35, ESCAPE.z + .55], O, "org-estado");
  }

  /* --- 04 consumo: los dos tanques con su nivel, la linea al motor, el
     carenado de techo y los faldones: todo lo que decide cuanto gasta. --- */
  for (const s of [-1, 1]) {
    const xt = X + s * TANQUE.x;
    perfilZY(lotes, P_TANQUE, TANQUE.w, xt, O, "org-consumo");
    lotes.marco(TANQUE.w, TANQUE.largo - .36, TANQUE.y - .06, O, "org-consumo", xt, TANQUE.z);
    for (const dz of [-.75, .75]) {                    // flejes de sujecion
      lotes.seg([xt - TANQUE.w / 2, TANQUE.y - TANQUE.r, TANQUE.z + dz],
                [xt - TANQUE.w / 2, TANQUE.y + TANQUE.r, TANQUE.z + dz], O, "org-consumo");
    }
  }
  lotes.seg([X - TANQUE.x, TANQUE.y + TANQUE.r, TANQUE.z + 1.1],
            [X - 1.15, 2.05, 5.20], O, "org-consumo");
  lotes.seg([X - 1.15, 2.05, 5.20], [X - .85, 2.30, 5.60], O, "org-consumo");
  perfilZY(lotes, P_DEFLECTOR, CABINA.w - .4, X, O, "org-consumo");
  for (const s of [-1, 1]) {                           // faldones aerodinamicos
    const x = X + s * (xCaja - .05);
    for (const [a, b] of [[[-1.0, 1.06], [-6.6, 1.06]], [[-1.0, 1.86], [-6.6, 1.86]],
                          [[-1.0, 1.06], [-1.0, 1.86]], [[-6.6, 1.06], [-6.6, 1.86]],
                          [[-3.8, 1.06], [-3.8, 1.86]]]) {
      lotes.seg([x, a[1], a[0]], [x, b[1], b[0]], O, "org-consumo");
    }
  }
}

// circunferencia en el plano YZ (eje sobre X) pero centrada, no apoyada en
// el piso como `aro`, que es el caso particular de las ruedas -- el volante
function circuloYZ(lotes, x, cy, cz, r, o, grupo, lados = 16) {
  arcoYZ(lotes, x, cy, cz, r, 0, 360, o, grupo, lados);
}

/* ── Las gomas del mesh ─────────────────────────────────────────────
   Diez lotes chicos en vez de uno grande: es el precio de que giren. Cada
   uno se dibuja en coordenadas LOCALES (centro de rueda en el origen) y el
   grupo se coloca despues, asi rotar sobre X es girar la rueda y nada mas.
   Siguen siendo del organo "org-estado", asi que `encenderOrgano` las
   prende junto con el motor y la parrilla como antes.                    */
function construirRuedasMesh(destino) {
  const O = OP_APAGADO, ruedas = [], mapas = [];
  const xl = -(ANCHO_RUEDA / 2 + .01);   // la cara que mira a la camara, para las dos filas
  for (const z of Z_EJES) for (const s of [-1, 1]) {
    const lote = new Lotes(THREE);
    arcoYZ(lote, xl, 0, 0, R_RUEDA, 0, 360, O, "org-estado", 18);
    // anillo de presion: CONCENTRICO con la goma (antes salia corrido hacia
    // arriba y las ruedas se leian como dos circulos sueltos).
    arcoYZ(lote, xl, 0, 0, R_RUEDA + .16, 0, 360, O, "org-estado", 22);
    if (s < 0) {                         // llanta y rayos solo en la fila cercana
      arcoYZ(lote, xl, 0, 0, .50, 0, 360, O, "org-estado", 12);
      arcoYZ(lote, xl, 0, 0, .15, 0, 360, O, "org-estado", 8);
      for (let k = 0; k < 5; k++) {
        const a = (k * 72 + 15) * GRADO, c = Math.cos(a), n = Math.sin(a);
        lote.seg([xl, n * .15, c * .15], [xl, n * .50, c * .50], O, "org-estado");
      }
    }
    const g = new THREE.Group();
    g.position.set(X_CAMION + s * X_RUEDA, R_RUEDA, z);
    destino.add(g);
    mapas.push(lote.volcar(g));
    ruedas.push(g);
  }
  return { ruedas, mapas };
}

/* ══════════════════════════════════════════════════════════════════
   LO QUE VIVE EN EL MUNDO Y NO EN EL CAMION
   La estela (01) y el poligono de geocerca (05) son de la ruta: van dentro
   de `mundo`, se mueven con ella y la compuerta no los recorta.
   ══════════════════════════════════════════════════════════════════ */

// Historial de recorrido: traza sobre la ruta ya recorrida. Termina bajo la
// trompa del camion en la parada 01, asi que se lee entera por debajo del
// vehiculo y sigue hacia atras: la camara es casi lateral y lo que queda
// detras del camion sale de cuadro en pocos metros.
function construirEstela(lotes, zFin) {
  const z0 = -60, pasos = 54;
  let ant = null;
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos;
    const p = [Math.sin(t * 5.4) * 3.2, .05, z0 + t * (zFin - z0)];
    if (ant) lotes.seg(ant, p, OP_APAGADO, "org-ubicacion");
    ant = p;
  }
}

/* El poligono se acorto a 0.55 de su largo original sobre la ruta (de 40
   unidades a 22). Es lo que lo hace entrar en el cuadro angosto: 40 no entra
   con ningun encuadre que deje el camion legible, medido barriendo el espacio.
   El ANCHO no se toca a proposito: a x -11.5..9.5 el poligono cae POR FUERA de
   las lineas de banquina (+-7), y encogerlo tambien lo dejaba justo encima de
   ellas, con lo que dejaba de leerse como zona y empezaba a leerse como la
   ruta. Con 22 de largo sigue envolviendo al camion, que mide 17.            */
const LARGO_GEOCERCA = .55;

function construirGeocerca(lotes, z) {
  // poligono irregular que envuelve el tramo, con postes de esquina para
  // que se lea como zona y no como mancha en el piso.
  const L = LARGO_GEOCERCA;
  const p = [
    [-9, .03, z - 17 * L], [-11.5, .03, z + 5 * L], [-3, .03, z + 19 * L],
    [9.5, .03, z + 11 * L], [8, .03, z - 11 * L], [0, .03, z - 21 * L],
  ];
  for (let i = 0; i < p.length; i++) {
    lotes.seg(p[i], p[(i + 1) % p.length], OP_APAGADO, "org-geocerca");
    lotes.seg(p[i], [p[i][0], 1.7, p[i][2]], OP_APAGADO, "org-geocerca");
  }
}

/* ══════════════════════════════════════════════════════════════════
   EL VOCABULARIO DE REALCE
   Organo activo en blanco puro y opacidad 1; el resto de los organos al
   26% en fosforo. No toca ruta, ruta-marca, hito, portico ni camion-borde.
   ══════════════════════════════════════════════════════════════════ */

function armarEncendido(mapas) {
  return function encenderOrgano(indice) {
    const activo = ORGANOS[indice];
    for (const mapa of mapas) for (const [clave, linea] of mapa) {
      const grupo = clave.split("|")[0];
      if (!grupo.startsWith("org-")) continue;
      const prende = grupo === activo;   // "org-base" nunca prende: no es organo
      linea.material.color.set(prende ? C.BLANCO : C.FOSFORO);
      linea.material.opacity = prende ? 1 : OP_APAGADO;
    }
  };
}
