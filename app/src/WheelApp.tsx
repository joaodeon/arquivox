import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { RadialWheel, hitTestSegment, type WheelSegment } from "./RadialWheel";

const IMAGE_FORMAT_LABELS: Record<string, string> = {
  jpg: "JPG",
  png: "PNG",
  webp: "WebP",
  tiff: "TIFF",
  avif: "AVIF",
  bmp: "BMP",
  pdf: "PDF",
};

const TABLE_FORMAT_LABELS: Record<string, string> = {
  csv: "CSV",
  xlsx: "XLSX",
};

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "tiff", "tif", "avif", "bmp", "svg"];
const TABLE_EXTS = ["csv", "tsv", "txt", "xlsx", "xls", "xlsb", "ods"];

// Menu do Ctrl: uma única opção, para um ou vários arquivos de qualquer
// tipo.
const ARCHIVE_SEGMENTS: WheelSegment[] = [{ id: "zip_archive", label: "ZIP" }];

const ARCHIVE_ACTION_LABELS: Record<string, string> = {
  zip_archive: "Compactando (ZIP)",
};
const ARCHIVE_DONE_LABELS: Record<string, string> = {
  zip_archive: "Compactado (ZIP)",
};

type Phase = "picking" | "converting" | "done" | "error";
type Mode = "format" | "tools";
type Domain = "image" | "table" | null;

function classifyDomain(path: string): Domain {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (TABLE_EXTS.includes(ext)) return "table";
  return null;
}

function labelFor(mode: Mode, domain: Domain, id: string): string {
  if (mode === "tools") return ARCHIVE_SEGMENTS.find((s) => s.id === id)?.label ?? id;
  if (domain === "table") return TABLE_FORMAT_LABELS[id] ?? id.toUpperCase();
  return IMAGE_FORMAT_LABELS[id] ?? id.toUpperCase();
}

function StatusBadge({
  phase,
  mode,
  domain,
  actionId,
  resultCount,
}: {
  phase: Phase;
  mode: Mode;
  domain: Domain;
  actionId: string | null;
  resultCount: number;
}) {
  const label = actionId ? labelFor(mode, domain, actionId) : "";
  const countSuffix = resultCount > 1 ? ` (${resultCount} arquivos)` : "";
  const doneLabel =
    mode === "format"
      ? `Convertido para ${label}`
      : `${ARCHIVE_DONE_LABELS[actionId ?? ""] ?? "Pronto"}${countSuffix}`;
  const progressLabel =
    mode === "format"
      ? `Convertendo para ${label}...`
      : `${ARCHIVE_ACTION_LABELS[actionId ?? ""] ?? "Processando"}...`;

  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-full bg-white"
      style={{ width: 220, height: 220, boxShadow: "0 12px 32px rgba(0,0,0,0.16)" }}
    >
      {phase === "converting" && (
        <>
          <div className="spinner" />
          <span className="text-sm font-semibold text-neutral-700 text-center px-4">{progressLabel}</span>
        </>
      )}
      {phase === "done" && (
        <>
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-accent">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M4 12.5L9.5 18L20 6" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-neutral-800 text-center px-4">{doneLabel}</span>
        </>
      )}
      {phase === "error" && (
        <>
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-neutral-700">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M6 6L18 18M18 6L6 18" stroke="white" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-neutral-800">Erro</span>
        </>
      )}
    </div>
  );
}

