import type { Metadata } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { loadData } from "@/lib/data/repository";
import { TypeComparison } from "./type-comparison";

const instrument = localFont({
  src: "../../../../assets/fonts/instrument-sans.ttf",
  weight: "400 700",
  display: "swap",
});
const hanken = localFont({
  src: "../../../../assets/fonts/hanken-grotesk.ttf",
  weight: "100 900",
  display: "swap",
});
const plex = localFont({
  src: "../../../../assets/fonts/ibm-plex-sans.ttf",
  weight: "100 700",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Typeface decision",
  robots: { index: false, follow: false },
};

export default async function TypePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <TypeComparison
      data={await loadData()}
      candidates={[
        {
          id: "instrument",
          name: "Instrument Sans",
          fontFamily: instrument.style.fontFamily,
          description: "Crisp, open and quietly distinctive. My recommendation for the product.",
          verification: "OpenType tnum verified · equal digit widths at 400, 500 and 600.",
        },
        {
          id: "hanken",
          name: "Hanken Grotesk",
          fontFamily: hanken.style.fontFamily,
          description:
            "Rounder and more approachable, with a little more warmth in the smaller labels.",
          verification: "Tabular figures by default · equal digit widths at 400, 500 and 600.",
        },
        {
          id: "plex",
          name: "IBM Plex Sans",
          fontFamily: plex.style.fontFamily,
          description:
            "Precise and technical. A stronger operational feel for dense financial records.",
          verification: "Tabular figures by default · equal digit widths at 400, 500 and 600.",
        },
      ]}
    />
  );
}
