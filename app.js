import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, updateDoc, deleteField } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig, DOC_COLLECTION, DOC_ID } from "./firebase-config.js";

const DIAS_ORDEN = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const MESES_NOMBRE = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const HOUR_HEIGHT = 56; // px por hora en el calendario semanal

function pad2(n) {
  return String(n).padStart(2, "0");
}

function mondayOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dia = (x.getDay() + 6) % 7; // lunes = 0
  x.setDate(x.getDate() - dia);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Semana que se muestra en el Horario (lunes de esa semana). Empieza en la
// semana actual.
let WEEK_START = mondayOf(new Date());

// Lista de asignaturas del curso, cada una con su color fijo. Se usa como
// desplegable al crear/editar horario, exámenes y trabajos, para que el
// nombre sea siempre exactamente igual y el color consistente en toda la
// app. PENDIENTE: sustituir por la lista real en cuanto Javier la pase.
const ASIGNATURAS = [
  { nombre: "Ejemplo: Psicología del Desarrollo", color: "#6366f1" },
  { nombre: "Ejemplo: Didáctica General", color: "#ec4899" },
  { nombre: "Ejemplo: TIC en Educación", color: "#10b981" }
];

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const docRef = doc(db, DOC_COLLECTION, DOC_ID);

let DATA = { curso: "", horario: [], examenes: [], trabajos: [] };
let CONNECTED = false;

// Cuatrimestre seleccionado en la vista de calendario (1 o 2). Por defecto,
// el que corresponda según la fecha de hoy.
let CUATRI_SEL = (() => {
  const mes = new Date().getMonth() + 1;
  return (mes >= 2 && mes <= 6) ? 2 : 1;
})();

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
  renderCuatrimestre();
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

// ¿Esta clase toca en la semana que empieza en weekStart (lunes, Date)?
function claseAplicaSemana(c, weekStart) {
  const repite = c.repite || "semanal";
  if (repite === "puntual") {
    if (!c.fecha) return false;
    return mondayOf(parseFecha(c.fecha)).getTime() === weekStart.getTime();
  }
  if (repite === "quincenal") {
    if (!c.fechaRef) return true; // sin referencia todavía: se muestra siempre
    const refMonday = mondayOf(parseFecha(c.fechaRef));
    const diffSemanas = Math.round((weekStart - refMonday) / (7 * 86400000));
    return diffSemanas % 2 === 0;
  }
  return true; // semanal
}

// Día de la semana en el que cae una clase ya filtrada para "esta semana".
function diaDeClase(c) {
  if ((c.repite || "semanal") === "puntual" && c.fecha) {
    return DIAS_ORDEN[(parseFecha(c.fecha).getDay() + 6) % 7];
  }
  return c.dia;
}

// Leyenda estable de color → asignatura, con todas las clases del horario
// (no solo las de la semana visible), para aprenderse la equivalencia.
function subjectLegendHtml() {
  const vistas = new Map();
  (DATA.horario || []).forEach(c => {
    if (c.asignatura && !vistas.has(c.asignatura)) vistas.set(c.asignatura, c.color || "#6366f1");
  });
  if (vistas.size === 0) return "";
  const chips = Array.from(vistas.entries()).map(([nombre, color]) =>
    `<div class="subject-chip"><span class="dot" style="background:${color}"></span>${escapeHtml(nombre)}</div>`
  ).join("");
  return `<div class="subject-legend">${chips}</div>`;
}

