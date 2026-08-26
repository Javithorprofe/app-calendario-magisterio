// Sube el contenido de data.json a Firestore (documento magisterio/data).
// - Si el documento no existe todavía, lo crea entero.
// - Si ya existe, actualiza campo a campo (rutas con puntos) para no pisar
//   "completado" ni "nota", que el propio usuario edita desde la app.
// - Si un id que existía en Firestore ya no está en data.json, se borra.
//
// Uso: npm install   (solo la primera vez)
//      npm run push

import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteField } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { firebaseConfig, DOC_COLLECTION, DOC_ID } from "./firebase-config.js";

const raw = JSON.parse(readFileSync(new URL("./data.json", import.meta.url)));
const SECTIONS = ["horario", "examenes", "trabajos"];

function toMap(arr) {
  const m = {};
  for (const item of arr || []) {
    if (!item.id) throw new Error("Falta 'id' en un elemento: " + JSON.stringify(item));
    m[item.id] = item;
  }
  return m;
}

const sections = Object.fromEntries(SECTIONS.map(s => [s, toMap(raw[s])]));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const ref = doc(db, DOC_COLLECTION, DOC_ID);

const snap = await getDoc(ref);

if (!snap.exists()) {
  await setDoc(ref, { curso: raw.curso ?? "", ...sections });
  console.log("✔ Documento creado en Firestore con", SECTIONS.map(s => `${Object.keys(sections[s]).length} ${s}`).join(", "));
} else {
  const current = snap.data();
  const payload = { curso: raw.curso ?? "" };

  for (const section of SECTIONS) {
    const items = sections[section];
    for (const [id, item] of Object.entries(items)) {
      for (const [field, value] of Object.entries(item)) {
        if (field === "id") continue;
        payload[`${section}.${id}.${field}`] = value;
      }
    }
    const currentIds = Object.keys(current[section] || {});
    for (const id of currentIds) {
      if (!items[id]) payload[`${section}.${id}`] = deleteField();
    }
  }

  await updateDoc(ref, payload);
  console.log("✔ Firestore actualizado (se conservan notas/completados existentes)");
}

process.exit(0);
