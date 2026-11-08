import Link from "next/link";
export default function NotFound() {
  return <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", textAlign: "center" }}><div><h2>Halaman tidak ditemukan</h2><Link href="/dashboard">Kembali ke ringkasan</Link></div></div>;
}