function renderHorario() {
  const el = document.getElementById("view-horario");
  const addBtn = `<button class="add-btn" id="addClase">+ Añadir clase</button>`;

  const weekEnd = addDays(WEEK_START, 6);
  const esSemanaActual = WEEK_START.getTime() === mondayOf(new Date()).getTime();
  const weekLabel = `${WEEK_START.getDate()} ${MESES_NOMBRE[WEEK_START.getMonth() + 1].slice(0, 3).toLowerCase()} – ${weekEnd.getDate()} ${MESES_NOMBRE[weekEnd.getMonth() + 1].slice(0, 3).toLowerCase()}`;
  const nav = `
    <div class="week-nav">
      <button class="week-nav-btn" id="weekPrev" aria-label="Semana anterior">‹</button>
      <div class="week-nav-center">
        <div class="week-nav-label">${weekLabel}</div>
        <button class="week-today-btn ${esSemanaActual ? "current" : ""}" id="weekToday">Semana actual</button>
      </div>
      <button class="week-nav-btn" id="weekNext" aria-label="Semana siguiente">›</button>
    </div>
  `;

  const clasesSemana = (DATA.horario || []).filter(c => claseAplicaSemana(c, WEEK_START));

  if (clasesSemana.length === 0) {
    el.innerHTML = addBtn + nav + `<div class="empty-state">No hay clases esta semana.</div>` + subjectLegendHtml();
    wireHorarioControls();
    return;
  }

  const diasConClase = Array.from(new Set(clasesSemana.map(diaDeClase)));
  const diasBase = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
  const dias = Array.from(new Set([...diasBase, ...diasConClase]))
    .filter(d => DIAS_ORDEN.includes(d))
    .sort((a, b) => DIAS_ORDEN.indexOf(a) - DIAS_ORDEN.indexOf(b));

  const starts = clasesSemana.map(c => Math.floor(toMinutes(c.inicio) / 60));
  const ends = clasesSemana.map(c => Math.ceil(toMinutes(c.fin) / 60));
  const minHour = Math.min(8, ...starts);
  const maxHour = Math.max(15, ...ends);
  const totalHoras = maxHour - minHour;

  const hoy = new Date();
  const esSemanaDeHoy = mondayOf(hoy).getTime() === WEEK_START.getTime();
  const hoyStr = esSemanaDeHoy ? DIAS_ORDEN[(hoy.getDay() + 6) % 7] : null;
  const ahoraMin = hoy.getHours() * 60 + hoy.getMinutes();

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
    const clases = clasesSemana.filter(c => diaDeClase(c) === d);
    let bloques = clases.map(c => {
      const top = (toMinutes(c.inicio) / 60 - minHour) * HOUR_HEIGHT;
      const height = Math.max(28, (toMinutes(c.fin) - toMinutes(c.inicio)) / 60 * HOUR_HEIGHT - 2);
      const etiqueta = c.repite === "puntual" ? " · puntual" : c.repite === "quincenal" ? " · quincenal" : "";
      const tip = `${c.asignatura}${c.aula ? " · " + c.aula : ""}${etiqueta}`;
      return `
        <div class="class-block" data-id="${c.id}" style="top:${top}px;height:${height}px;background:${c.color || "#6366f1"}" title="${escapeAttr(tip)}">
          <div class="cb-time">${c.inicio}–${c.fin}</div>
        </div>`;
    }).join("");

    let nowLine = "";
    if (d === hoyStr && ahoraMin >= minHour * 60 && ahoraMin <= maxHour * 60) {
      const top = (ahoraMin / 60 - minHour) * HOUR_HEIGHT;
      nowLine = `<div class="now-line" style="top:${top}px"></div>`;
    }

    cols += `<div class="day-col ${d === hoyStr ? "today" : ""}" style="height:${totalHoras * HOUR_HEIGHT}px">${bloques}${nowLine}</div>`;
  });

  el.innerHTML = addBtn + nav + `
    <div class="week-wrap">
      <div class="week-header" style="grid-template-columns:34px repeat(${dias.length},minmax(56px,1fr))">${header}</div>
      <div class="week-body" style="grid-template-columns:34px repeat(${dias.length},minmax(56px,1fr))">
        <div class="time-col" style="height:${totalHoras * HOUR_HEIGHT}px">${horas}</div>
        ${cols}
      </div>
    </div>
  ` + subjectLegendHtml();

  wireHorarioControls();
}

function irSemanaAnterior() { WEEK_START = addDays(WEEK_START, -7); renderHorario(); }
function irSemanaSiguiente() { WEEK_START = addDays(WEEK_START, 7); renderHorario(); }
function irSemanaActual() { WEEK_START = mondayOf(new Date()); renderHorario(); }

function wireSwipe(el, onLeft, onRight) {
  let startX = null, startY = null;
  el.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener("touchend", (e) => {
    if (startX == null) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) onLeft(); else onRight();
    }
    startX = null; startY = null;
  }, { passive: true });
}