function WheelApp() {
  const [mode, setMode] = useState<Mode>("format");
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("picking");
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [domain, setDomain] = useState<Domain>(null);
  const [resultCount, setResultCount] = useState(0);
  const [, forceRender] = useState(0);

  const highlightRef = useRef<string | null>(null);
  const modeRef = useRef<Mode>("format");
  const domainRef = useRef<Domain>(null);
  const pathsRef = useRef<string[]>([]);
  const imageSegmentsRef = useRef<WheelSegment[]>([]);
  const tableSegmentsRef = useRef<WheelSegment[]>([]);

  function segmentsFor(dom: Domain, md: Mode): WheelSegment[] {
    if (md === "tools") return ARCHIVE_SEGMENTS;
    if (dom === "table") return tableSegmentsRef.current;
    if (dom === "image") return imageSegmentsRef.current;
    return [];
  }

  useEffect(() => {
    invoke<string[]>("supported_image_formats").then((fmts) => {
      imageSegmentsRef.current = fmts.map((f) => ({ id: f, label: IMAGE_FORMAT_LABELS[f] ?? f.toUpperCase() }));
      forceRender((n) => n + 1);
    });
    invoke<string[]>("supported_table_formats").then((fmts) => {
      tableSegmentsRef.current = fmts.map((f) => ({ id: f, label: TABLE_FORMAT_LABELS[f] ?? f.toUpperCase() }));
      forceRender((n) => n + 1);
    });

    const scale = window.devicePixelRatio || 1;
    let unlistenDrag: (() => void) | undefined;
    let unlistenMode: (() => void) | undefined;

    listen<Mode>("wheel-mode", (event) => {
      modeRef.current = event.payload;
      setMode(event.payload);
    }).then((fn) => {
      unlistenMode = fn;
    });

    getCurrentWindow()
      .onDragDropEvent((event) => {
        const payload = event.payload;

        if (payload.type === "enter") {
          const paths = payload.paths ?? [];
          pathsRef.current = paths;
          const dom = paths[0] ? classifyDomain(paths[0]) : null;
          domainRef.current = dom;
          setDomain(dom);
        }

        if (payload.type === "enter" || payload.type === "over") {
          const activeSegments = segmentsFor(domainRef.current, modeRef.current);
          const cx = window.innerWidth / 2;
          const cy = window.innerHeight / 2;
          const dx = payload.position.x / scale - cx;
          const dy = payload.position.y / scale - cy;
          const hit = hitTestSegment(dx, dy, activeSegments);
          highlightRef.current = hit;
          setHighlighted(hit);
          setPhase("picking");
        } else if (payload.type === "leave") {
          highlightRef.current = null;
          setHighlighted(null);
        } else if (payload.type === "drop") {
          const paths = payload.paths ?? pathsRef.current;
          const chosen = highlightRef.current;
          handleDrop(paths, chosen, modeRef.current, domainRef.current);
        }
      })
      .then((fn) => {
        unlistenDrag = fn;
      });

    return () => {
      unlistenDrag?.();
      unlistenMode?.();
    };
  }, []);

  async function handleDrop(paths: string[], chosenId: string | null, activeMode: Mode, activeDomain: Domain) {
    const firstPath = paths[0];
    if (!firstPath || !chosenId) {
      dismissSoon(0);
      return;
    }

    setLastAction(chosenId);
    setPhase("converting");
    setResultCount(0);

    let ok = true;
    let count = 1;
    try {
      const dir = await invoke<string>("default_output_dir", { inputPath: firstPath });

      if (activeMode === "tools" && chosenId === "zip_archive") {
        const outputs = await invoke<string[]>("zip_files", { inputPaths: paths, outputDir: dir });
        count = outputs.length;
      } else if (activeMode === "format" && activeDomain === "table") {
        await invoke<string>("convert_table", { inputPath: firstPath, outputDir: dir, targetFormat: chosenId });
      } else if (activeMode === "format") {
        await invoke<string>("convert_image", { inputPath: firstPath, outputDir: dir, targetFormat: chosenId });
      }
    } catch {
      ok = false;
    }

    setResultCount(count);
    setPhase(ok ? "done" : "error");
    dismissSoon(ok ? 1100 : 1600);
  }

  function dismissSoon(delayMs: number) {
    window.setTimeout(() => {
      invoke("wheel_dismiss");
      setHighlighted(null);
      highlightRef.current = null;
      setPhase("picking");
      setLastAction(null);
      setResultCount(0);
      pathsRef.current = [];
      domainRef.current = null;
      setDomain(null);
      modeRef.current = "format";
      setMode("format");
    }, delayMs);
  }

  const activeSegments = segmentsFor(domain, mode);

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-transparent select-none">
      {phase !== "picking" ? (
        <StatusBadge phase={phase} mode={mode} domain={domain} actionId={lastAction} resultCount={resultCount} />
      ) : (
        activeSegments.length > 0 && (
          <RadialWheel
            segments={activeSegments}
            highlightedId={highlighted}
            centerLabel={highlighted ? labelFor(mode, domain, highlighted) : "solte aqui"}
          />
        )
      )}
    </div>
  );
}

export default WheelApp;
