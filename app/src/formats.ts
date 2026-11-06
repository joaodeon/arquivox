// Fonte única de verdade sobre formatos/domínios de arquivo, compartilhada
// entre a janela principal (App.tsx) e a roda global (WheelApp.tsx). Os
// dois tinham listas duplicadas antes, e a de App.tsx ficou desatualizada
// quando a conversão de planilhas/documentos foi adicionada só na roda
// global — daí o bug de "conversão de planilha não funciona" quando
// usado pela janela do app.

export type Domain = "image" | "table" | "document" | null;

export const IMAGE_FORMAT_LABELS: Record<string, string> = {
  jpg: "JPG",
  png: "PNG",
  webp: "WebP",
  tiff: "TIFF",
  avif: "AVIF",
  bmp: "BMP",
  pdf: "PDF",
};

export const TABLE_FORMAT_LABELS: Record<string, string> = {
  csv: "CSV",
  xlsx: "XLSX",
};

export const DOCUMENT_FORMAT_LABELS: Record<string, string> = {
  docx: "DOCX",
  doc: "DOC",
  odt: "ODT",
  rtf: "RTF",
  txt: "TXT",
  pdf: "PDF",
  md: "MD",
};

export const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "tiff", "tif", "avif", "bmp", "svg"];
export const TABLE_EXTS = ["csv", "tsv", "txt", "xlsx", "xls", "xlsb", "ods"];
// "txt" também aparece em TABLE_EXTS (planilha delimitada por vírgula/tab
// pode usar essa extensão) — como arquivo de texto solto é muito mais
// comum, document ganha a prioridade no classifyDomain abaixo.
export const DOCUMENT_EXTS = ["docx", "doc", "odt", "rtf", "txt", "pdf", "md"];

export const ALL_PICKER_EXTS = Array.from(
  new Set([...IMAGE_EXTS, ...TABLE_EXTS, ...DOCUMENT_EXTS]),
);

export function classifyDomain(path: string): Domain {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (DOCUMENT_EXTS.includes(ext)) return "document";
  if (TABLE_EXTS.includes(ext)) return "table";
  return null;
}

export function labelForFormat(domain: Domain, id: string): string {
  if (domain === "document") return DOCUMENT_FORMAT_LABELS[id] ?? id.toUpperCase();
  if (domain === "table") return TABLE_FORMAT_LABELS[id] ?? id.toUpperCase();
  return IMAGE_FORMAT_LABELS[id] ?? id.toUpperCase();
}