function wireHorarioControls() {
  document.getElementById("addClase").addEventListener("click", () => openModal("horario", null));
  document.getElementById("weekPrev").addEventListener("click", irSemanaAnterior);
  document.getElementById("weekNext").addEventListener("click", irSemanaSiguiente);
  document.getElementById("weekToday").addEventListener("click", irSemanaActual);
  wireSwipe(document.getElementById("view-horario"), irSemanaSiguiente, irSemanaAnterior);
  document.querySelectorAll(".class-block").forEach(blk => {
    blk.addEventListener("click", () => {
      const item = DATA.horario.find(x => x.id === blk.dataset.id);
      openModal("horario", item);
    });
  });
}

// --- Calendario del cuatrimestre ---

const DIAS_CORTOS = ["L", "M", "X", "J", "V", "S", "D"];

function cursoInicioAno() {
  const now = new Date();
  const mes = now.getMonth() + 1;
  return mes >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

function mesesCuatri(n) {
  const inicio = cursoInicioAno();
  return n === 1
    ? [{ m: 9, y: inicio }, { m: 10, y: inicio }, { m: 11, y: inicio }, { m: 12, y: inicio }, { m: 1, y: inicio + 1 }]
    : [{ m: 2, y: inicio + 1 }, { m: 3, y: inicio + 1 }, { m: 4, y: inicio + 1 }, { m: 5, y: inicio + 1 }, { m: 6, y: inicio + 1 }];
}

function buildEventMap() {
  const map = {};
  DATA.examenes.forEach(e => {
    (map[e.fecha] = map[e.fecha] || []).push({ tipo: "examen", titulo: e.asignatura });
  });
  DATA.trabajos.forEach(t => {
    (map[t.fechaEntrega] = map[t.fechaEntrega] || []).push({ tipo: "trabajo", titulo: `${t.asignatura}: ${t.titulo}` });
  });
  return map;
}

function monthGridHtml(mes, anio, eventMap) {
  const first = new Date(anio, mes - 1, 1);
  const startOffset = (first.getDay() + 6) % 7; // lunes = 0
  const diasEnMes = new Date(anio, mes, 0).getDate();
  const hoy = new Date();
  const hoyStr = `${hoy.getFullYear()}-${pad2(hoy.getMonth() + 1)}-${pad2(hoy.getDate())}`;

  let celdas = "";
  for (let i = 0; i < startOffset; i++) celdas += `<div class="mc-cell empty"></div>`;

  for (let d = 1; d <= diasEnMes; d++) {
    const dateStr = `${anio}-${pad2(mes)}-${pad2(d)}`;
    const evs = eventMap[dateStr] || [];
    const esHoy = dateStr === hoyStr;
    const dots = evs.slice(0, 3).map(e => `<span class="mc-dot ${e.tipo}"></span>`).join("");
    const tip = evs.map(e => (e.tipo === "examen" ? "Examen: " : "Entrega: ") + e.titulo).join(" · ");
    celdas += `
      <div class="mc-cell ${esHoy ? "today" : ""} ${evs.length ? "has-event" : ""}" data-date="${dateStr}" ${tip ? `title="${escapeAttr(tip)}"` : ""}>
        <span class="mc-num">${d}</span>
        <span class="mc-dots">${dots}</span>
      </div>`;
  }

  const trailing = (7 - ((startOffset + diasEnMes) % 7)) % 7;
  for (let i = 0; i < trailing; i++) celdas += `<div class="mc-cell empty"></div>`;

  return `
    <div class="month-card">
      <div class="month-title">${MESES_NOMBRE[mes]} ${anio}</div>
      <div class="month-grid">
        ${DIAS_CORTOS.map(d => `<div class="mc-dow">${d}</div>`).join("")}
        ${celdas}
      </div>
    </div>
  `;
}

function renderCuatrimestre() {
  const el = document.getElementById("view-cuatrimestre");
  const eventMap = buildEventMap();
  const meses = mesesCuatri(CUATRI_SEL);

  const toggle = `
    <div class="cuatri-toggle">
      <button class="${CUATRI_SEL === 1 ? "active" : ""}" data-cuatri="1">1er cuatrimestre</button>
      <button class="${CUATRI_SEL === 2 ? "active" : ""}" data-cuatri="2">2º cuatrimestre</button>
    </div>
    <div class="cuatri-legend">
      <span><span class="mc-dot examen"></span> Examen</span>
      <span><span class="mc-dot trabajo"></span> Entrega de trabajo</span>
    </div>
  `;

  const grids = meses.map(({ m, y }) => monthGridHtml(m, y, eventMap)).join("");
  el.innerHTML = toggle + `<div class="months-wrap">${grids}</div>`;

  el.querySelectorAll(".cuatri-toggle button").forEach(btn => {
    btn.addEventListener("click", () => {
      CUATRI_SEL = Number(btn.dataset.cuatri);
      renderCuatrimestre();
    });
  });

  el.querySelectorAll(".mc-cell:not(.empty)").forEach(cell => {
    cell.addEventListener("click", () => openDayChoice(cell.dataset.date));
  });
}

function openDayChoice(dateStr) {
  const d = parseFecha(dateStr);
  document.getElementById("dayChoiceTitle").textContent = "Añadir el " + d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  document.getElementById("dayChoiceOverlay").dataset.date = dateStr;
  document.getElementById("dayChoiceOverlay").classList.add("open");
}

function closeDayChoice() {
  document.getElementById("dayChoiceOverlay").classList.remove("open");
}

function renderExamenes() {
  const el = document.getElementById("view-examenes");
  const addBtn = `<button class="add-btn" id="addExamen">+ Añadir examen</button>`;

  if (!DATA.examenes || DATA.examenes.length === 0) {
    el.innerHTML = addBtn + `<div class="empty-state">No hay exámenes registrados.</div>`;
    document.getElementById("addExamen").addEventListener("click", () => openModal("examenes", null));
    return;
  }
  const ordenados = DATA.examenes.slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  const list = ordenados.map(e => {
    const dias = diasRestantes(e.fecha);
    const badge = badgeFor(dias);
    const nota = getNota(e);
    return `
      <div class="list-card" data-id="${e.id}">
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

  el.innerHTML = addBtn + `<div class="cards-grid">${list}</div>`;
  document.getElementById("addExamen").addEventListener("click", () => openModal("examenes", null));
  el.querySelectorAll(".list-card").forEach(card => {
    card.addEventListener("click", () => {
      const item = DATA.examenes.find(x => x.id === card.dataset.id);
      openModal("examenes", item);
    });
  });
}

function renderTrabajos() {
  const el = document.getElementById("view-trabajos");
  const addBtn = `<button class="add-btn" id="addTrabajo">+ Añadir trabajo</button>`;

  if (!DATA.trabajos || DATA.trabajos.length === 0) {
    el.innerHTML = addBtn + `<div class="empty-state">No hay trabajos registrados.</div>`;
    document.getElementById("addTrabajo").addEventListener("click", () => openModal("trabajos", null));
    return;
  }
  const ordenados = DATA.trabajos.slice().sort((a, b) => a.fechaEntrega.localeCompare(b.fechaEntrega));
  const list = ordenados.map((t) => {
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
            <button class="tc-edit" data-id="${t.id}" title="Editar">✏️</button>
          </div>
        </div>
        <div class="meta">${escapeHtml(t.asignatura)} · Entrega: ${fmtFecha(t.fechaEntrega)}</div>
        ${t.notas ? `<div class="meta">${escapeHtml(t.notas)}</div>` : ""}
        <div class="fases">
          <button class="fase-chip ${entendido ? "active" : ""}" data-id="${t.id}" data-fase="entendido">
            ${entendido ? "✓ " : ""}Leído
          </button>
          <button class="fase-chip presentado ${presentado ? "active" : ""}" data-id="${t.id}" data-fase="presentado">
            ${presentado ? "✓ " : ""}Presentado
          </button>
        </div>
      </div>
    `;
  }).join("");

  el.innerHTML = addBtn + `<div class="cards-grid">${list}</div>`;
  document.getElementById("addTrabajo").addEventListener("click", () => openModal("trabajos", null));

  el.querySelectorAll(".fase-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = DATA.trabajos.find(x => x.id === btn.dataset.id);
      const fase = btn.dataset.fase;
      const current = fase === "entendido" ? getEntendido(item) : getPresentado(item);
      setFase(item, fase, !current);
    });
  });

  el.querySelectorAll(".tc-edit").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = DATA.trabajos.find(x => x.id === btn.dataset.id);
      openModal("trabajos", item);
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

