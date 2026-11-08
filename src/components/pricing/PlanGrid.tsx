"use client";
// Monthly / yearly switch and the plan cards.
import { useState } from "react";
import Link from "next/link";
import { IconArrowUpRight, IconCheck, IconClockHour4, IconSparkles } from "@tabler/icons-react";
import { formatRupiah, PLANS, TRIAL, YEARLY_MONTHS_PAID, type Billing, type Plan } from "./plans";
import c from "./pricing.module.css";

function Price({ plan, billing }: { plan: Plan; billing: Billing }) {
  if (plan.startsFrom) {
    return (
      <div className={c.price}>
        <small className={c.from}>Mulai dari</small>
        <b>{formatRupiah(plan.monthly)}<span>/bulan</span></b>
        <small>Penawaran disesuaikan kebutuhan</small>
      </div>
    );
  }
  const perMonth = billing === "yearly" ? (plan.monthly * YEARLY_MONTHS_PAID) / 12 : plan.monthly;
  return (
    <div className={c.price}>
      <b>{formatRupiah(Math.round(perMonth / 1000) * 1000)}<span>/bulan</span></b>
      <small>{billing === "yearly" ? `${formatRupiah(plan.monthly * YEARLY_MONTHS_PAID)} ditagih per tahun` : "Ditagih bulanan"}</small>
    </div>
  );
}

export function PlanGrid() {
  const [billing, setBilling] = useState<Billing>("monthly");
  return (
    <>
      <div className={c.billing} role="radiogroup" aria-label="Periode tagihan">
        {(["monthly", "yearly"] as const).map((b) => (
          <button key={b} type="button" role="radio" aria-checked={billing === b} data-active={billing === b || undefined} onClick={() => setBilling(b)}>
            {b === "monthly" ? "Bulanan" : "Tahunan"}
            {b === "yearly" && <em>Hemat 2 bulan</em>}
          </button>
        ))}
      </div>

      {/* Trial first: every plan starts with it, so it sits above the paid plans rather than beside them. */}
      <div className={c.trial}>
        <span className={c.trialIcon}><IconClockHour4 size={22} /></span>
        <div className={c.trialText}>
          <b>Trial {TRIAL.days} hari, tanpa biaya</b>
          <ul>{TRIAL.includes.map((t) => <li key={t}><IconCheck size={14} />{t}</li>)}</ul>
        </div>
        <Link href={TRIAL.cta.href} className={c.ctaPrimary}>{TRIAL.cta.label}<IconArrowUpRight size={16} /></Link>
      </div>

      <div className={c.plans}>
        {PLANS.map((plan, i) => (
          <article key={plan.id} className={c.plan} data-featured={plan.featured || undefined} style={{ animationDelay: `${i * 80}ms` }}>
            {plan.featured && <span className={c.badge}><IconSparkles size={12} />Paling populer</span>}
            <h3>{plan.name}</h3>
            <p className={c.tagline}>{plan.tagline}</p>
            <Price plan={plan} billing={billing} />
            <Link href={plan.cta.href} className={plan.featured ? c.ctaPrimary : c.ctaSecondary}>{plan.cta.label}<IconArrowUpRight size={16} /></Link>
            <ul>{plan.highlights.map((h) => <li key={h}><IconCheck size={15} />{h}</li>)}</ul>
          </article>
        ))}
      </div>
    </>
  );
}
