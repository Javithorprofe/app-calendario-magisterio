import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig, DOC_COLLECTION, DOC_ID } from "./firebase-config.js";

const DIAS_ORDEN = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const HOUR_HEIGHT = 56; // px por hora en el calendario semanal

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const docRef = doc(db, DOC_COLLECTION, DOC_ID);

let DATA = { curso: "", horario: [], examenes: [], trabajos: [] };
let CONNECTED = false;

function mapToArray(map) {
  return Object.entries(map || {}).map(([id, v]) => ({ id, ...v }));
}

onSnapshot(docRef, snap => {
  CONNECTED = true;
  const d = snap.exists() ? snap.data() : {};
  DATA = {
    curso: d.curso || "",
    horario: mapToArray(d.horario),
    examenes: mapToArray(d.examenes),
    trabajos: mapToArray(d.trabajos)
  };
  hideConnError();
  render();
}, err => {
  showConnError(err);
});

function showConnError(err) {
  const el = document.getElementById("connError");
  el.style.display = "block";
  el.textContent = "No se ha podido conectar con la base de datos (" + (err?.code || err?.message || "error") + "). Comprueba tu conexión.";
}

function hideConnError() {
  document.getElementById("connError").style.display = "none";
}

function getEntendido(item) {
  return !!item.entendido;
}

function getPresentado(item) {
  return !!item.presentado;
}

function setFase(item, fase, val) {
  const update = { [`trabajos.${item.id}.${fase}`]: val };
  // Presentar implica haber entendido el trabajo.
  if (fase === "presentado" && val) update[`trabajos.${item.id}.entendido`] = true;
  updateDoc(docRef, update).catch(showConnError);
}

function getNota(item) {
  return item.nota != null ? item.nota : null;
}

function setNota(item, kind, val) {
  updateDoc(docRef, { [`${kind}.${item.id}.nota`]: val }).catch(showConnError);
}

function parseFecha(f) {
  const [y, m, d] = f.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function hoy0() {
  const h = new Date();
  h.setHours(0, 0, 0, 0);
  return h;
}

function diasRestantes(fecha) {
  const d = parseFecha(fecha);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - hoy0()) / 86400000);
}

function fmtFecha(fecha) {
  const d = parseFecha(fecha);
  return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
}

function badgeFor(dias) {
  if (dias < 0) return { cls: "past", txt: "Pasado" };
  if (dias === 0) return { cls: "urgent", txt: "Hoy" };
  if (dias === 1) return { cls: "urgent", txt: "Mañana" };
  if (dias <= 7) return { cls: "soon", txt: `En ${dias} días` };
  return { cls: "normal", txt: `En ${dias} días` };
}

function notaClass(nota) {
  if (nota == null) return "pending";
  if (nota >= 7) return "good";
  if (nota >= 5) return "mid";
  return "bad";
}

function render() {
  renderNextCard();
  renderHorario();
  renderExamenes();
  renderTrabajos();
  renderNotas();
}

function renderNextCard() {
  const el = document.getElementById("nextCard");
  const proximos = [];

  DATA.examenes.forEach(e => {
    const dias = diasRestantes(e.fecha);
    if (dias >= 0) proximos.push({ tipo: "Examen", titulo: e.asignatura, fecha: e.fecha, hora: e.hora, dias });
  });
  DATA.trabajos.forEach(t => {
    if (getPresentado(t)) return;
    const dias = diasRestantes(t.fechaEntrega);
    if (dias >= 0) proximos.push({ tipo: "Trabajo", titulo: t.titulo, fecha: t.fechaEntrega, hora: null, dias });
  });

  proximos.sort((a, b) => a.dias - b.dias);

  if (proximos.length === 0) {
    el.className = "next-card empty";
    el.innerHTML = `<div class="label">Próximamente</div><div class="title">Nada pendiente por ahora 🎉</div>`;
    return;
  }

  const p = proximos[0];
  el.className = "next-card";
  const badge = badgeFor(p.dias);
  el.innerHTML = `
    <div class="label">${p.tipo} más próximo</div>
    <div class="title">${escapeHtml(p.titulo)}</div>
    <div class="meta">${fmtFecha(p.fecha)}${p.hora ? " · " + p.hora : ""} · ${badge.txt}</div>
  `;
}