// --- Modal de crear / editar / eliminar ---

const FORM_FIELDS = {
  examenes: [
    { key: "asignatura", label: "Asignatura", type: "select", options: ASIGNATURAS.map(a => a.nombre) },
    { key: "fecha", label: "Fecha", type: "dateselect" },
    { key: "hora", label: "Hora", type: "timeselect", optional: true },
    { key: "aula", label: "Aula", type: "text", optional: true },
    { key: "notas", label: "Notas", type: "textarea", optional: true }
  ],
  trabajos: [
    { key: "asignatura", label: "Asignatura", type: "select", options: ASIGNATURAS.map(a => a.nombre) },
    { key: "titulo", label: "Título", type: "text" },
    { key: "fechaEntrega", label: "Fecha de entrega", type: "dateselect" },
    { key: "notas", label: "Notas", type: "textarea", optional: true }
  ]
};

const TIPO_NOMBRE = { horario: "clase", examenes: "examen", trabajos: "trabajo" };
const ID_PREFIJO = { horario: "cl", examenes: "ex", trabajos: "tr" };

let modalCtx = null; // { kind, id: string|null }

function newId(kind) {
  return ID_PREFIJO[kind] + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const MINUTOS_SELECT = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

function timeSelectHtml(idPrefix, value) {
  const [h, m] = (value || "").split(":");
  const horas = Array.from({ length: 24 }, (_, i) => pad2(i));
  return `
    <div class="time-select">
      <select class="mf-input" id="${idPrefix}Hora">
        <option value="">--</option>
        ${horas.map(hh => `<option value="${hh}" ${hh === h ? "selected" : ""}>${hh}</option>`).join("")}
      </select>
      <span class="time-sep">:</span>
      <select class="mf-input" id="${idPrefix}Min">
        <option value="">--</option>
        ${MINUTOS_SELECT.map(mm => `<option value="${mm}" ${mm === m ? "selected" : ""}>${mm}</option>`).join("")}
      </select>
    </div>
  `;
}

function readTimeSelect(idPrefix) {
  const h = document.getElementById(idPrefix + "Hora").value;
  const m = document.getElementById(idPrefix + "Min").value;
  return (h && m) ? `${h}:${m}` : "";
}

function dateSelectHtml(idPrefix, value) {
  const [y, m, d] = (value || "").split("-");
  const inicioAno = cursoInicioAno();
  const anios = [inicioAno - 1, inicioAno, inicioAno + 1, inicioAno + 2];
  const dias = Array.from({ length: 31 }, (_, i) => pad2(i + 1));
  return `
    <div class="date-select">
      <select class="mf-input ds-dia" id="${idPrefix}Dia">
        <option value="">Día</option>
        ${dias.map(dd => `<option value="${dd}" ${dd === d ? "selected" : ""}>${dd}</option>`).join("")}
      </select>
      <select class="mf-input ds-mes" id="${idPrefix}Mes">
        <option value="">Mes</option>
        ${MESES_NOMBRE.slice(1).map((nombre, i) => {
          const mm = pad2(i + 1);
          return `<option value="${mm}" ${mm === m ? "selected" : ""}>${nombre}</option>`;
        }).join("")}
      </select>
      <select class="mf-input ds-anio" id="${idPrefix}Anio">
        <option value="">Año</option>
        ${anios.map(yy => `<option value="${yy}" ${String(yy) === y ? "selected" : ""}>${yy}</option>`).join("")}
      </select>
    </div>
  `;
}

function readDateSelect(idPrefix) {
  const d = document.getElementById(idPrefix + "Dia").value;
  const m = document.getElementById(idPrefix + "Mes").value;
  const y = document.getElementById(idPrefix + "Anio").value;
  return (d && m && y) ? `${y}-${m}-${d}` : "";
}

function horarioFieldsHtml(item) {
  const repite = (item && item.repite) || "semanal";
  const dia = (item && item.dia) || DIAS_ORDEN[0];
  const fecha = (item && item.fecha) || "";
  const fechaRef = (item && item.fechaRef) || "";
  const inicio = (item && item.inicio) || "";
  const fin = (item && item.fin) || "";
  const asignatura = (item && item.asignatura) || "";
  const aula = (item && item.aula) || "";
  const color = (item && item.color) || "#6366f1";

  return `
    <label class="mf-label">¿Cada cuánto toca?
      <select class="mf-input" id="hRepite">
        <option value="semanal" ${repite === "semanal" ? "selected" : ""}>Todas las semanas</option>
        <option value="quincenal" ${repite === "quincenal" ? "selected" : ""}>Una semana sí, una no</option>
        <option value="puntual" ${repite === "puntual" ? "selected" : ""}>Solo un día concreto</option>
      </select>
    </label>
    <div id="hGroupDia" class="mf-group">
      <label class="mf-label">Día
        <select class="mf-input" id="hDia">
          ${DIAS_ORDEN.slice(0, 7).map(d => `<option value="${d}" ${d === dia ? "selected" : ""}>${d}</option>`).join("")}
        </select>
      </label>
    </div>
    <div id="hGroupFecha" class="mf-group">
      <label class="mf-label">Fecha${dateSelectHtml("hFecha", fecha)}</label>
    </div>
    <div id="hGroupFechaRef" class="mf-group">
      <label class="mf-label">Una fecha en la que SÍ toque esta clase (para saber qué semanas le tocan)
        ${dateSelectHtml("hFechaRef", fechaRef)}
      </label>
    </div>
    <label class="mf-label">Hora de inicio${timeSelectHtml("hInicio", inicio)}</label>
    <label class="mf-label">Hora de fin${timeSelectHtml("hFin", fin)}</label>
    <label class="mf-label">Asignatura
      <select class="mf-input" id="hAsignatura">
        ${ASIGNATURAS.map(a => `<option value="${escapeAttr(a.nombre)}" ${a.nombre === asignatura ? "selected" : ""}>${escapeHtml(a.nombre)}</option>`).join("")}
      </select>
    </label>
    <label class="mf-label">Aula<input class="mf-input" type="text" id="hAula" value="${escapeAttr(aula)}"></label>
    <label class="mf-label">Color<input class="mf-input" type="color" id="hColor" value="${color}"></label>
  `;
}

function syncHorarioColor() {
  const nombre = document.getElementById("hAsignatura").value;
  const asig = ASIGNATURAS.find(a => a.nombre === nombre);
  if (asig) document.getElementById("hColor").value = asig.color;
}

function updateHorarioGroups() {
  const repite = document.getElementById("hRepite").value;
  document.getElementById("hGroupDia").classList.toggle("hidden", repite === "puntual");
  document.getElementById("hGroupFecha").classList.toggle("hidden", repite !== "puntual");
  document.getElementById("hGroupFechaRef").classList.toggle("hidden", repite !== "quincenal");
}

function openModal(kind, item) {
  // item puede ser: null (nuevo, vacío), un elemento existente completo
  // (tiene .id, es una edición) o un "borrador" con algún campo precargado
  // pero sin id (nuevo, p. ej. al pinchar un día del calendario).
  const isEdit = !!(item && item.id);
  modalCtx = { kind, id: isEdit ? item.id : null };

  document.getElementById("modalTitle").textContent = (isEdit ? "Editar " : "Añadir ") + TIPO_NOMBRE[kind];

  if (kind === "horario") {
    document.getElementById("modalFields").innerHTML = horarioFieldsHtml(item);
    document.getElementById("hRepite").addEventListener("change", updateHorarioGroups);
    document.getElementById("hAsignatura").addEventListener("change", syncHorarioColor);
    updateHorarioGroups();
  } else {
    const fields = FORM_FIELDS[kind];
    document.getElementById("modalFields").innerHTML = fields.map(f => {
      const val = (item && item[f.key] != null) ? item[f.key] : (f.default ?? "");
      if (f.type === "select") {
        return `<label class="mf-label">${f.label}
          <select class="mf-input" data-key="${f.key}">
            ${f.options.map(o => `<option value="${o}" ${o === val ? "selected" : ""}>${o}</option>`).join("")}
          </select>
        </label>`;
      }
      if (f.type === "textarea") {
        return `<label class="mf-label">${f.label}<textarea class="mf-input" data-key="${f.key}" rows="2">${escapeHtml(val)}</textarea></label>`;
      }
      if (f.type === "timeselect") {
        return `<label class="mf-label">${f.label}${timeSelectHtml("f_" + f.key, val)}</label>`;
      }
      if (f.type === "dateselect") {
        return `<label class="mf-label">${f.label}${dateSelectHtml("f_" + f.key, val)}</label>`;
      }
      return `<label class="mf-label">${f.label}<input class="mf-input" type="${f.type}" data-key="${f.key}" value="${escapeAttr(val)}"></label>`;
    }).join("");
  }

  document.getElementById("modalDelete").style.display = isEdit ? "inline-block" : "none";
  document.getElementById("modalOverlay").classList.add("open");
}

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("open");
  modalCtx = null;
}

