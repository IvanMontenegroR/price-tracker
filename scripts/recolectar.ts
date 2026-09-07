import { DepositoSupabase } from "../lib/db/supabase";
import { correr } from "../lib/recolector/correr";

/** Una corrida del recolector contra la base real, desde la terminal. */
const resumen = await correr({ deposito: new DepositoSupabase() });
console.log(JSON.stringify(resumen, null, 2));
