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

const TOOLS_SEGMENTS: WheelSegment[] = [
  { id: "compress", label: "Comprimir" },
  { id: "rotate_cw", label: "Girar ↻" },
  { id: "rotate_ccw", label: "Girar ↺" },
  { id: "flip", label: "Espelhar" },
  { id: "strip", label: "Sem EXIF" },
];

const TOOL_ACTION_LABELS: Record<string, string> = {
  compress: "Comprimindo",
  rotate_cw: "Girando",
  rotate_ccw: "Girando",
  flip: "Espelhando",
  strip: "Removendo metadados",
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

function labelFor(domain: Domain, mode: Mode, id: string): string {
  if (mode === "tools") return TOOLS_SEGMENTS.find((s) => s.id === id)?.label ?? id;
  if (domain === "table") return TABLE_FORMAT_LABELS[id] ?? id.toUpperCase();
  return IMAGE_FORMAT_LABELS[id] ?? id.toUpperCase();
}

function StatusBadge({ phase, domain, mode, actionId }: { phase: Phase; domain: Domain; mode: Mode; actionId: string | null }) {
  const label = actionId ? labelFor(domain, mode, actionId) : "";
  const doneLabel =
    mode === "format" ? `Convertido para ${label}` : TOOL_ACTION_LABELS[actionId ?? ""] ?? "Pronto";
  const progressLabel =
    mode === "format" ? `Convertendo para ${label}...` : `${TOOL_ACTION_LABELS[actionId ?? ""] ?? "Processando"}...`;

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
  const [domain, setDomain] = useState<Domain>(null);
  const [mode, setMode] = useState<Mode>("format");
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("picking");
  const [lastAction, setLastAction] = useState<string | null>(null);

  const highlightRef = useRef<string | null>(null);
  const modeRef = useRef<Mode>("format");
  const domainRef = useRef<Domain>(null);
  const imageSegmentsRef = useRef<WheelSegment[]>([]);
  const tableSegmentsRef = useRef<WheelSegment[]>([]);

  function segmentsFor(dom: Domain, md: Mode): WheelSegment[] {
    if (md === "tools") return dom === "image" ? TOOLS_SEGMENTS : [];
    if (dom === "table") return tableSegmentsRef.current;
    if (dom === "image") return imageSegmentsRef.current;
    return [];
  }

  useEffect(() => {
    invoke<string[]>("supported_image_formats").then((fmts) => {
      imageSegmentsRef.current = fmts.map((f) => ({ id: f, label: IMAGE_FORMAT_LABELS[f] ?? f.toUpperCase() }));
    });
    invoke<string[]>("supported_table_formats").then((fmts) => {
      tableSegmentsRef.current = fmts.map((f) => ({ id: f, label: TABLE_FORMAT_LABELS[f] ?? f.toUpperCase() }));
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
          const dom = payload.paths[0] ? classifyDomain(payload.paths[0]) : null;
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
          const path = payload.paths[0];
          const chosen = highlightRef.current;
          handleDrop(path, chosen, modeRef.current, domainRef.current);
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

  async function handleDrop(path: string | undefined, chosenId: string | null, activeMode: Mode, activeDomain: Domain) {
    if (!path || !chosenId || !activeDomain) {
      dismissSoon(0);
      return;
    }

    setLastAction(chosenId);
    setPhase("converting");

    let ok = true;
    try {
      const dir = await invoke<string>("default_output_dir", { inputPath: path });

      if (activeMode === "format" && activeDomain === "table") {
        await invoke<string>("convert_table", { inputPath: path, outputDir: dir, targetFormat: chosenId });
      } else if (activeMode === "format") {
        await invoke<string>("convert_image", { inputPath: path, outputDir: dir, targetFormat: chosenId });
      } else if (chosenId === "compress") {
        await invoke<string>("compress_image", { inputPath: path, outputDir: dir });
      } else if (chosenId === "rotate_cw" || chosenId === "rotate_ccw") {
        await invoke<string>("rotate_image", {
          inputPath: path,
          outputDir: dir,
          clockwise: chosenId === "rotate_cw",
        });
      } else if (chosenId === "flip") {
        await invoke<string>("flip_image", { inputPath: path, outputDir: dir });
      } else if (chosenId === "strip") {
        await invoke<string>("strip_metadata", { inputPath: path, outputDir: dir });
      }
    } catch {
      ok = false;
    }

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
        <StatusBadge phase={phase} domain={domain} mode={mode} actionId={lastAction} />
      ) : (
        activeSegments.length > 0 && (
          <RadialWheel
            segments={activeSegments}
            highlightedId={highlighted}
            centerLabel={highlighted ? labelFor(domain, mode, highlighted) : "solte aqui"}
          />
        )
      )}
    </div>
  );
}

export default WheelApp;
