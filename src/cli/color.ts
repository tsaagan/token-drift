type Paint = (text: string) => string;

export interface Palette {
  bold: Paint;
  dim: Paint;
  red: Paint;
  green: Paint;
  yellow: Paint;
}

/** Colour only for a real terminal, unless NO_COLOR or FORCE_COLOR says otherwise. */
export function shouldUseColor(
  env: Record<string, string | undefined>,
  isTTY: boolean | undefined
): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== "0";
  return isTTY === true;
}

export function palette(enabled: boolean): Palette {
  const paint =
    (code: string): Paint =>
    (text) =>
      enabled ? `\x1b[${code}m${text}\x1b[0m` : text;

  return {
    bold: paint("1"),
    dim: paint("2"),
    red: paint("31"),
    green: paint("32"),
    yellow: paint("33"),
  };
}
