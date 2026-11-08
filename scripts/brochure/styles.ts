// Print styles for the brochure: A4 pages (210 × 297 mm), the website's colours and type.
export const css = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: Inter, system-ui, sans-serif; color: #18162c; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
:root { --ink: #18162c; --muted: #6f6a85; --line: #e7e5ef; --violet: #7850e9; --cyan: #0891b2; }

.sheet { position: relative; width: 210mm; height: 297mm; overflow: hidden; page-break-after: always; display: flex; flex-direction: column; background: #fff; }
.sheet:last-child { page-break-after: auto; }
.body { flex: 1; padding: 6mm 16mm 0; display: flex; flex-direction: column; }
.run { display: flex; justify-content: space-between; align-items: center; padding: 10mm 16mm 4mm; border-bottom: 1px solid var(--line); margin: 0 0 4mm; font-size: 9pt; font-weight: 600; color: var(--muted); letter-spacing: .4px; }
.foot { display: flex; align-items: center; gap: 10px; padding: 6mm 16mm 9mm; font-size: 8pt; color: #9a95ad; }
.foot span:first-child { flex: 1; }
.foot b { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; color: #fff; background: linear-gradient(135deg, #7c3aed, #0891b2); font-size: 8pt; }

.brand { display: inline-flex; align-items: center; gap: 8px; font-size: 15pt; font-weight: 800; letter-spacing: -.4px; color: var(--ink); }
.brand b { color: var(--violet); font-weight: 800; }
.brand.light { color: #fff; font-size: 18pt; }
.brand.light b { color: #a78bfa; }
.run .brand { font-size: 11pt; }
.run .brand svg { width: 22px; height: 22px; }

.eyebrow { font-size: 8pt; font-weight: 800; letter-spacing: 1.6px; color: var(--violet); }
.heading { margin-bottom: 7mm; }
.heading h2 { margin: 6px 0 8px; font-size: 25pt; line-height: 1.08; font-weight: 800; letter-spacing: -.8px; }
/* Solid accent colours: gradient text (background-clip) leaves hairline boxes in Chrome's PDF output. */
.heading h2 em, h1 em { font-style: normal; color: #6d4fe0; }
.heading p { margin: 0; max-width: 150mm; font-size: 10.5pt; line-height: 1.6; color: var(--muted); }
.sub { margin: 7mm 0 3.5mm; font-size: 12pt; font-weight: 750; }
.note { margin-top: auto; padding-top: 4mm; font-size: 8.5pt; color: #8a84a0; }
.muted { font-size: 9pt; line-height: 1.55; color: rgba(255,255,255,.7); margin: 10px 0 0; }
.ico { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px; color: var(--violet); background: #f1ecff; flex-shrink: 0; }
.tag { display: inline-block; padding: 3px 9px; border-radius: 99px; font-size: 7.5pt; font-weight: 800; letter-spacing: 1px; }
.tag.red { color: #be123c; background: #ffe4e6; } .tag.green { color: #047857; background: #d1fae5; }
.tag.violet { color: #6d28d9; background: #ede9fe; } .tag.cyan { color: #67e8f9; background: rgba(34,211,238,.14); }
.checks { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 7px; }
.checks li { display: flex; gap: 7px; align-items: flex-start; font-size: 9.5pt; line-height: 1.45; }
.checks svg { flex-shrink: 0; color: #10b981; margin-top: 1px; }

/* Cover */
.cover { color: #fff; padding: 14mm 16mm 12mm; background: radial-gradient(90% 55% at 0% 0%, rgba(124,58,237,.55), transparent 60%), radial-gradient(70% 45% at 100% 100%, rgba(34,211,238,.32), transparent 60%), #0d0b1f; }
.coverGrid { position: absolute; inset: 0; opacity: .5; background-image: linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px); background-size: 28px 28px; }
.coverGlow { position: absolute; right: -40mm; top: 30mm; width: 130mm; height: 130mm; border-radius: 50%; border: 1px solid rgba(167,139,250,.22); box-shadow: 0 0 0 18mm rgba(167,139,250,.04), 0 0 0 36mm rgba(34,211,238,.03); }
.coverTop { position: relative; display: flex; justify-content: space-between; align-items: center; }
.pill { display: inline-block; padding: 5px 12px; border-radius: 99px; font-size: 7.5pt; font-weight: 800; letter-spacing: 1.4px; color: #67e8f9; border: 1px solid rgba(34,211,238,.35); background: rgba(34,211,238,.08); }
.coverMain { position: relative; margin-top: 26mm; }
.cover h1 { margin: 0 0 5mm; max-width: 165mm; font-size: 34pt; line-height: 1.04; font-weight: 800; letter-spacing: -1.3px; }
.cover h1 em { font-style: normal; color: #b9a7ff; }
.coverMain > p { max-width: 135mm; font-size: 11.5pt; line-height: 1.6; color: rgba(255,255,255,.72); margin: 0; }
.heroStat { position: relative; display: grid; grid-template-columns: .9fr 1.1fr; gap: 0; margin-top: 15mm; border-radius: 20px; overflow: hidden; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05); }
.heroNum { padding: 18px 20px; border-right: 1px solid rgba(255,255,255,.1); }
.heroNum small, .heroChart small { font-size: 7pt; font-weight: 800; letter-spacing: 1.4px; color: #a78bfa; }
.heroNum b { display: block; margin: 6px 0 2px; font-size: 44pt; line-height: 1; font-weight: 800; letter-spacing: -1.6px; }
.heroNum b i { font-style: normal; color: #67e8f9; }
.heroNum > span { font-size: 9.5pt; color: rgba(255,255,255,.7); }
.split { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; }
.split span, .legendRow span { display: inline-flex; align-items: center; gap: 6px; font-size: 8.5pt; color: rgba(255,255,255,.75); }
.dotS, .dotO { display: inline-block; width: 8px; height: 8px; border-radius: 3px; }
.dotS { background: #a78bfa; } .dotO { background: #22d3ee; }
.heroChart { padding: 18px 20px; display: flex; flex-direction: column; }
.bars { width: 100%; height: 36mm; margin: 12px 0 10px; }
.legendRow { display: flex; gap: 14px; align-items: center; }
.legendRow b { margin-left: auto; font-size: 9pt; color: #fff; }
.statGrid { position: relative; display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-top: 8mm; }
.statGrid div { padding: 13px 12px; border-radius: 14px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); }
.statGrid b { display: block; font-size: 17pt; font-weight: 800; letter-spacing: -.5px; line-height: 1.1; }
.statGrid span { display: block; margin-top: 4px; font-size: 8.5pt; font-weight: 600; color: #fff; }
.statGrid small { display: block; font-size: 7.5pt; color: rgba(255,255,255,.55); }
.moodBlock { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8mm; }
.moodBlock > div { padding: 14px 16px; border-radius: 16px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); }
.moodBlock small { font-size: 7pt; font-weight: 800; letter-spacing: 1.3px; color: #a78bfa; }
.moodBar { display: flex; gap: 3px; height: 10px; margin: 10px 0 9px; border-radius: 99px; overflow: hidden; }
.moodBar i { min-width: 4px; }
.moodLegend { display: flex; flex-wrap: wrap; gap: 4px 12px; }
.moodLegend span { display: inline-flex; align-items: center; gap: 5px; font-size: 8.5pt; color: rgba(255,255,255,.75); }
.moodLegend i { width: 7px; height: 7px; border-radius: 50%; }
.moodLegend b { color: #fff; }
.coverToc { position: relative; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 14px; margin-top: auto; padding-top: 6mm; }
.coverToc span { font-size: 8.5pt; color: rgba(255,255,255,.7); }
.coverToc b { display: inline-block; width: 22px; color: #a78bfa; font-weight: 800; }
.coverFoot { position: relative; display: flex; justify-content: space-between; margin-top: 5mm; padding-top: 5mm; border-top: 1px solid rgba(255,255,255,.12); font-size: 8pt; color: rgba(255,255,255,.55); }

/* About */
.problem { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; }
.problem > div { padding: 14px 16px; border-radius: 16px; border: 1px solid var(--line); background: #fbfaff; }
.problem ul { margin: 10px 0 0; padding-left: 16px; display: grid; gap: 6px; font-size: 9.5pt; line-height: 1.45; color: #3d3955; }
.problemArrow { color: var(--violet); }
.sources { display: flex; flex-wrap: wrap; gap: 8px; }
.sources span { display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px; border-radius: 12px; border: 1px solid var(--line); font-size: 9.5pt; font-weight: 600; }
.sources svg { color: var(--violet); }
.who { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.who > div { padding: 14px; border-radius: 16px; background: linear-gradient(180deg, #fff, #f8f6ff); border: 1px solid var(--line); }
.who b { display: block; margin: 10px 0 4px; font-size: 10.5pt; }
.who p { margin: 0; font-size: 9pt; line-height: 1.5; color: var(--muted); }

/* Features */
.features { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.feature { padding: 16px; border-radius: 16px; border: 1px solid var(--line); background: linear-gradient(180deg, #fff, #faf8ff); }
.feature small { display: block; margin: 12px 0 4px; font-size: 7.5pt; font-weight: 800; letter-spacing: 1.2px; color: #8a6fd8; }
.feature h3 { margin: 0 0 6px; font-size: 11.5pt; line-height: 1.3; }
.feature p { margin: 0; font-size: 9pt; line-height: 1.55; color: var(--muted); }
.panelList { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; }
.panelList > div { display: flex; gap: 8px; padding: 10px 12px; border-radius: 12px; background: #f7f5fc; }
.panelList svg { flex-shrink: 0; color: var(--violet); margin-top: 2px; }
.panelList span { font-size: 9pt; line-height: 1.5; color: var(--muted); }
.panelList b { display: block; color: var(--ink); font-size: 9.5pt; }

/* Analysis */
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.card { padding: 16px; border-radius: 16px; border: 1px solid var(--line); background: #fbfaff; }
.card h3 { margin: 10px 0 0; font-size: 12pt; }
.darkCard { color: #fff; border-color: transparent; background: radial-gradient(90% 70% at 0% 0%, rgba(124,58,237,.5), transparent 60%), #120f24; }
.example { display: grid; grid-template-columns: 1fr auto 1.2fr; align-items: center; gap: 12px; margin-top: 8mm; }
.exIn, .exOut { padding: 14px 16px; border-radius: 16px; }
.exIn { background: #f3f1f8; }
.exIn p { margin: 6px 0 0; font-size: 10pt; line-height: 1.55; font-style: italic; color: #3d3955; }
.exOut { border: 1px solid #ddd3f7; background: #fbfaff; }
.exIn small, .exOut small { display: inline-flex; align-items: center; gap: 4px; font-size: 7.5pt; font-weight: 800; letter-spacing: 1.2px; color: var(--muted); }
.exRow { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px solid #efedf5; font-size: 9pt; }
.exRow:last-child { border-bottom: 0; }
.exRow span { color: var(--muted); }
.exRow b.pos { color: #059669; }
.exArrow { color: var(--violet); }

/* How it works */
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.steps > div { padding: 14px; border-radius: 16px; border: 1px solid var(--line); }
.steps small { display: block; margin-top: 10px; font-size: 8pt; font-weight: 700; color: #a78bfa; }
.steps h3 { margin: 2px 0 6px; font-size: 12pt; }
.steps p { margin: 0; font-size: 9pt; line-height: 1.5; color: var(--muted); }
.integration { display: grid; grid-template-columns: .9fr 1.1fr; gap: 14px; align-items: center; margin-top: 8mm; padding: 16px; border-radius: 18px; background: #f7f5fc; }
.integration h3 { margin: 6px 0 0; font-size: 13pt; }
.code { margin: 0; padding: 14px 16px; border-radius: 14px; background: #0d0b1f; color: #e2def5; font: 8.5pt/1.65 ui-monospace, Menlo, monospace; white-space: pre-wrap; }
.code .k { color: #6ee7b7; font-weight: 700; } .code .d { color: #8f8aa8; } .code .s { color: #c4b5fd; }
.security { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.security > div { padding: 14px; border-radius: 14px; border: 1px solid var(--line); }
.security svg { color: var(--violet); }
.security b { display: block; margin: 8px 0 4px; font-size: 10pt; }
.security p { margin: 0; font-size: 9pt; line-height: 1.5; color: var(--muted); }

/* Solutions */
.cases { display: grid; gap: 10px; }
.case { display: grid; grid-template-columns: auto 1fr; gap: 16px; padding: 18px; border-radius: 18px; border: 1px solid var(--line); background: linear-gradient(120deg, #fff, #f8f5ff); }
.caseNo { font-size: 26pt; font-weight: 800; line-height: 1; color: #ddd3f7; }
.case small { font-size: 7.5pt; font-weight: 800; letter-spacing: 1.2px; color: #8a6fd8; }
.case h3 { margin: 6px 0; font-size: 13pt; }
.case p { margin: 0; font-size: 9.5pt; line-height: 1.55; color: var(--muted); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.chips span { padding: 3px 10px; border-radius: 99px; font-size: 8pt; font-weight: 600; color: #6d28d9; background: #f1ecff; }
.quote { display: flex; gap: 12px; align-items: flex-start; margin-top: 8mm; padding: 18px; border-radius: 18px; color: #fff; background: radial-gradient(90% 140% at 0% 0%, rgba(124,58,237,.45), transparent 60%), #0d0b1f; }
.quote svg { flex-shrink: 0; color: #67e8f9; }
.quote p { margin: 0; font-size: 11pt; line-height: 1.6; }

/* Pricing */
.trial { display: flex; gap: 14px; align-items: center; padding: 14px 16px; border-radius: 16px; border: 1px solid #ddd3f7; background: linear-gradient(120deg, #f6f2ff, #ecfbfd); margin-bottom: 6mm; }
.trial .ico { color: #fff; background: linear-gradient(135deg, #7c3aed, #0891b2); }
.trial b { font-size: 11pt; }
.trialList { display: flex; flex-wrap: wrap; gap: 3px 12px; margin-top: 5px; }
.trialList span { display: inline-flex; align-items: center; gap: 4px; font-size: 8.5pt; color: #4c4766; }
.trialList svg { color: #10b981; }
.plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
.plan { position: relative; padding: 16px 14px; border-radius: 16px; border: 1px solid var(--line); background: #fff; }
.plan.featured { color: #fff; border-color: transparent; background: radial-gradient(90% 70% at 0% 0%, rgba(124,58,237,.55), transparent 60%), radial-gradient(80% 60% at 100% 100%, rgba(34,211,238,.3), transparent 60%), #120f24; }
.popular { position: absolute; top: -9px; left: 14px; display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 99px; font-size: 7.5pt; font-weight: 700; color: #fff; background: linear-gradient(120deg, #7c3aed, #0891b2); }
.plan h3 { margin: 0; font-size: 14pt; }
.tagline { min-height: 34px; margin: 5px 0 10px; font-size: 8.5pt; line-height: 1.45; color: var(--muted); }
.plan.featured .tagline, .plan.featured .price small, .plan.featured .price b span { color: rgba(255,255,255,.65); }
.price { min-height: 48px; margin-bottom: 10px; }
.price b { display: block; font-size: 16pt; font-weight: 800; letter-spacing: -.4px; }
.price b span { font-size: 8.5pt; font-weight: 600; color: var(--muted); letter-spacing: 0; }
.price small { display: block; margin-top: 3px; font-size: 8pt; color: var(--muted); }
.price .from { margin: 0 0 2px; font-size: 7.5pt; font-weight: 800; letter-spacing: .6px; color: #8a6fd8; }
.plan ul { list-style: none; margin: 0; padding: 10px 0 0; border-top: 1px solid var(--line); display: grid; gap: 6px; }
.plan.featured ul { border-color: rgba(255,255,255,.14); }
.plan li { display: flex; gap: 6px; font-size: 8.5pt; line-height: 1.4; }
.plan li svg { flex-shrink: 0; color: var(--violet); margin-top: 1px; }
.plan.featured li svg { color: #67e8f9; }

/* Comparison */
.table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
.table th, .table td { padding: 6px 8px; text-align: center; border-bottom: 1px solid #f0eef5; }
.table thead th { font-size: 9pt; font-weight: 800; background: #faf9fd; }
.table tbody th { text-align: left; font-weight: 550; color: #3d3955; width: 42%; }
.table .hl { background: #f7f4ff; }
.table thead .hl { color: #6d28d9; }
.table .group th { padding-top: 10px; font-size: 7.5pt; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: var(--violet); background: #fff; }
.yes { color: #10b981; } .no { color: #c9c5d6; }

/* FAQ */
.faq { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
.faq > div { padding: 12px 14px; border-radius: 14px; background: #f7f5fc; }
.faq b { display: block; font-size: 9.5pt; margin-bottom: 4px; }
.faq p { margin: 0; font-size: 8.5pt; line-height: 1.5; color: var(--muted); }
.cta { display: flex; align-items: center; gap: 16px; margin-top: auto; padding: 18px 20px; border-radius: 18px; color: #fff; background: radial-gradient(90% 140% at 0% 0%, rgba(124,58,237,.5), transparent 60%), radial-gradient(80% 120% at 100% 100%, rgba(34,211,238,.3), transparent 60%), #0d0b1f; }
.cta h3 { margin: 0 0 4px; font-size: 14pt; }
.cta p { margin: 0; font-size: 9pt; line-height: 1.5; color: rgba(255,255,255,.7); }
.ctaBtn { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; padding: 10px 14px; border-radius: 11px; font-size: 9.5pt; font-weight: 700; background: linear-gradient(120deg, #7c3aed, #0891b2); }

/* Fillers added per page */
.why { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
.why > div { display: flex; gap: 10px; padding: 12px 14px; border-radius: 14px; background: #f7f5fc; }
.why b { font-size: 13pt; font-weight: 800; color: #c4b5fd; line-height: 1; }
.why span { font-size: 9pt; line-height: 1.5; color: var(--muted); }
.why strong { display: block; font-size: 10pt; color: var(--ink); }
.twoWays { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; margin-top: 8mm; padding: 16px; border-radius: 18px; color: #fff; background: radial-gradient(90% 140% at 0% 0%, rgba(124,58,237,.45), transparent 60%), radial-gradient(80% 120% at 100% 100%, rgba(34,211,238,.25), transparent 60%), #0d0b1f; }
.twoWays h3 { margin: 8px 0 4px; font-size: 12pt; }
.twoWays p { margin: 0; font-size: 9pt; line-height: 1.5; color: rgba(255,255,255,.7); }
.eq { font-size: 22pt; font-weight: 800; color: #67e8f9; }
.aiSteps, .start { display: grid; gap: 10px; }
.aiSteps { grid-template-columns: repeat(3, 1fr); }
.start { grid-template-columns: repeat(4, 1fr); margin-bottom: 7mm; }
.aiSteps > div, .start > div { padding: 14px; border-radius: 14px; border: 1px solid var(--line); }
.aiSteps b, .start b { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; font-size: 9pt; color: #fff; background: linear-gradient(135deg, #7c3aed, #0891b2); }
.aiSteps strong, .start strong { display: block; margin: 8px 0 3px; font-size: 10pt; }
.aiSteps p, .start p { margin: 0; font-size: 8.5pt; line-height: 1.5; color: var(--muted); }
.apiData { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.apiData > div { padding: 12px; border-radius: 12px; background: #f7f5fc; }
.apiData b { display: block; font-size: 9.5pt; margin-bottom: 3px; }
.apiData span { font-size: 8.5pt; line-height: 1.45; color: var(--muted); }
.guide { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
.guide > div { padding: 12px 14px; border-radius: 14px; background: #f7f5fc; border-left: 3px solid #8b5cf6; }
.guide b { font-size: 10.5pt; }
.guide p { margin: 4px 0 0; font-size: 8.5pt; line-height: 1.5; color: var(--muted); }
`;
