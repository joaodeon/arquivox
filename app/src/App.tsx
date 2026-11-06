import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { RadialWheel, hitTestSegment, type WheelSegment } from "./RadialWheel";
import { ALL_PICKER_EXTS, classifyDomain, labelForFormat, type Domain } from "./formats";
import "./App.css";

type Status = "idle" | "converting" | "done" | "error";

function App() {
  const [, forceRender] = useState(0);
  const [domain, setDomain] = useState<Domain>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");

  const [wheelVisible, setWheelVisible] = useState(false);
  const [wheelAnchor, setWheelAnchor] = useState({ x: 0, y: 0 });
  const [wheelHighlight, setWheelHighlight] = useState<string | null>(null);

  const unlistenRef = useRef<(() => void) | undefined>(undefined);
  const anchorRef = useRef<{ x: number; y: number } | null>(null);
  const highlightRef = useRef<string | null>(null);
  const domainRef = useRef<Domain>(null);
  const imageFormatsRef = useRef<string[]>([]);
  const tableFormatsRef = useRef<string[]>([]);
  const documentFormatsRef = useRef<string[]>([]);

  function formatsFor(dom: Domain): string[] {
    if (dom === "table") return tableFormatsRef.current;
    if (dom === "document") return documentFormatsRef.current;
    if (dom === "image") return imageFormatsRef.current;
    return [];
  }

  function segmentsFor(dom: Domain): WheelSegment[] {
    return formatsFor(dom).map((f) => ({ id: f, label: labelForFormat(dom, f) }));
  }

  useEffect(() => {
    invoke<string[]>("supported_image_formats").then((f) => {
      imageFormatsRef.current = f;
      forceRender((n) => n + 1);
    });
    invoke<string[]>("supported_table_formats").then((f) => {
      tableFormatsRef.current = f;
      forceRender((n) => n + 1);
    });
    invoke<string[]>("supported_document_formats").then((f) => {
      documentFormatsRef.current = f;
      forceRender((n) => n + 1);
    });

    const scale = window.devicePixelRatio || 1;

    getCurrentWindow()
      .onDragDropEvent((event) => {
        const payload = event.payload;

        if (payload.type === "enter") {
          const pos = { x: payload.position.x / scale, y: payload.position.y / scale };
          anchorRef.current = pos;
          setWheelAnchor(pos);
          setWheelVisible(true);
          setWheelHighlight(null);
          highlightRef.current = null;

          const dom = payload.paths[0] ? classifyDomain(payload.paths[0]) : null;
          domainRef.current = dom;
          setDomain(dom);
        } else if (payload.type === "over") {
          if (anchorRef.current) {
            const dx = payload.position.x / scale - anchorRef.current.x;
            const dy = payload.position.y / scale - anchorRef.current.y;
            const segments = segmentsFor(domainRef.current);
            const hit = hitTestSegment(dx, dy, segments);
            highlightRef.current = hit;
            setWheelHighlight(hit);
          }
        } else if (payload.type === "leave") {
          setWheelVisible(false);
          setWheelHighlight(null);
          highlightRef.current = null;
          anchorRef.current = null;
        } else if (payload.type === "drop") {
          setWheelVisible(false);
          const path = payload.paths[0];
          const chosenFormat = highlightRef.current;
          setWheelHighlight(null);
          highlightRef.current = null;
          anchorRef.current = null;

          if (!path) return;

          handleNewFile(path).then((dir) => {
            if (chosenFormat && dir) {
              runConversion(path, dir, chosenFormat, domainRef.current);
            }
          });
        }
      })
      .then((unlisten) => {
        unlistenRef.current = unlisten;
      });

    return () => {
      unlistenRef.current?.();
    };
  }, []);

  async function handleNewFile(path: string): Promise<string | null> {
    const dom = classifyDomain(path);
    domainRef.current = dom;
    setDomain(dom);
    setFilePath(path);
    setTarget(null);
    setStatus("idle");
    setMessage("");
    const dir = await invoke<string>("default_output_dir", { inputPath: path });
    setOutputDir(dir);
    return dir;
  }

  async function runConversion(inputPath: string, dir: string, targetFormat: string, activeDomain: Domain) {
    setStatus("converting");
    setMessage("");
    try {
      const command =
        activeDomain === "table"
          ? "convert_table"
          : activeDomain === "document"
            ? "convert_document"
            : "convert_image";
      const resultPath = await invoke<string>(command, {
        inputPath,
        outputDir: dir,
        targetFormat,
      });
      setStatus("done");
      setMessage(resultPath);
      setTarget(targetFormat);
    } catch (err) {
      setStatus("error");
      setMessage(String(err));
    }
  }

  async function handlePickFile() {
    const selected = await openDialog({
      multiple: false,
      filters: [
        {
          name: "Arquivos suportados",
          extensions: ALL_PICKER_EXTS,
        },
      ],
    });
    if (typeof selected === "string") {
      handleNewFile(selected);
    }
  }

  async function handlePickOutputDir() {
    const selected = await openDialog({ directory: true });
    if (typeof selected === "string") {
      setOutputDir(selected);
    }
  }

  async function handleConvert() {
    if (!filePath || !outputDir || !target) return;
    runConversion(filePath, outputDir, target, domain);
  }

  const fileName = filePath ? filePath.split(/[\\/]/).pop() : null;
  const formats = domain ? formatsFor(domain) : [];
  const segments = domain ? segmentsFor(domain) : [];
  const highlightedLabel = wheelHighlight ? labelForFormat(domain, wheelHighlight) : "solte aqui";

  return (
    <main className="h-full flex flex-col items-center justify-center gap-6 px-8 py-10 select-none relative">
      <h1 className="text-xl font-medium tracking-tight text-neutral-800">arquivoX</h1>

      <div className="w-full max-w-sm rounded-2xl border-2 border-dashed border-neutral-200 bg-white hover:border-neutral-300 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2 py-12 px-6 text-center"
        onClick={handlePickFile}
      >
        {fileName ? (
          <>
            <span className="text-sm font-medium text-neutral-800 break-all">{fileName}</span>
            <span className="text-xs text-neutral-400">clique para trocar o arquivo</span>
          </>
        ) : (
          <>
            <span className="text-sm text-neutral-500">
              Arraste um arquivo para a janela ou clique para escolher
            </span>
            <span className="text-xs text-neutral-400">
              Imagens · Planilhas · Documentos de texto
            </span>
          </>
        )}
      </div>

      {filePath && formats.length > 0 && (
        <div className="w-full max-w-sm flex flex-col gap-3">
          <label className="text-xs uppercase tracking-wide text-neutral-400">
            Converter para
          </label>
          <div className="grid grid-cols-4 gap-2">
            {formats.map((f) => (
              <button
                key={f}
                onClick={() => setTarget(f)}
                className={`rounded-xl py-2 text-sm font-medium transition-colors
                  ${target === f
                    ? "bg-accent text-white"
                    : "bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-300"}`}
              >
                {labelForFormat(domain, f)}
              </button>
            ))}
          </div>
        </div>
      )}

      {filePath && !domain && (
        <p className="text-xs text-neutral-400 max-w-sm text-center">
          Tipo de arquivo não reconhecido para conversão.
        </p>
      )}

      <div className="w-full max-w-sm flex items-center justify-between text-xs text-neutral-400">
        <span className="truncate">{outputDir ?? "pasta de destino não escolhida"}</span>
        <button onClick={handlePickOutputDir} className="text-accent hover:underline shrink-0 ml-2">
          trocar pasta
        </button>
      </div>

      <button
        onClick={handleConvert}
        disabled={!filePath || !outputDir || !target || status === "converting"}
        className="w-full max-w-sm rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-40
          disabled:cursor-not-allowed text-white font-medium py-3 transition-colors
          flex items-center justify-center gap-2"
      >
        {status === "converting" && (
          <span
            className="inline-block w-4 h-4 rounded-full border-2 border-white/40 border-t-white"
            style={{ animation: "spin 0.7s linear infinite" }}
          />
        )}
        {status === "converting" ? "Convertendo..." : "Converter"}
      </button>

      {status === "done" && (
        <div className="w-full max-w-sm rounded-xl bg-accent/10 border border-accent/30 px-4 py-3 flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-accent shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M4 12.5L9.5 18L20 6" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-xs text-neutral-700 break-all">Convertido: {message}</p>
        </div>
      )}
      {status === "error" && (
        <div className="w-full max-w-sm rounded-xl bg-neutral-100 border border-neutral-300 px-4 py-3 flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-neutral-700 shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M6 6L18 18M18 6L6 18" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-xs text-neutral-700 break-all">{message}</p>
        </div>
      )}

      {wheelVisible && segments.length > 0 && (
        <div
          className="fixed pointer-events-none z-50"
          style={{ left: wheelAnchor.x, top: wheelAnchor.y, transform: "translate(-50%, -50%)" }}
        >
          <RadialWheel segments={segments} highlightedId={wheelHighlight} centerLabel={highlightedLabel} />
        </div>
      )}
    </main>
  );
}

export default App;
