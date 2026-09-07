// Service worker mínimo: solo push. No cachea nada — un tracker de precios
// que muestra datos viejos de un caché es peor que uno que no abre.
self.addEventListener("push", (evento) => {
  if (!evento.data) return;
  let datos = {};
  try {
    datos = evento.data.json();
  } catch {
    datos = { titulo: "Precio puesto", cuerpo: evento.data.text() };
  }
  evento.waitUntil(
    self.registration.showNotification(datos.titulo ?? "Precio puesto", {
      body: datos.cuerpo ?? "",
      icon: "/icono.svg",
      badge: "/icono.svg",
      data: { url: datos.url ?? "/" },
      tag: datos.url ?? "precio",
    })
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const url = evento.notification.data?.url ?? "/";
  evento.waitUntil(clients.openWindow(url));
});
