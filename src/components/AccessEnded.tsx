// Shown to a client whose subscription ended (lib/server/plan.ts EXPIRED_MESSAGE): no prices, just who to contact.
import { IconClockPause } from "@tabler/icons-react";
import classes from "./accessEnded.module.css";

export function AccessEnded() {
  return (
    <section className={classes.box}>
      <span className={classes.icon} aria-hidden><IconClockPause size={28} /></span>
      <h1>Masa akses Anda sudah berakhir</h1>
      <p>Data proyek dan kunci API Anda dihentikan sementara. Hubungi admin Signalbase untuk memperpanjang; semua proyek dan data Anda tetap tersimpan dan langsung bisa dipakai lagi setelah diperpanjang.</p>
    </section>
  );
}
