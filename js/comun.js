// js/comun.js -- lo que edificios.html y moviles.html hacen igual: el
// encabezado que se marca al scrollear, las entradas que aparecen desde
// un estado ya visible, y el formulario de contacto.
import { animate, scroll, inView } from "https://cdn.jsdelivr.net/npm/motion@12.23.12/+esm";

export const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ── Encabezado: filete sólo cuando hay contenido debajo ───────────── */
export function encabezadoFijo(el) {
  scroll(() => {
    el.dataset.fijo = window.scrollY > 24 ? "si" : "no";
  });
}

/* ── Menú mobile: disclosure simple, el nav sigue siendo <nav><a> ──── */
export function menuMovil(boton, nav) {
  function cerrar() {
    nav.dataset.abierto = "no";
    boton.setAttribute("aria-expanded", "false");
  }
  boton.addEventListener("click", () => {
    const abierta = nav.dataset.abierto === "si";
    nav.dataset.abierto = abierta ? "no" : "si";
    boton.setAttribute("aria-expanded", String(!abierta));
  });
  nav.addEventListener("click", e => {
    if (e.target.tagName === "A") cerrar();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && nav.dataset.abierto === "si") cerrar();
  });
}

/* ── Entradas. Desde un estado ya visible: si el JS no corre, la
      página se lee igual (.js-inerte lo garantiza en el CSS). ──────── */
export function revelarEntradas() {
  if (!quieto) {
    document.querySelectorAll("[data-entra]").forEach((el, i) => {
      inView(el, () => {
        animate(el,
          { opacity: [.001, 1], transform: ["translateY(14px)", "translateY(0px)"] },
          { duration: .68, delay: (i % 3) * .07, ease: [.16, 1, .3, 1] }
        );
      }, { amount: .25 });
    });
  } else {
    document.documentElement.classList.add("js-inerte");
  }
}

/* ══════════════════════════════════════════════════════════════════
   FORMULARIO
   Estados completos: inactivo, inválido, enviando, enviado, error.
   ══════════════════════════════════════════════════════════════════ */
export function montarFormulario({ form, boton, rotulo, aviso, endpoint }) {
  const REGLAS = {
    "f-nombre":  v => v.trim().length >= 2   || "Poné tu nombre.",
    "f-email":   v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || "Revisá el email, no parece válido.",
    "f-mensaje": v => v.trim().length >= 12  || "Contanos un poco más para poder cotizar."
  };

  function validarCampo(id) {
    const input = document.getElementById(id);
    const caja  = input.closest(".campo");
    const salida = form.querySelector(`[data-error-de="${id}"]`);
    const r = REGLAS[id] ? REGLAS[id](input.value) : true;
    if (r === true) {
      delete caja.dataset.invalido;
      input.removeAttribute("aria-invalid");
      if (salida) salida.textContent = "";
      return true;
    }
    caja.dataset.invalido = "si";
    input.setAttribute("aria-invalid", "true");
    if (salida) salida.textContent = r;
    return false;
  }

  Object.keys(REGLAS).forEach(id => {
    const input = document.getElementById(id);
    input.addEventListener("blur", () => validarCampo(id));
    input.addEventListener("input", () => {
      if (input.closest(".campo").dataset.invalido) validarCampo(id);
    });
  });

  function mostrarAviso(html) {
    aviso.innerHTML = html;
    aviso.hidden = false;
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    aviso.hidden = true;

    const ok = Object.keys(REGLAS).map(validarCampo).every(Boolean);
    if (!ok) {
      form.querySelector('[data-invalido="si"] input, [data-invalido="si"] textarea')?.focus();
      return;
    }

    if (!endpoint) {
      mostrarAviso(
        'El formulario todavía no está conectado a un destino. ' +
        'Escribinos a <a href="mailto:contacto@iotek.com.ar">contacto@iotek.com.ar</a> ' +
        'y te respondemos igual.'
      );
      return;
    }

    boton.disabled = true;
    rotulo.textContent = "Enviando";
    try {
      const r = await fetch(endpoint, { method: "POST", body: new FormData(form) });
      if (!r.ok) throw new Error(r.status);
      form.reset();
      rotulo.textContent = "Enviada";
      mostrarAviso("Recibimos tu consulta. Respondemos dentro de las 48 horas hábiles.");
    } catch (err) {
      rotulo.textContent = "Enviar la consulta";
      mostrarAviso(
        'No pudimos enviarla. Probá de nuevo, o escribinos a ' +
        '<a href="mailto:contacto@iotek.com.ar">contacto@iotek.com.ar</a>.'
      );
    } finally {
      boton.disabled = false;
      setTimeout(() => { rotulo.textContent = "Enviar la consulta"; }, 4000);
    }
  });
}
