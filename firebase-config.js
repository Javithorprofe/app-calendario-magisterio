// Configuración pública del proyecto Firebase. El apiKey de Firebase Web NO es
// secreto (está pensado para ir en el cliente) — la seguridad real la dan las
// reglas de Firestore, que solo permiten leer/escribir el documento
// magisterio/data y nada más. Ver README.md para el texto de las reglas.
export const firebaseConfig = {
  apiKey: "AIzaSyBxuk_S-vg46MUuRWihWR9LgCChGxK-hyE",
  authDomain: "calendario-magisterio.firebaseapp.com",
  projectId: "calendario-magisterio",
  storageBucket: "calendario-magisterio.firebasestorage.app",
  messagingSenderId: "108854136702",
  appId: "1:108854136702:web:ca00c73d7258e34480ed2f"
};

export const DOC_COLLECTION = "magisterio";
export const DOC_ID = "data";