function saveHorarioModal() {
  const { id } = modalCtx;
  const repite = document.getElementById("hRepite").value;
  const asignatura = document.getElementById("hAsignatura").value.trim();
  const inicio = readTimeSelect("hInicio");
  const fin = readTimeSelect("hFin");
  const aula = document.getElementById("hAula").value.trim();
  const color = document.getElementById("hColor").value;

  if (!asignatura || !inicio || !fin) {
    alert("Rellena al menos asignatura, hora de inicio y hora de fin.");
    return;
  }

  const useId = id || newId("horario");
  const update = {
    [`horario.${useId}.repite`]: repite,
    [`horario.${useId}.asignatura`]: asignatura,
    [`horario.${useId}.inicio`]: inicio,
    [`horario.${useId}.fin`]: fin,
    [`horario.${useId}.aula`]: aula,
    [`horario.${useId}.color`]: color
  };

  if (repite === "puntual") {
    const fecha = readDateSelect("hFecha");
    if (!fecha) { alert("Elige la fecha de esta clase puntual."); return; }
    update[`horario.${useId}.fecha`] = fecha;
  } else {
    const dia = document.getElementById("hDia").value;
    update[`horario.${useId}.dia`] = dia;
    if (repite === "quincenal") {
      const fechaRef = readDateSelect("hFechaRef");
      if (!fechaRef) { alert("Indica una fecha en la que sí toque esta clase, para saber qué semanas son."); return; }
      update[`horario.${useId}.fechaRef`] = fechaRef;
    }
  }

  updateDoc(docRef, update).then(closeModal).catch(err => { closeModal(); showConnError(err); });
}

