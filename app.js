const DIAS_ORDEN = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const HOUR_HEIGHT = 56; // px por hora en el calendario semanal

let DATA = { horario: [], examenes: [], trabajos: [] };

// --- Overlay local (por dispositivo): trabajos completados y notas apuntadas
// desde el propio móvil/ordenador sin pasar por Claude. Si Claude escribe un
// valor directamente en data.json, ese valor manda salvo que haya un override local.
const OVERLAY_KEY = "magisterio_overlay_v1";
let OVERLAY = { completado: {}, nota: {} };

function loadOverlay() {
  try {
    const raw = localStorage.getItem(OVERLAY_KEY);
    if (raw) OVERLAY = Object.assign({ completado: {}, nota: {} }, JSON.parse(raw));
  } catch (e) { /* ignore */ }
}

function saveOverlay() {
  try { localStorage.setItem(OVERLAY_KEY, JSON.stringify(OVERLAY)); } catch (e) { /* ignore */ }
}

function getCompletado(item) {
  const o = OVERLAY.completado[item.id];
  return o !== undefined ? o : !!item.completado;
}

function setCompletado(item, val) {
  OVERLAY.completado[item.id] = val;
  saveOverlay();
}

function getNota(item) {
  const o = OVERLAY.nota[item.id];
  if (o !== undefined) return o;
  return item.nota != null ? item.nota : null;
}

function setNota(item, val) {
  OVERLAY.nota[item.id] = val;
  saveOverlay();
}

async function loadData() {
  const res = await fetch("data.json", { cache: "no-store" });
  DATA = await res.json();
  render();
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
    if (getCompletado(t)) return;
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

  const hoyStr = DIAS_ORDEN[(new Date().getDay() + 6) % 7]; // getDay: 0=domingo
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

    cols += `<div class="day-col ${d === hoyStr ? "today" : ""}" style="height:${totalHoras * HOUR_HEIGHT}px;background-size:100% ${HOUR_HEIGHT}px">${bloques}${nowLine}</div>`;
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
    const done = getCompletado(t);
    const nota = getNota(t);
    return `
      <div class="list-card">
        <div class="check ${done ? "done" : ""}" data-id="${t.id}">${done ? "✓" : ""}</div>
        <div class="info">
          <div class="titulo ${done ? "done" : ""}">${escapeHtml(t.titulo)}</div>
          <div class="meta">${escapeHtml(t.asignatura)} · Entrega: ${fmtFecha(t.fechaEntrega)}</div>
          ${t.notas ? `<div class="meta">${escapeHtml(t.notas)}</div>` : ""}
        </div>
        ${nota != null ? `<span class="grade-pill ${notaClass(nota)}">${nota}</span>` : ""}
        <span class="badge ${badge.cls}">${badge.txt}</span>
      </div>
    `;
  }).join("");

  el.querySelectorAll(".check").forEach(chk => {
    chk.addEventListener("click", () => {
      const item = DATA.trabajos.find(x => x.id === chk.dataset.id);
      setCompletado(item, !getCompletado(item));
      renderTrabajos();
      renderNextCard();
    });
  });
}

// --- Notas ---

function renderNotas() {
  const el = document.getElementById("view-notas");
  const items = [
    ...DATA.examenes.map(e => ({ ...e, _tipo: "Examen", _titulo: e.asignatura, _fecha: e.fecha })),
    ...DATA.trabajos.map(t => ({ ...t, _tipo: "Trabajo", _titulo: t.titulo, _fecha: t.fechaEntrega }))
  ];

  if (items.length === 0) {
    el.innerHTML = `<div class="empty-state">Todavía no hay exámenes ni trabajos donde apuntar notas.</div>`;
    return;
  }

  items.sort((a, b) => b._fecha.localeCompare(a._fecha));

  const notas = items.map(getNota).filter(n => n != null);
  const media = notas.length ? (notas.reduce((s, n) => s + Number(n), 0) / notas.length) : null;

  const summary = `
    <div class="notas-summary">
      <div class="ns-item">
        <div class="ns-value">${media != null ? media.toFixed(2) : "–"}</div>
        <div class="ns-label">Media</div>
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

  const list = items.map(it => {
    const nota = getNota(it);
    return `
      <div class="nota-card">
        <div class="info">
          <div class="titulo">${escapeHtml(it._titulo)}</div>
          <div class="meta">${it._tipo === "Examen" ? "📝" : "📌"} ${it._tipo}${it._tipo === "Trabajo" ? " · " + escapeHtml(it.asignatura) : ""} · ${fmtFecha(it._fecha)}</div>
        </div>
        <input class="nota-input" type="number" min="0" max="10" step="0.25" placeholder="–" value="${nota != null ? nota : ""}" data-id="${it.id}" data-kind="${it._tipo === "Examen" ? "examenes" : "trabajos"}">
      </div>
    `;
  }).join("");

  el.innerHTML = summary + `<div class="notas-list">${list}</div>
    <div class="notas-hint">Las notas que escribes aquí se guardan en este dispositivo. Si quieres que se vean también en tus otros dispositivos, dime la nota y la guardo directamente en los datos del curso.</div>`;

  el.querySelectorAll(".nota-input").forEach(inp => {
    inp.addEventListener("change", () => {
      const kind = inp.dataset.kind;
      const item = DATA[kind].find(x => x.id === inp.dataset.id);
      const val = inp.value === "" ? null : Number(inp.value);
      setNota(item, val);
      render();
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

loadOverlay();
setupTabs();
loadData();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
