// Order matters: Edge and Opera also announce Chrome, and Chrome also announces Safari.
const BROWSERS: [RegExp, string][] = [
  [/Edg(?:A|iOS)?\/(\d+)/, "Edge"],
  [/OPR\/(\d+)/, "Opera"],
  [/(?:Firefox|FxiOS)\/(\d+)/, "Firefox"],
  [/(?:HeadlessChrome|Chrome|CriOS)\/(\d+)/, "Chrome"],
  [/Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari\//, "Safari"],
];

// iOS announces "like Mac OS X" and Android announces Linux, so they are checked first.
const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Windows NT/, "Windows"],
  [/Mac OS X/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

/** Short "Browser version · OS" for session lists, or null if nothing is recognised. */
export function describeUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;

  const parts: string[] = [];
  for (const [pattern, name] of BROWSERS) {
    const match = pattern.exec(userAgent);
    if (match) {
      parts.push(`${name} ${match[1]}`);
      break;
    }
  }
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent));
  if (system) parts.push(system[1]);

  return parts.length > 0 ? parts.join(" · ") : null;
}