// --- Calendario semanal ---

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function renderHorario() {
  const el = document.getElementById("view-horario");
  if (!DATA.horario || DATA.horario.length === 0) {
    el.innerHTML = `<div class="empty-state">No hay horario cargado todavía.</div>`;
    return;
  }

  const diasConClase = Array.from(new Set(DATA.horario.map(c => c.dia)));
  const diasBase = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
  const dias = Array.from(new Set([...diasBase, ...diasConClase]))
    .filter(d => DIAS_ORDEN.includes(d))
    .sort((a, b) => DIAS_ORDEN.indexOf(a) - DIAS_ORDEN.indexOf(b));

  const starts = DATA.horario.map(c => Math.floor(toMinutes(c.inicio) / 60));
  const ends = DATA.horario.map(c => Math.ceil(toMinutes(c.fin) / 60));
  const minHour = Math.min(8, ...starts);
  const maxHour = Math.max(15, ...ends);
  const totalHoras = maxHour - minHour;

  const hoyStr = DIAS_ORDEN[(new Date().getDay() + 6) % 7];
  const ahoraMin = new Date().getHours() * 60 + new Date().getMinutes();

  let horas = "";
  for (let h = minHour; h < maxHour; h++) {
    horas += `<div class="slot">${String(h).padStart(2, "0")}:00</div>`;
  }

  let header = `<div class="corner"></div>`;
  dias.forEach(d => {
    header += `<div class="day-head ${d === hoyStr ? "today" : ""}">${d.slice(0, 3)}</div>`;
  });

  let cols = "";
  dias.forEach(d => {
    const clases = DATA.horario.filter(c => c.dia === d);
    let bloques = clases.map(c => {
      const top = (toMinutes(c.inicio) / 60 - minHour) * HOUR_HEIGHT;
      const height = Math.max(28, (toMinutes(c.fin) - toMinutes(c.inicio)) / 60 * HOUR_HEIGHT - 2);
      return `
        <div class="class-block" style="top:${top}px;height:${height}px;background:${c.color || "#6366f1"}" title="${escapeHtml(c.asignatura)}">
          <div class="cb-title">${escapeHtml(c.asignatura)}</div>
          <div class="cb-meta">${c.inicio}–${c.fin}${c.aula ? " · " + escapeHtml(c.aula) : ""}</div>
        </div>`;
    }).join("");

    let nowLine = "";
    if (d === hoyStr && ahoraMin >= minHour * 60 && ahoraMin <= maxHour * 60) {
      const top = (ahoraMin / 60 - minHour) * HOUR_HEIGHT;
      nowLine = `<div class="now-line" style="top:${top}px"></div>`;
    }

    cols += `<div class="day-col ${d === hoyStr ? "today" : ""}" style="height:${totalHoras * HOUR_HEIGHT}px">${bloques}${nowLine}</div>`;
  });

  el.innerHTML = `
    <div class="week-wrap">
      <div class="week-header" style="grid-template-columns:44px repeat(${dias.length},minmax(92px,1fr))">${header}</div>
      <div class="week-body" style="grid-template-columns:44px repeat(${dias.length},minmax(92px,1fr))">
        <div class="time-col" style="height:${totalHoras * HOUR_HEIGHT}px">${horas}</div>
        ${cols}
      </div>
    </div>
  `;
}

function renderExamenes() {
  const el = document.getElementById("view-examenes");
  if (!DATA.examenes || DATA.examenes.length === 0) {
    el.innerHTML = `<div class="empty-state">No hay exámenes registrados.</div>`;
    return;
  }
  const ordenados = DATA.examenes.slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  el.innerHTML = ordenados.map(e => {
    const dias = diasRestantes(e.fecha);
    const badge = badgeFor(dias);
    const nota = getNota(e);
    return `
      <div class="list-card">
        <div class="info">
          <div class="titulo">${escapeHtml(e.asignatura)}</div>
          <div class="meta">${fmtFecha(e.fecha)}${e.hora ? " · " + e.hora : ""}${e.aula ? " · " + escapeHtml(e.aula) : ""}</div>
          ${e.notas ? `<div class="meta">${escapeHtml(e.notas)}</div>` : ""}
        </div>
        ${nota != null ? `<span class="grade-pill ${notaClass(nota)}">${nota}</span>` : ""}
        <span class="badge ${badge.cls}">${badge.txt}</span>
      </div>
    `;
  }).join("");
}

function renderTrabajos() {
  const el = document.getElementById("view-trabajos");
  if (!DATA.trabajos || DATA.trabajos.length === 0) {
    el.innerHTML = `<div class="empty-state">No hay trabajos registrados.</div>`;
    return;
  }
  const ordenados = DATA.trabajos.slice().sort((a, b) => a.fechaEntrega.localeCompare(b.fechaEntrega));
  el.innerHTML = ordenados.map((t) => {
    const dias = diasRestantes(t.fechaEntrega);
    const badge = badgeFor(dias);
    const entendido = getEntendido(t);
    const presentado = getPresentado(t);
    const nota = getNota(t);
    return `
      <div class="trabajo-card">
        <div class="tc-top">
          <div class="titulo ${presentado ? "done" : ""}">${escapeHtml(t.titulo)}</div>
          <div class="tc-badges">
            ${nota != null ? `<span class="grade-pill ${notaClass(nota)}">${nota}</span>` : ""}
            <span class="badge ${badge.cls}">${badge.txt}</span>
          </div>
        </div>
        <div class="meta">${escapeHtml(t.asignatura)} · Entrega: ${fmtFecha(t.fechaEntrega)}</div>
        ${t.notas ? `<div class="meta">${escapeHtml(t.notas)}</div>` : ""}
        <div class="fases">
          <button class="fase-chip ${entendido ? "active" : ""}" data-id="${t.id}" data-fase="entendido">
            ${entendido ? "✓ " : ""}Entendido
          </button>
          <button class="fase-chip presentado ${presentado ? "active" : ""}" data-id="${t.id}" data-fase="presentado">
            ${presentado ? "✓ " : ""}Presentado
          </button>
        </div>
      </div>
    `;
  }).join("");

  el.querySelectorAll(".fase-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = DATA.trabajos.find(x => x.id === btn.dataset.id);
      const fase = btn.dataset.fase;
      const current = fase === "entendido" ? getEntendido(item) : getPresentado(item);
      setFase(item, fase, !current);
    });
  });
}

