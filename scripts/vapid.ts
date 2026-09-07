import webpush from "web-push";

// Las claves VAPID identifican a este servidor ante el push service del
// navegador. Se generan una vez y no se rotan sin resuscribir todo.
const claves = webpush.generateVAPIDKeys();
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${claves.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${claves.privateKey}`);
