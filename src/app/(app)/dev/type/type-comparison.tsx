import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { loadData } from "@/lib/data/repository";
import { OverviewContent } from "@/components/product/overview-content";
import { contrast, proposal as t } from "./tokens";
import reference from "./soehne-reference.png";
import styles from "./type.module.css";

type Candidate = {
  id: string;
  name: string;
  fontFamily: string;
  description: string;
  verification: string;
};

export function TypeComparison({
  data,
  candidates,
}: {
  data: Awaited<ReturnType<typeof loadData>>;
  candidates: Candidate[];
}) {
  const colors: [string, string][] = [
    ["Strong ink", t.ink],
    ["Secondary ink", t.secondary],
    ["Tertiary ink / cents", t.tertiary],
    ["Positive", t.positive],
    ["Negative", t.negative],
    ["Warning", t.warning],
    ["Near-black", t.green],
    ["Warm ink", t.blue],
  ];
  return (
    <div
      className={styles.lab}
      style={
        Object.fromEntries(Object.entries(t).map(([k, v]) => [`--type-${k}`, v])) as CSSProperties
      }
    >
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Design review / 01</p>
        <h1>Compare three fonts</h1>
        <p>
          Your dashboard appears three times below, once in each font. Compare the headings, dollar
          amounts and table text. This page helps you choose the typography; the full dashboard
          redesign comes after your choice.
        </p>
        <p className={styles.meta}>
          {data.organization.is_demo ? "Demo, fictional data" : data.organization.name} ·
          Development only · Open-source candidates: $0 license cost
        </p>
        <nav aria-label="Typeface candidates" className={styles.jump}>
          {candidates.map((c) => (
            <a href={`#${c.id}`} key={c.id}>
              {c.name}
            </a>
          ))}
          <a href="#licensed">Söhne reference</a>
          <Link href="/">Back to Overview</Link>
        </nav>
      </header>

      <p className={styles.meta}>
        Current theme: Instrument Sans, near-black actions, warm neutral surfaces. Color is reserved
        for financial meaning and warnings.
      </p>

      {candidates.map((c, index) => (
        <section
          key={c.id}
          id={c.id}
          aria-labelledby={`${c.id}-title`}
          className={styles.candidate}
          style={{ fontFamily: c.fontFamily }}
          data-type-candidate={c.id}
        >
          <header className={styles.candidateHeader}>
            <div>
              <p className={styles.eyebrow}>0{index + 1} / Open-source</p>
              <h2 id={`${c.id}-title`}>{c.name}</h2>
              <p>{c.description}</p>
            </div>
            <p className={styles.verified}>
              {c.verification}
              <br />
              <span>Self-hosted via next/font/local. No runtime Google requests.</span>
            </p>
          </header>
          <div className={styles.figures} aria-label={`${c.name} numeral specimen`}>
            <div>
              <p>Numeral specimen · type only</p>
              <span className={styles.bigNumber}>0123456789</span>
            </div>
            <div>
              <p>Letters & identifiers · type only</p>
              <span className={styles.letters}>Ag Rr 1Il 0O</span>
              <span>Regular 400 / Medium 500 / Semibold 600</span>
            </div>
          </div>
          <div className={styles.preview}>
            <p className={styles.previewNote}>
              Same dashboard, different font ·{" "}
              {data.organization.is_demo ? "Demo, fictional data" : data.organization.name} ·
              Preview links open the existing screens.
            </p>
            <OverviewContent data={data} />
          </div>
        </section>
      ))}

      <details className={styles.tokenDetails}>
        <summary>Color values, spacing and accessibility checks</summary>
        <section aria-labelledby="tokens-title" className={styles.tokens}>
          <h2 id="tokens-title">Proposed foundation</h2>
          <div className={styles.foundation}>
            <p>
              <strong>Surfaces</strong>
              <br />
              Warm white {t.canvas}; white {t.surface}. Hairline dividers {t.divider}; no panel
              shadows.
            </p>
            <p>
              <strong>Shape & rhythm</strong>
              <br />
              6px controls, 8px separate objects. 32 / 36px buttons. 4px spacing grid; 24 / 32px
              section gaps.
            </p>
            <p>
              <strong>Typography</strong>
              <br />
              14 / 20 body, 12 / 16 labels, 24 / 32 page titles, 40 / 44 headline money. Weights 400
              / 500 / 600.
            </p>
            <p>
              <strong>Focus & elevation</strong>
              <br />
              2px accent focus ring, 2px offset. Control border {t.control} (
              {contrast(t.control, t.canvas).toFixed(2)}:1). Menu only: 0 4px 16px at 8% ink.
            </p>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.tokenTable} aria-label="Proposed color contrast">
              <caption>
                Text contrast against warm white. Every text token also passes AA on white, subtle
                fill and hover surfaces.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Token</th>
                  <th scope="col">Value</th>
                  <th scope="col">Contrast</th>
                  <th scope="col">Check</th>
                </tr>
              </thead>
              <tbody>
                {colors.map(([label, value]) => (
                  <tr key={label}>
                    <th scope="row">
                      <span className={styles.swatch} style={{ background: value }} />
                      {label}
                    </th>
                    <td>
                      <code>{value}</code>
                    </td>
                    <td>{contrast(value, t.canvas).toFixed(2)}:1</td>
                    <td>AA</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.meta}>
            White on primary: near-black {contrast(t.surface, t.green).toFixed(2)}:1; warm ink{" "}
            {contrast(t.surface, t.blue).toFixed(2)}:1. Hairlines separate content; darker control
            borders identify inputs.
          </p>
        </section>
      </details>

      <section id="licensed" aria-labelledby="licensed-title" className={styles.licensed}>
        <p className={styles.eyebrow}>04 / Licensed reference</p>
        <h2 id="licensed-title">Söhne · Klim Type Foundry</h2>
        <p>
          From $60 USD for the first style, per Klim’s FAQ. This is a base price, not a quote for
          the full family or this app’s web usage. Confirm the web license and usage tier in Klim’s
          checkout before buying.
        </p>
        <p>
          Klim documents tabular numerals (tnum). Static foundry screenshot only; no Söhne font
          files are included or loaded by this app.
        </p>
        <figure>
          <Image
            src={reference}
            alt="Static screenshot of Klim Type Foundry’s Söhne specimen, showing its letterforms"
            sizes="(max-width: 1280px) 90vw, 1100px"
          />
          <figcaption>
            Official foundry specimen · captured November 2, 2026.{" "}
            <a href="https://klim.co.nz/fonts/soehne/">Specimen & features</a> ·{" "}
            <a href="https://klim.co.nz/faqs/">License pricing FAQ</a> ·{" "}
            <a href="https://klim.co.nz/buy/soehne/">Web license quote</a>
          </figcaption>
        </figure>
      </section>
      <footer className={styles.footer}>
        Selected direction: Instrument Sans and near-black. This page remains a development-only
        reference for the alternatives.
      </footer>
    </div>
  );
}
