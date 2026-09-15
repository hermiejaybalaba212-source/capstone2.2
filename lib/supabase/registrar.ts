import { createClient } from "@supabase/supabase-js";

const registrarUrl = process.env.NEXT_PUBLIC_REGISTRAR_SUPABASE_URL!;
const registrarKey = process.env.NEXT_PUBLIC_REGISTRAR_SUPABASE_ANON_KEY!;

export function createRegistrarClient() {
  return createClient(registrarUrl, registrarKey);
}

export function getRegistrarSupabase() {
  return createRegistrarClient();
}

export const registrarSupabase = createRegistrarClient();
