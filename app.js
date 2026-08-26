const DIAS_ORDEN = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

let DATA = { horario: [], examenes: [], trabajos: [] };

async function loadData() {
  const res = await fetch("data.json", { cache: "no-store" });
  DATA = await res.json();
  render();
}

function parseFecha(f) {
  // f: "YYYY-MM-DD"
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
  const diff = Math.round((d - hoy0()) / 86400000);
  return diff;
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

function render() {
  renderNextCard();
  renderHorario();
  renderExamenes();
  renderTrabajos();
}

function renderNextCard() {
  const el = document.getElementById("nextCard");
  const proximos = [];

  DATA.examenes.forEach(e => {
    const dias = diasRestantes(e.fecha);
    if (dias >= 0) proximos.push({ tipo: "Examen", titulo: e.asignatura, fecha: e.fecha, hora: e.hora, dias });
  });
  DATA.trabajos.forEach(t => {
    if (t.completado) return;
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

function renderHorario() {
  const el = document.getElementById("view-horario");
  if (!DATA.horario || DATA.horario.length === 0) {
    el.innerHTML = `<div class="empty-state">No hay horario cargado todavía.</div>`;
    return;
  }

  const porDia = {};
  DATA.horario.forEach(c => {
    if (!porDia[c.dia]) porDia[c.dia] = [];
    porDia[c.dia].push(c);
  });

  const dias = Object.keys(porDia).sort((a, b) => DIAS_ORDEN.indexOf(a) - DIAS_ORDEN.indexOf(b));

  el.innerHTML = dias.map(dia => {
    const clases = porDia[dia].slice().sort((a, b) => a.inicio.localeCompare(b.inicio));
    return `
      <div class="day-block">
        <h3>${dia}</h3>
        ${clases.map(c => `
          <div class="class-card">
            <div class="bar" style="background:${c.color || "#6366f1"}"></div>
            <div class="info">
              <div class="asignatura">${escapeHtml(c.asignatura)}</div>
              <div class="meta">${c.inicio} – ${c.fin}${c.aula ? " · " + escapeHtml(c.aula) : ""}</div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }).join("");
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
    return `
      <div class="list-card">
        <div class="info">
          <div class="titulo">${escapeHtml(e.asignatura)}</div>
          <div class="meta">${fmtFecha(e.fecha)}${e.hora ? " · " + e.hora : ""}${e.aula ? " · " + escapeHtml(e.aula) : ""}</div>
          ${e.notas ? `<div class="meta">${escapeHtml(e.notas)}</div>` : ""}
        </div>
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
  el.innerHTML = ordenados.map((t, idx) => {
    const dias = diasRestantes(t.fechaEntrega);
    const badge = badgeFor(dias);
    return `
      <div class="list-card">
        <div class="check ${t.completado ? "done" : ""}" data-idx="${idx}" data-titulo="${encodeURIComponent(t.titulo)}">
          ${t.completado ? "✓" : ""}
        </div>
        <div class="info">
          <div class="titulo ${t.completado ? "done" : ""}">${escapeHtml(t.titulo)}</div>
          <div class="meta">${escapeHtml(t.asignatura)} · Entrega: ${fmtFecha(t.fechaEntrega)}</div>
          ${t.notas ? `<div class="meta">${escapeHtml(t.notas)}</div>` : ""}
        </div>
        <span class="badge ${badge.cls}">${badge.txt}</span>
      </div>
    `;
  }).join("");

  el.querySelectorAll(".check").forEach(chk => {
    chk.addEventListener("click", () => {
      const idx = Number(chk.dataset.idx);
      const ordenados = DATA.trabajos.slice().sort((a, b) => a.fechaEntrega.localeCompare(b.fechaEntrega));
      const t = ordenados[idx];
      const real = DATA.trabajos.find(x => x === t);
      real.completado = !real.completado;
      renderTrabajos();
      renderNextCard();
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
loadData();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