// --- Notas ---

function renderNotas() {
  const el = document.getElementById("view-notas");
  const items = [
    ...DATA.examenes.map(e => ({ ...e, _tipo: "Examen", _titulo: e.asignatura, _fecha: e.fecha, _kind: "examenes" })),
    ...DATA.trabajos.map(t => ({ ...t, _tipo: "Trabajo", _titulo: t.titulo, _fecha: t.fechaEntrega, _kind: "trabajos" }))
  ];

  if (items.length === 0) {
    el.innerHTML = `<div class="empty-state">Todavía no hay exámenes ni trabajos donde apuntar notas.</div>`;
    return;
  }

  const notas = items.map(getNota).filter(n => n != null);
  const media = notas.length ? (notas.reduce((s, n) => s + Number(n), 0) / notas.length) : null;

  const summary = `
    <div class="notas-summary">
      <div class="ns-item">
        <div class="ns-value">${media != null ? media.toFixed(2) : "–"}</div>
        <div class="ns-label">Media general</div>
      </div>
      <div class="ns-item">
        <div class="ns-value">${notas.length}</div>
        <div class="ns-label">Con nota</div>
      </div>
      <div class="ns-item">
        <div class="ns-value">${items.length - notas.length}</div>
        <div class="ns-label">Pendientes</div>
      </div>
    </div>
  `;

  // Nota: de momento la media de cada asignatura es la media simple de sus
  // notas. En cuanto me pases las ponderaciones de cada asignatura, la
  // cambio para que sea la nota final ponderada.
  const porAsignatura = {};
  items.forEach(it => {
    const key = it.asignatura || "Sin asignatura";
    (porAsignatura[key] = porAsignatura[key] || []).push(it);
  });
  const asignaturas = Object.keys(porAsignatura).sort((a, b) => a.localeCompare(b, "es"));

  const bloques = asignaturas.map(asig => {
    const arr = porAsignatura[asig].slice().sort((a, b) => b._fecha.localeCompare(a._fecha));
    const notasAsig = arr.map(getNota).filter(n => n != null);
    const mediaAsig = notasAsig.length ? (notasAsig.reduce((s, n) => s + Number(n), 0) / notasAsig.length) : null;

    const list = arr.map(it => {
      const nota = getNota(it);
      return `
        <div class="nota-card">
          <div class="info">
            <div class="titulo">${escapeHtml(it._titulo)}</div>
            <div class="meta">${it._tipo === "Examen" ? "📝" : "📌"} ${it._tipo} · ${fmtFecha(it._fecha)}</div>
          </div>
          <input class="nota-input" type="number" min="0" max="10" step="0.25" placeholder="–" value="${nota != null ? nota : ""}" data-id="${it.id}" data-kind="${it._kind}">
        </div>
      `;
    }).join("");

    return `
      <div class="asig-block">
        <div class="asig-head">
          <span class="asig-name">${escapeHtml(asig)}</span>
          ${mediaAsig != null ? `<span class="grade-pill ${notaClass(mediaAsig)}">${mediaAsig.toFixed(2)}</span>` : ""}
        </div>
        <div class="notas-list">${list}</div>
      </div>
    `;
  }).join("");

  el.innerHTML = summary + bloques;

  el.querySelectorAll(".nota-input").forEach(inp => {
    inp.addEventListener("change", () => {
      const kind = inp.dataset.kind;
      const item = DATA[kind].find(x => x.id === inp.dataset.id);
      const val = inp.value === "" ? null : Number(inp.value);
      setNota(item, kind, val);
    });
  });
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function setupTabs() {
  const tabs = document.querySelectorAll("nav.tabs button, nav.bottom button");
  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      document.querySelectorAll("nav.tabs button, nav.bottom button").forEach(b => {
        b.classList.toggle("active", b.dataset.target === target);
      });
      document.querySelectorAll("section.view").forEach(s => {
        s.classList.toggle("active", s.id === "view-" + target);
      });
    });
  });
}

setupTabs();
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
