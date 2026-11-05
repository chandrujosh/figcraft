import JSZip from "jszip";
import { prepareHtml } from "./model";

type ZipEntry = JSZip.JSZipObject;

function normalize(path: string): string {
  const out: string[] = [];
  path.replace(/\\/g, "/").split("/").forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") out.pop();
    else out.push(part);
  });
  return out.join("/");
}

function mime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", ico: "image/x-icon",
    woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
    eot: "application/vnd.ms-fontobject", mp4: "video/mp4", webm: "video/webm",
    mp3: "audio/mpeg", pdf: "application/pdf"
  };
  return map[ext] || "application/octet-stream";
}

function resolveAsset(from: string, ref: string, known: Set<string>): string | null {
  const raw = ref.trim().replace(/^['"]|['"]$/g, "");
  if (!raw || /^(https?:|data:|blob:|\/\/|#|mailto:|tel:|javascript:)/i.test(raw)) return null;
  const clean = raw.split(/[?#]/)[0];
  const relative = clean.startsWith("/")
    ? normalize(clean)
    : normalize(from.split("/").slice(0, -1).concat(clean).join("/"));
  const root = normalize(clean);
  return known.has(relative) ? relative : known.has(root) ? root : null;
}

export async function importWebsiteZip(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((entry): entry is ZipEntry => !entry.dir);
  const htmlEntry = entries.find((entry) => /(?:^|\/)index\.html?$/i.test(entry.name))
    ?? entries.find((entry) => /\.html?$/i.test(entry.name));
  if (!htmlEntry) throw new Error("ZIP contains no HTML entry file");

  const known = new Set(entries.map((entry) => normalize(entry.name)));
  const binary = new Map<string, string>();
  const cssFiles = new Map<string, string>();
  for (const entry of entries) {
    const path = normalize(entry.name);
    if (/\.css$/i.test(path)) {
      cssFiles.set(path, await entry.async("string"));
    } else if (!/\.(html?|m?js|cjs)$/i.test(path)) {
      const encoded = await entry.async("base64");
      binary.set(path, "data:" + mime(path) + ";base64," + encoded);
    }
  }

  const cssCache = new Map<string, string>();
  const cssStack = new Set<string>();
  const inlineCss = (path: string): string => {
    const cached = cssCache.get(path);
    if (cached !== undefined) return cached;
    if (cssStack.has(path)) return "";
    cssStack.add(path);
    let css = cssFiles.get(path) || "";
    css = css.replace(/@import\s+(?:url\()?[\s"']*([^"')\s;]+)["']?\s*\)?\s*;/gi, (whole, ref: string) => {
      const asset = resolveAsset(path, ref, known);
      if (!asset || !/\.css$/i.test(asset)) return whole;
      return inlineCss(asset);
    });
    css = css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (whole, _quote: string, ref: string) => {
      const asset = resolveAsset(path, ref, known);
      if (!asset) return whole;
      const data = binary.get(asset);
      return data ? "url(\"" + data + "\")" : whole;
    });
    cssStack.delete(path);
    cssCache.set(path, css);
    return css;
  };

  const raw = await htmlEntry.async("string");
  const parsed = new DOMParser().parseFromString(raw, "text/html");
  const htmlPath = normalize(htmlEntry.name);

  parsed.querySelectorAll('link[rel~="stylesheet"][href]').forEach((link) => {
    const href = link.getAttribute("href") || "";
    const asset = resolveAsset(htmlPath, href, known);
    if (asset && /\.css$/i.test(asset)) {
      const style = parsed.createElement("style");
      style.textContent = inlineCss(asset);
      link.replaceWith(style);
    } else if (asset && binary.has(asset)) {
      link.setAttribute("href", binary.get(asset)!);
    }
  });

  parsed.querySelectorAll("style").forEach((style) => {
    style.textContent = (style.textContent || "").replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (whole, _quote: string, ref: string) => {
      const asset = resolveAsset(htmlPath, ref, known);
      const data = asset ? binary.get(asset) : undefined;
      return data ? "url(\"" + data + "\")" : whole;
    });
  });

  parsed.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
    const css = el.getAttribute("style") || "";
    el.setAttribute("style", css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (whole, _quote: string, ref: string) => {
      const asset = resolveAsset(htmlPath, ref, known);
      const data = asset ? binary.get(asset) : undefined;
      return data ? "url(\"" + data + "\")" : whole;
    }));
  });

  parsed.querySelectorAll("[src], [poster]").forEach((el) => {
    for (const attr of ["src", "poster"]) {
      const ref = el.getAttribute(attr);
      if (!ref) continue;
      const asset = resolveAsset(htmlPath, ref, known);
      const data = asset ? binary.get(asset) : undefined;
      if (data) el.setAttribute(attr, data);
    }
  });

  parsed.querySelectorAll("[srcset]").forEach((el) => {
    const value = el.getAttribute("srcset") || "";
    const result = value.split(",").map((part) => {
      const bits = part.trim().split(/\s+/);
      const asset = resolveAsset(htmlPath, bits[0] || "", known);
      const data = asset ? binary.get(asset) : undefined;
      if (data) bits[0] = data;
      return bits.join(" ");
    }).join(", ");
    el.setAttribute("srcset", result);
  });

  parsed.querySelectorAll("link[rel~='icon'][href], link[rel='preload'][href]").forEach((link) => {
    const href = link.getAttribute("href") || "";
    const asset = resolveAsset(htmlPath, href, known);
    const data = asset ? binary.get(asset) : undefined;
    if (data) link.setAttribute("href", data);
  });

  return prepareHtml("<!doctype html>\n" + parsed.documentElement.outerHTML);
}
