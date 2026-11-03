import type { SVGProps } from "react";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr/ArrowSquareOut";
import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/ssr/ArrowUp";
import { ArrowDownIcon } from "@phosphor-icons/react/dist/ssr/ArrowDown";
import { ArrowsDownUpIcon } from "@phosphor-icons/react/dist/ssr/ArrowsDownUp";
import { ColumnsIcon } from "@phosphor-icons/react/dist/ssr/Columns";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/ssr/DownloadSimple";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { InfoIcon } from "@phosphor-icons/react/dist/ssr/Info";
import { CheckIcon } from "@phosphor-icons/react/dist/ssr/Check";
import { XIcon } from "@phosphor-icons/react/dist/ssr/X";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { SignOutIcon } from "@phosphor-icons/react/dist/ssr/SignOut";

const icons = {
  chevronRight: CaretRightIcon,
  chevronDown: CaretDownIcon,
  sortAsc: ArrowUpIcon,
  sortDesc: ArrowDownIcon,
  sortNone: ArrowsDownUpIcon,
  external: ArrowSquareOutIcon,
  columns: ColumnsIcon,
  download: DownloadSimpleIcon,
  alert: WarningCircleIcon,
  info: InfoIcon,
  check: CheckIcon,
  close: XIcon,
  search: MagnifyingGlassIcon,
  signOut: SignOutIcon,
} as const;
export type IconName = keyof typeof icons;

/** One swappable set: Phosphor regular, decorative unless explicitly labeled. */
export function Icon({
  name,
  className,
  ...rest
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  const Glyph = icons[name];
  return (
    <Glyph
      aria-hidden
      focusable="false"
      className={className}
      {...rest}
      size={16}
      weight="regular"
    />
  );
}