function saveModal() {
  const { kind, id } = modalCtx;
  if (kind === "horario") return saveHorarioModal();
  const fields = FORM_FIELDS[kind];
  const values = {};
  let faltan = [];

  fields.forEach(f => {
    const val = f.type === "timeselect" ? readTimeSelect("f_" + f.key)
      : f.type === "dateselect" ? readDateSelect("f_" + f.key)
      : document.querySelector(`#modalFields [data-key="${f.key}"]`).value.trim();
    if (!f.optional && !val) faltan.push(f.label);
    values[f.key] = val;
  });

  if (faltan.length) {
    alert("Faltan campos obligatorios: " + faltan.join(", "));
    return;
  }

  const useId = id || newId(kind);
  const update = {};
  for (const [k, v] of Object.entries(values)) {
    update[`${kind}.${useId}.${k}`] = v;
  }

  updateDoc(docRef, update).then(closeModal).catch(err => { closeModal(); showConnError(err); });
}

function deleteModal() {
  const { kind, id } = modalCtx;
  if (!id) return;
  if (!confirm("¿Seguro que quieres eliminarlo? No se puede deshacer.")) return;
  updateDoc(docRef, { [`${kind}.${id}`]: deleteField() }).then(closeModal).catch(err => { closeModal(); showConnError(err); });
}

function setupModal() {
  document.getElementById("modalCancel").addEventListener("click", closeModal);
  document.getElementById("modalSave").addEventListener("click", saveModal);
  document.getElementById("modalDelete").addEventListener("click", deleteModal);
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") closeModal();
  });

  document.getElementById("dayChoiceCancel").addEventListener("click", closeDayChoice);
  document.getElementById("dayChoiceOverlay").addEventListener("click", (e) => {
    if (e.target.id === "dayChoiceOverlay") closeDayChoice();
  });
  document.getElementById("dayChoiceExamen").addEventListener("click", () => {
    const fecha = document.getElementById("dayChoiceOverlay").dataset.date;
    closeDayChoice();
    openModal("examenes", { fecha });
  });
  document.getElementById("dayChoiceTrabajo").addEventListener("click", () => {
    const fecha = document.getElementById("dayChoiceOverlay").dataset.date;
    closeDayChoice();
    openModal("trabajos", { fechaEntrega: fecha });
  });
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
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
setupModal();
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
