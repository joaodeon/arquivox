import sharp from "sharp";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as Fi from "react-icons/fi";
import { arc as d3arc } from "d3-shape";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

// Gera apresentacao-arquivoX.pptx na raiz do projeto: `npm install && npm run build`.
const require = createRequire(import.meta.url);
const pptxgen = require("pptxgenjs");
const { applyTheme } = require("./apply_theme.js");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "apresentacao-arquivoX.pptx");
const APP_ICON = path.join(ROOT, "app", "src-tauri", "icons", "source-1024.png");

// ---------------------------------------------------------------- tema
const THEME = {
  name: "arquivoX",
  headFontFace: "Calibri",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1B1030", // texto principal
    lt1: "FFFFFF", // fundo claro
    dk2: "5B4A73", // texto secundário
    lt2: "F4EEFA", // cartões claros (lavanda)
    accent1: "9400D3", // roxo da marca
    accent2: "14092A", // fundo escuro
    accent3: "C77DFF", // roxo claro (destaque em fundo escuro)
    accent4: "E9D5FF", // lavanda forte (chips, círculos)
    accent5: "48484F", // cinza dos rótulos da roda
    accent6: "ECECEF", // cinza das fatias da roda
    hlink: "9400D3",
    folHlink: "6A00A8",
  },
};

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.lang = "pt-BR";
pres.title = "arquivoX — apresentação de lançamento";
pres.subject = "Conversor e compactador de arquivos por gesto, 100% local";
pres.author = "TRE-RN";
const C = pres.SchemeColor;

const SW = 13.333;
const M = 0.6;
const CW = SW - 2 * M; // largura útil

// ---------------------------------------------------------------- helpers
const shadow = (o = {}) => ({ type: "outer", blur: 8, offset: 2, angle: 90, color: "14092A", opacity: 0.14, ...o });

const iconCache = new Map();
async function icon(name, hex) {
  const key = name + hex;
  if (iconCache.has(key)) return iconCache.get(key);
  const Comp = Fi[name];
  if (!Comp) throw new Error("ícone inexistente: " + name);
  let svg = renderToStaticMarkup(React.createElement(Comp, { size: 512, strokeWidth: 2 }));
  svg = svg.replace(/currentColor/g, "#" + hex);
  const png = await sharp(Buffer.from(svg)).resize(512, 512).png().toBuffer();
  const data = "image/png;base64," + png.toString("base64");
  iconCache.set(key, data);
  return data;
}

function iconCircle(slide, { x, y, d = 0.64, fill, data, name }) {
  slide.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill }, objectName: "círculo " + name });
  const s = d * 0.5;
  slide.addImage({ data, x: x + (d - s) / 2, y: y + (d - s) / 2, w: s, h: s, objectName: "ícone " + name });
}

function numCircle(slide, { x, y, d = 0.6, n }) {
  slide.addText(String(n), {
    x, y, w: d, h: d, shape: pres.ShapeType.ellipse, fill: { color: C.accent1 },
    color: C.background1, fontSize: 18, bold: true, align: "center", valign: "middle", margin: 0,
    isTextBox: true, objectName: "passo " + n,
  });
}

function keycap(slide, { x, y, w = 1.1, h = 0.6, label, fontSize = 18 }) {
  slide.addText(label, {
    x, y, w, h, shape: pres.ShapeType.roundRect, rectRadius: 0.1,
    fill: { color: C.background1 }, line: { color: C.accent4, width: 1.5 }, shadow: shadow(),
    color: C.accent1, fontSize, bold: true, align: "center", valign: "middle", margin: 0,
    isTextBox: true, objectName: "tecla " + label,
  });
}

function card(slide, { x, y, w, h, fill = C.background2, name, line, withShadow = false }) {
  const o = { x, y, w, h, shape: pres.ShapeType.roundRect, rectRadius: 0.14, fill, objectName: "cartão " + name };
  if (line) o.line = line;
  if (withShadow) o.shadow = shadow();
  slide.addShape(pres.ShapeType.roundRect, o);
}

function chips(slide, { x, y, maxW, items, fill, color, fontSize = 12 }) {
  const h = 0.34, gap = 0.08;
  let cx = x, cy = y;
  for (const it of items) {
    const w = 0.3 + it.length * 0.1 * (fontSize / 12);
    if (cx + w > x + maxW + 0.001) { cx = x; cy += h + gap; }
    slide.addText(it, {
      x: cx, y: cy, w, h, shape: pres.ShapeType.roundRect, rectRadius: 0.08, fill: { color: fill },
      color, fontSize, bold: true, align: "center", valign: "middle", margin: 0, isTextBox: true,
      objectName: "formato " + it,
    });
    cx += w + gap;
  }
  return cy + h;
}

// linha "ícone em círculo + título + descrição"
function iconRow(slide, { x, y, w, data, name, circleFill, title, desc, titleColor, descColor, d = 0.64, titleSize = 17, descSize = 14 }) {
  iconCircle(slide, { x, y: y + 0.02, d, fill: circleFill, data, name });
  const tx = x + d + 0.25;
  slide.addText(title, { x: tx, y, w: w - d - 0.25, h: 0.4, fontSize: titleSize, bold: true, color: titleColor, margin: 0, valign: "top", isTextBox: true, objectName: "título " + name });
  slide.addText(desc, { x: tx, y: y + 0.42, w: w - d - 0.25, h: 0.75, fontSize: descSize, color: descColor, margin: 0, valign: "top", isTextBox: true, objectName: "descrição " + name });
}

// roda radial com a mesma geometria de RadialWheel.tsx (sem texto; os
// rótulos entram como caixas de texto do PowerPoint, em fonte real)
async function renderWheel({ labels, highlight }) {
  const INNER = 34, OUTER = 100, CORNER = 14, PAD = 0.045, VB = 130;
  const n = labels.length;
  const per = (2 * Math.PI) / n;
  const gen = d3arc().innerRadius(INNER).outerRadius(OUTER).cornerRadius(CORNER).padAngle(n === 1 ? 0 : PAD);
  const paths = [];
  const centroids = [];
  labels.forEach((label, i) => {
    const d = { startAngle: i * per, endAngle: (i + 1) * per, innerRadius: INNER, outerRadius: OUTER };
    const hi = label === highlight;
    paths.push(`<path d="${gen(d)}" fill="${hi ? "#9400D3" : "#ececef"}"/>`);
    const [cx, cy] = gen.centroid(d);
    centroids.push({ label, cx, cy, hi });
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-VB} ${-VB} ${2 * VB} ${2 * VB}" width="1300" height="1300">
<defs><filter id="s" x="-30%" y="-30%" width="160%" height="170%">
<feGaussianBlur in="SourceAlpha" stdDeviation="7"/><feOffset dx="0" dy="7" result="b"/>
<feComponentTransfer><feFuncA type="linear" slope="0.16"/></feComponentTransfer>
<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<g filter="url(#s)">${paths.join("")}<circle r="${INNER - 4}" fill="#ffffff"/></g></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return { data: "image/png;base64," + png.toString("base64"), centroids, VB };
}

function placeWheel(slide, wheel, { x, y, w, centerLabel, name }) {
  slide.addImage({ data: wheel.data, x, y, w, h: w, objectName: "roda radial " + name });
  const unit = w / (2 * wheel.VB); // polegadas por unidade do viewBox
  const labelPt = Math.round(12 * unit * 72);
  const centerPt = Math.round(11 * unit * 72);
  const bw = 1.1, bh = 0.36;
  for (const c of wheel.centroids) {
    const px = x + (c.cx + wheel.VB) * unit;
    const py = y + (c.cy + wheel.VB) * unit;
    slide.addText(c.label, {
      x: px - bw / 2, y: py - bh / 2, w: bw, h: bh, fontSize: labelPt, bold: true,
      color: c.hi ? C.background1 : C.accent5, align: "center", valign: "middle", margin: 0,
      isTextBox: true, objectName: "fatia " + c.label,
    });
  }
  const cx = x + w / 2, cy = y + w / 2;
  slide.addText(centerLabel, {
    x: cx - 0.5, y: cy - 0.2, w: 1.0, h: 0.4, fontSize: centerPt, bold: true, color: C.text1,
    align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: "centro da roda " + name,
  });
}

// ---------------------------------------------------------------- layouts
const FOOT_Y = 7.0;
function footerObjects(color) {
  return [{ text: { text: "arquivoX · TRE-RN", options: { x: M, y: FOOT_Y, w: 4, h: 0.3, fontSize: 10, color, margin: 0, valign: "middle" } } }];
}
const slideNumber = (color) => ({ x: SW - M - 0.8, y: FOOT_Y, w: 0.8, h: 0.3, fontSize: 10, color, align: "right" });
const titlePlaceholder = (color) => ({
  placeholder: {
    options: { name: "title", type: "title", x: M, y: 0.45, w: CW, h: 0.9, fontSize: 36, bold: true, color, margin: 0, valign: "middle", align: "left" },
    text: "",
  },
});

pres.defineSlideMaster({ title: "COVER", background: { color: C.accent2 }, objects: [] });
pres.defineSlideMaster({
  title: "CONTENT", background: { color: C.background1 },
  objects: [titlePlaceholder(C.text1), ...footerObjects(C.text2)], slideNumber: slideNumber(C.text2),
});
pres.defineSlideMaster({
  title: "CONTENT_DARK", background: { color: C.accent2 },
  objects: [titlePlaceholder(C.background1), ...footerObjects(C.accent3)], slideNumber: slideNumber(C.accent3),
});

// ---------------------------------------------------------------- recursos
const WHITE = "FFFFFF", PURPLE = "9400D3";
const ic = {
  mouse: await icon("FiMousePointer", WHITE),
  target: await icon("FiCrosshair", WHITE),
  image: await icon("FiImage", WHITE),
  doc: await icon("FiFileText", WHITE),
  grid: await icon("FiGrid", WHITE),
  archive: await icon("FiArchive", WHITE),
  wifiOff: await icon("FiWifiOff", WHITE),
  shield: await icon("FiShield", WHITE),
  alert: await icon("FiAlertTriangle", WHITE),
  lock: await icon("FiLock", WHITE),
  arrow: await icon("FiArrowRight", "5B4A73"),
  // roxos (para fundo claro)
  imageP: await icon("FiImage", PURPLE),
  docP: await icon("FiFileText", PURPLE),
  gridP: await icon("FiGrid", PURPLE),
  cameraP: await icon("FiCamera", PURPLE),
  refreshP: await icon("FiRefreshCw", PURPLE),
  packageP: await icon("FiPackage", PURPLE),
  globeP: await icon("FiGlobe", PURPLE),
  folderP: await icon("FiFolder", PURPLE),
  checkSqP: await icon("FiCheckSquare", PURPLE),
  clockP: await icon("FiClock", PURPLE),
  monitorP: await icon("FiMonitor", PURPLE),
  powerP: await icon("FiPower", PURPLE),
  minimizeP: await icon("FiMinimize2", PURPLE),
  checkP: await icon("FiCheckCircle", PURPLE),
  minusP: await icon("FiMinusCircle", PURPLE),
  videoP: await icon("FiVideo", PURPLE),
  awardP: await icon("FiAward", PURPLE),
  usersP: await icon("FiUsers", PURPLE),
  alertP: await icon("FiAlertCircle", PURPLE),
};

const wheelFormats = await renderWheel({ labels: ["JPG", "PNG", "WebP", "TIFF", "AVIF", "BMP", "PDF"], highlight: "PDF" });
const wheelZip = await renderWheel({ labels: ["ZIP"], highlight: "ZIP" });

// ================================================================ 1. capa
pres.addSection({ title: "Abertura" });
{
  const s = pres.addSlide({ masterName: "COVER", sectionTitle: "Abertura" });
  s.addImage({ path: APP_ICON, x: 0.9, y: 2.35, w: 1.9, h: 1.9, objectName: "ícone do arquivoX" });
  s.addText("arquivoX", { x: 3.1, y: 2.1, w: 5.8, h: 1.2, fontSize: 60, bold: true, color: C.background1, margin: 0, valign: "middle", isTextBox: true, objectName: "nome do produto" });
  s.addText("Converta e compacte arquivos sem sair do Explorer", { x: 3.1, y: 3.3, w: 5.8, h: 1.0, fontSize: 24, color: C.accent3, margin: 0, valign: "top", isTextBox: true, objectName: "tagline" });
  s.addText("Apresentação de lançamento  ·  TRE-RN  ·  novembro de 2026", { x: 3.1, y: 4.4, w: 5.8, h: 0.4, fontSize: 14, color: C.accent4, margin: 0, isTextBox: true, objectName: "contexto" });
  placeWheel(s, wheelFormats, { x: 9.15, y: 1.9, w: 3.7, centerLabel: "PDF", name: "capa" });
  s.addNotes(
    "Bom dia a todos. Hoje vou apresentar o arquivoX, uma ferramenta que vai estar instalada no computador de cada um de vocês nas próximas semanas. " +
    "Ela resolve um problema pequeno que acontece todo dia: trocar o formato de um arquivo, ou juntar vários arquivos em um ZIP, sem abrir programa nenhum e sem mandar nada para a internet. " +
    "A apresentação tem três partes: o problema, uma demonstração ao vivo e o que muda no computador de vocês."
  );
}

// ================================================================ 2. o problema
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Abertura" });
  s.addText("Trocar de formato não deveria ser um projeto", { placeholder: "title" });

  const steps = ["Abrir um site ou programa", "Enviar ou abrir o arquivo", "Esperar", "Baixar o resultado", "Apagar os rastros"];
  const colW = 2.2, gap = (CW - 5 * colW) / 4, cy = 1.75, d = 0.7;
  steps.forEach((label, i) => {
    const cx = M + i * (colW + gap);
    numCircle(s, { x: cx + (colW - d) / 2, y: cy, d, n: i + 1 });
    s.addText(label, { x: cx, y: cy + d + 0.15, w: colW, h: 0.75, fontSize: 14, color: C.text1, align: "center", valign: "top", margin: 0, isTextBox: true, objectName: "etapa " + (i + 1) });
    if (i < 4) {
      const ax = cx + colW + gap / 2 - 0.13;
      s.addImage({ data: ic.arrow, x: ax, y: cy + d / 2 - 0.13, w: 0.26, h: 0.26, objectName: "seta " + (i + 1) });
    }
  });

  card(s, { x: M, y: 3.7, w: CW, h: 2.9, name: "o custo escondido" });
  s.addText("O arquivo sai da máquina só para trocar de extensão.", { x: 1.0, y: 4.0, w: 5.3, h: 2.3, fontSize: 26, bold: true, color: C.accent1, margin: 0, valign: "middle", isTextBox: true, objectName: "mensagem principal" });
  s.addText(
    "É lento, depende de internet e, no caso de documentos de um tribunal, é um risco desnecessário: um arquivo com informação sensível passa por um servidor que ninguém conhece — só para virar PDF.",
    { x: 6.7, y: 4.0, w: 5.7, h: 2.3, fontSize: 15, color: C.text1, margin: 0, valign: "middle", isTextBox: true, objectName: "explicação" }
  );
  s.addNotes(
    "Pensem na última vez que precisaram transformar uma imagem escaneada em PDF, ou um .doc antigo em .docx. O caminho normal é esse de cima: abrir um site de conversão, subir o arquivo, esperar, baixar, e ainda lembrar de apagar o que ficou por lá. " +
    "O ponto que quero destacar é o de baixo: nesse caminho, um documento do tribunal sai do nosso ambiente e passa por um servidor que a gente não controla — só para mudar de extensão. Não precisa ser assim."
  );
}

// ================================================================ 3. o gesto
{
  const s = pres.addSlide({ masterName: "CONTENT_DARK", sectionTitle: "Abertura" });
  s.addText("Tudo cabe em um gesto que você já faz", { placeholder: "title" });

  const colW = 3.6, gap = 0.65, x0 = (SW - (3 * colW + 2 * gap)) / 2;
  const cols = [
    { word: "Arraste", sub: "um ou mais arquivos, no Explorer ou na Área de Trabalho", kind: "icon", data: ic.mouse, name: "arrastar" },
    { word: "Segure Shift", sub: "enquanto arrasta — ou Ctrl, para compactar em ZIP", kind: "key", label: "Shift" },
    { word: "Solte", sub: "sobre o formato desejado; o resultado aparece na mesma pasta", kind: "icon", data: ic.target, name: "soltar" },
  ];
  cols.forEach((c, i) => {
    const cx = x0 + i * (colW + gap);
    if (c.kind === "icon") {
      iconCircle(s, { x: cx + (colW - 1.3) / 2, y: 1.85, d: 1.3, fill: C.accent1, data: c.data, name: c.name });
    } else {
      keycap(s, { x: cx + (colW - 1.7) / 2, y: 2.05, w: 1.7, h: 0.9, label: c.label, fontSize: 26 });
    }
    s.addText(c.word, { x: cx, y: 3.4, w: colW, h: 0.7, fontSize: 34, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: "palavra " + c.word });
    s.addText(c.sub, { x: cx + 0.2, y: 4.15, w: colW - 0.4, h: 1.1, fontSize: 15, color: C.accent4, align: "center", valign: "top", margin: 0, isTextBox: true, objectName: "detalhe " + c.word });
  });
  s.addText("Os arquivos originais nunca são sobrescritos nem movidos.", { x: M, y: 5.6, w: CW, h: 0.5, fontSize: 16, italic: true, color: C.accent3, align: "center", margin: 0, isTextBox: true, objectName: "garantia" });
  s.addNotes(
    "A ideia inteira do arquivoX cabe nessa frase: arraste, segure Shift, solte. Vocês já arrastam arquivos o dia todo — para anexar num e-mail, para mover de pasta. " +
    "A única coisa nova é segurar uma tecla enquanto arrasta: Shift abre o menu de conversão, Ctrl abre a compactação em ZIP. " +
    "E uma garantia importante: o arquivo original nunca é tocado. O resultado aparece ao lado dele, com um nome novo."
  );
}

// ================================================================ 4. como funciona
pres.addSection({ title: "Como funciona" });
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Como funciona" });
  s.addText("Como funciona", { placeholder: "title" });

  const steps = [
    ["Arraste", "Um ou mais arquivos, no Explorer ou na Área de Trabalho. Selecione vários com Ctrl+clique ou Shift+clique, como de costume."],
    ["Segure Shift ou Ctrl", "Enquanto já está arrastando — o cursor precisa ter se movido um pouco. Shift abre a roda de formatos; Ctrl, a de compactação."],
    ["Solte sobre a fatia", "O arquivo convertido aparece na mesma pasta, com o formato no nome (relatorio-pdf.pdf). O original fica intacto."],
  ];
  steps.forEach(([h, dsc], i) => {
    const y = 1.7 + i * 1.55;
    numCircle(s, { x: M, y, n: i + 1 });
    s.addText(h, { x: 1.4, y: y - 0.02, w: 5.7, h: 0.4, fontSize: 18, bold: true, color: C.text1, margin: 0, valign: "top", isTextBox: true, objectName: "passo título " + (i + 1) });
    s.addText(dsc, { x: 1.4, y: y + 0.42, w: 5.7, h: 0.95, fontSize: 14, color: C.text2, margin: 0, valign: "top", isTextBox: true, objectName: "passo descrição " + (i + 1) });
  });

  placeWheel(s, wheelFormats, { x: 7.9, y: 1.5, w: 4.7, centerLabel: "PDF", name: "formatos" });
  s.addText("A roda aparece onde o cursor está, com os formatos possíveis para aquele tipo de arquivo", { x: 7.9, y: 6.3, w: 4.7, h: 0.5, fontSize: 12, color: C.text2, align: "center", valign: "top", margin: 0, isTextBox: true, objectName: "legenda da roda" });
  s.addNotes(
    "Em detalhe: primeiro, arrastar. Pode ser um arquivo ou vários — a seleção múltipla com Ctrl ou Shift continua funcionando normalmente, a roda só aparece depois que o arrasto de fato começa. " +
    "Segundo, com o botão do mouse ainda pressionado, segurar Shift. Essa roda da direita aparece em volta do cursor, com os formatos possíveis para aquele tipo de arquivo: uma imagem mostra JPG, PNG, PDF e assim por diante; um documento do Word mostra PDF, ODT, TXT. " +
    "Terceiro, soltar em cima da fatia. Pronto — o arquivo novo aparece na mesma pasta."
  );
}

// ================================================================ 5. demonstração
{
  const s = pres.addSlide({ masterName: "CONTENT_DARK", sectionTitle: "Como funciona" });
  s.addText("Demonstração ao vivo", { placeholder: "title" });

  const cases = [
    { data: ic.image, name: "imagem", title: "Imagem digitalizada → PDF", desc: "Um JPG escaneado vira PDF pronto para anexar ao processo", key: "Shift" },
    { data: ic.doc, name: "documento", title: "Ofício DOCX → PDF", desc: "Documento do Word convertido sem abrir o Word", key: "Shift" },
    { data: ic.grid, name: "planilha", title: "Planilha XLSX → CSV", desc: "Exportação pronta para importar em outro sistema", key: "Shift" },
    { data: ic.archive, name: "zip", title: "Vários arquivos → ZIP", desc: "Seleção múltipla compactada em um único arquivo com data e hora", key: "Ctrl" },
  ];
  const cw = 2.85, gap = (CW - 4 * cw) / 3, y = 1.7, ch = 3.65;
  cases.forEach((c, i) => {
    const x = M + i * (cw + gap);
    card(s, { x, y, w: cw, h: ch, fill: { color: C.accent1, transparency: 82 }, name: c.name });
    iconCircle(s, { x: x + 0.3, y: y + 0.3, d: 0.7, fill: C.accent1, data: c.data, name: c.name });
    s.addText(String(i + 1), { x: x + cw - 0.75, y: y + 0.3, w: 0.45, h: 0.45, fontSize: 16, bold: true, color: C.accent3, align: "right", margin: 0, isTextBox: true, objectName: "número do caso " + (i + 1) });
    s.addText(c.title, { x: x + 0.3, y: y + 1.2, w: cw - 0.6, h: 0.85, fontSize: 18, bold: true, color: C.background1, margin: 0, valign: "top", isTextBox: true, objectName: "caso " + c.name });
    s.addText(c.desc, { x: x + 0.3, y: y + 2.05, w: cw - 0.6, h: 0.9, fontSize: 13, color: C.accent4, margin: 0, valign: "top", isTextBox: true, objectName: "descrição do caso " + c.name });
    keycap(s, { x: x + 0.3, y: y + ch - 0.75, w: 0.95, h: 0.48, label: c.key, fontSize: 14 });
  });
  s.addText("Arquivos de teste prontos na pasta exemplos/ do projeto — um de cada formato suportado.", { x: M, y: 5.65, w: CW, h: 0.4, fontSize: 14, color: C.accent3, margin: 0, isTextBox: true, objectName: "nota dos exemplos" });
  s.addText("Plano B: vídeo gravado da demonstração.", { x: M, y: 6.1, w: CW, h: 0.4, fontSize: 13, italic: true, color: C.accent4, margin: 0, isTextBox: true, objectName: "plano b" });
  s.addNotes(
    "ROTEIRO DA DEMONSTRAÇÃO (testar na máquina da apresentação no mesmo dia; deixar a pasta exemplos/ aberta no Explorer e o vídeo de reserva pronto).\n\n" +
    "1. Imagem → PDF: arrastar exemplo-imagem.jpg, segurar Shift, soltar em PDF. Mostrar o exemplo-imagem-pdf.pdf aparecendo ao lado do original. Abrir o PDF.\n" +
    "2. Documento → PDF: arrastar exemplo-documento.docx, Shift, soltar em PDF. Comentar que não abriu o Word, e que o original continua lá.\n" +
    "3. Planilha → CSV: arrastar exemplo-planilha.xlsx, Shift, soltar em CSV. Abrir o CSV no Bloco de Notas para mostrar o conteúdo.\n" +
    "4. Vários → ZIP: selecionar 3 ou 4 arquivos com Ctrl+clique, arrastar, segurar Ctrl, soltar em ZIP. Mostrar o Compactado_<data>_<hora>.zip.\n\n" +
    "Se algo falhar: a roda mostra a mensagem de erro real; ler a mensagem em voz alta e seguir para o próximo caso. Se o LibreOffice não responder no caso 2, pular para o vídeo."
  );
}

// ================================================================ 6. o que converte
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Como funciona" });
  s.addText("O que ele converte", { placeholder: "title" });

  const groups = [
    { name: "Imagens", data: ic.image, inputs: ["JPG", "PNG", "WebP", "TIFF", "AVIF", "BMP", "SVG"], outputs: ["JPG", "PNG", "WebP", "TIFF", "AVIF", "BMP", "PDF"], note: "SVG só como entrada; PDF só como saída." },
    { name: "Documentos", data: ic.doc, inputs: ["DOCX", "DOC", "ODT", "RTF", "TXT", "MD"], outputs: ["DOCX", "DOC", "ODT", "RTF", "TXT", "PDF", "MD"], note: "Precisa do LibreOffice instalado. PDF só como saída; Markdown só de/para TXT." },
    { name: "Planilhas", data: ic.grid, inputs: ["CSV", "TSV", "XLSX", "XLS", "XLSB", "ODS"], outputs: ["CSV", "XLSX"], note: "Fórmulas perigosas vindas de fora são neutralizadas ao gerar CSV." },
  ];
  const cw = 3.95, gap = (CW - 3 * cw) / 2, y = 1.6, ch = 5.05;
  groups.forEach((g, i) => {
    const x = M + i * (cw + gap);
    card(s, { x, y, w: cw, h: ch, name: g.name });
    iconCircle(s, { x: x + 0.3, y: y + 0.3, d: 0.7, fill: C.accent1, data: g.data, name: g.name });
    s.addText(g.name, { x: x + 1.15, y: y + 0.33, w: cw - 1.45, h: 0.65, fontSize: 22, bold: true, color: C.text1, margin: 0, valign: "middle", isTextBox: true, objectName: "grupo " + g.name });
    s.addText("ENTRADA", { x: x + 0.3, y: y + 1.3, w: 2, h: 0.25, fontSize: 11, bold: true, color: C.text2, charSpacing: 2, margin: 0, isTextBox: true, objectName: "rótulo entrada " + g.name });
    let ny = chips(s, { x: x + 0.3, y: y + 1.6, maxW: cw - 0.6, items: g.inputs, fill: C.accent4, color: C.text1 });
    s.addText("SAÍDA", { x: x + 0.3, y: ny + 0.25, w: 2, h: 0.25, fontSize: 11, bold: true, color: C.text2, charSpacing: 2, margin: 0, isTextBox: true, objectName: "rótulo saída " + g.name });
    ny = chips(s, { x: x + 0.3, y: ny + 0.55, maxW: cw - 0.6, items: g.outputs, fill: C.accent1, color: C.background1 });
    s.addText(g.note, { x: x + 0.3, y: y + ch - 0.95, w: cw - 0.6, h: 0.7, fontSize: 12, color: C.text2, margin: 0, valign: "bottom", isTextBox: true, objectName: "observação " + g.name });
  });
  s.addNotes(
    "Três famílias de arquivo. Imagens: todos os formatos comuns, inclusive os mais novos como WebP e AVIF, e PDF como saída — que é o caso mais frequente aqui, scan para PDF. " +
    "Documentos de texto: Word novo e antigo, LibreOffice, RTF, texto puro, e PDF como saída. Essa família usa o LibreOffice que já está instalado nas máquinas como motor de conversão. " +
    "Planilhas: lê tudo que o Excel e o LibreOffice produzem, e grava CSV ou XLSX. Um detalhe de segurança: se uma planilha vinda de fora tiver uma fórmula maliciosa escondida, ela é neutralizada ao gerar o CSV."
  );
}

// ================================================================ 7. ZIP
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Como funciona" });
  s.addText("Vários arquivos, um ZIP, uma tecla", { placeholder: "title" });

  placeWheel(s, wheelZip, { x: 0.85, y: 1.75, w: 3.9, centerLabel: "solte aqui", name: "zip" });
  s.addText("Com Ctrl, a roda mostra uma única opção", { x: 0.85, y: 5.8, w: 3.9, h: 0.4, fontSize: 12, color: C.text2, align: "center", margin: 0, isTextBox: true, objectName: "legenda da roda zip" });

  const x = 5.5, w = SW - M - x;
  iconRow(s, { x, y: 1.6, w, data: ic.checkSqP, name: "seleção", circleFill: C.accent4, titleColor: C.text1, descColor: C.text2,
    title: "Selecione vários, como sempre", desc: "Ctrl+clique e Shift+clique no Explorer continuam funcionando — a roda só aparece depois que o arrasto começa." });
  keycap(s, { x, y: 2.95, w: 0.95, h: 0.55, label: "Ctrl", fontSize: 16 });
  s.addText("Arraste e segure Ctrl", { x: x + 1.2, y: 2.9, w: w - 1.2, h: 0.4, fontSize: 17, bold: true, color: C.text1, margin: 0, valign: "top", isTextBox: true, objectName: "título ctrl" });
  s.addText("Solte sobre ZIP. Vale para qualquer tipo de arquivo, inclusive misturados.", { x: x + 1.2, y: 3.32, w: w - 1.2, h: 0.75, fontSize: 14, color: C.text2, margin: 0, valign: "top", isTextBox: true, objectName: "descrição ctrl" });
  iconCircle(s, { x, y: 4.22, d: 0.64, fill: C.accent4, data: ic.clockP, name: "relógio" });
  s.addText("Nome com data e hora", { x: x + 0.89, y: 4.2, w: w - 0.89, h: 0.4, fontSize: 17, bold: true, color: C.text1, margin: 0, valign: "top", isTextBox: true, objectName: "título nome" });
  s.addText([
    { text: "Compactado_2026-11-05_14-56-38.zip", options: { fontFace: "Courier New", bold: true, color: C.accent1 } },
    { text: " — único, legível e em ordem cronológica na pasta.", options: { color: C.text2 } },
  ], { x: x + 0.89, y: 4.62, w: w - 0.89, h: 0.75, fontSize: 14, margin: 0, valign: "top", isTextBox: true, objectName: "descrição nome" });
  iconRow(s, { x, y: 5.5, w, data: ic.packageP, name: "nativo", circleFill: C.accent4, titleColor: C.text1, descColor: C.text2,
    title: "100% nativo", desc: "Não depende de 7-Zip, WinRAR nem de nenhum outro programa instalado." });
  s.addNotes(
    "A segunda tecla é o Ctrl, e ela faz uma coisa só: ZIP. Selecionem os arquivos que quiserem — de tipos diferentes, misturados — arrastem, segurem Ctrl e soltem. " +
    "O arquivo sai com a data e a hora no nome, então nunca sobrescreve nada e fica fácil de achar na pasta. " +
    "E é tudo nativo: não precisa de 7-Zip, WinRAR, nada. O caso típico é juntar os anexos de um processo em um único arquivo para caber no limite do sistema de protocolo."
  );
}

// ================================================================ 8. usos no TRE-RN
pres.addSection({ title: "No TRE-RN" });
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "No TRE-RN" });
  s.addText("No dia a dia do TRE-RN", { placeholder: "title" });

  const uses = [
    { data: ic.cameraP, name: "protocolo", title: "Digitalização e protocolo", desc: "Imagem escaneada → PDF antes de anexar ao processo no SEI, sem depender do scanner." },
    { data: ic.refreshP, name: "legados", title: "Documentos legados", desc: ".doc antigo → .docx, ou qualquer documento de texto → PDF antes de protocolar." },
    { data: ic.packageP, name: "anexos", title: "Anexos com limite de tamanho", desc: "Vários documentos em um único ZIP para caber no limite por arquivo do sistema." },
    { data: ic.gridP, name: "planilhas", title: "Planilhas de outros sistemas", desc: "CSV exportado → XLSX para analisar no Excel, e o caminho inverso para importar." },
    { data: ic.globeP, name: "publicação", title: "Publicação institucional", desc: "Imagens no formato certo para o site, a intranet e os materiais de comunicação." },
    { data: ic.folderP, name: "lotes", title: "Lotes de arquivos", desc: "Fotos ou documentos de um processo inteiro em um só arquivo para arquivar ou enviar." },
  ];
  const cw = 3.95, gap = (CW - 3 * cw) / 2;
  uses.forEach((u, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = M + col * (cw + gap), y = 1.95 + row * 2.6;
    iconRow(s, { x, y, w: cw, data: u.data, name: u.name, circleFill: C.accent4, titleColor: C.text1, descColor: C.text2, title: u.title, desc: u.desc, descSize: 14 });
  });
  s.addNotes(
    "Alguns exemplos de onde isso entra na rotina. Quem protocola documentos no SEI conhece o problema do scan que vem em JPG. Quem lida com arquivo antigo conhece o .doc que ninguém mais abre direito. " +
    "Quem anexa muita coisa conhece o limite de tamanho por arquivo. Em todos esses casos, o caminho fica: arrastar, segurar a tecla, soltar. " +
    "O app não foi desenhado para um processo específico do tribunal — ele cobre as necessidades comuns de qualquer rotina administrativa."
  );
}

// ================================================================ 9. segurança
{
  const s = pres.addSlide({ masterName: "CONTENT_DARK", sectionTitle: "No TRE-RN" });
  s.addText("Nenhum arquivo sai da máquina", { placeholder: "title" });

  s.addText("0", { x: M, y: 1.45, w: 4.6, h: 2.7, fontSize: 150, bold: true, color: C.accent3, margin: 0, valign: "middle", isTextBox: true, objectName: "zero" });
  s.addText("arquivos, nomes de arquivo ou metadados enviados para fora do seu computador — em nenhuma etapa", { x: M, y: 4.25, w: 4.6, h: 1.2, fontSize: 16, color: C.accent4, margin: 0, valign: "top", isTextBox: true, objectName: "legenda do zero" });

  const x = 5.9, w = SW - M - x;
  const rows = [
    { data: ic.wifiOff, name: "offline", title: "Funciona sem internet", desc: "Todo o processamento acontece no seu computador. Nada é enviado a servidor nenhum." },
    { data: ic.shield, name: "auditoria", title: "Revisão de segurança dedicada", desc: "Dependências auditadas contra vulnerabilidades conhecidas e atualizadas." },
    { data: ic.alert, name: "fórmulas", title: "Planilhas de fontes externas", desc: "Fórmulas perigosas escondidas em células são neutralizadas ao gerar CSV." },
    { data: ic.lock, name: "limites", title: "Arquivos malformados não derrubam o app", desc: "Limites explícitos de memória na leitura de imagens." },
  ];
  rows.forEach((r, i) => iconRow(s, { x, y: 1.65 + i * 1.25, w, data: r.data, name: r.name, circleFill: C.accent1, titleColor: C.background1, descColor: C.accent4, title: r.title, desc: r.desc }));
  s.addNotes(
    "Esse é o slide mais importante para um tribunal. O número é zero: nenhum arquivo, nenhum nome de arquivo, nenhum metadado sai do computador. " +
    "O app funciona com o cabo de rede desligado. Não tem conta, não tem login, não tem nuvem. " +
    "Além disso, o projeto passou por uma revisão de segurança: as bibliotecas que ele usa foram auditadas contra vulnerabilidades conhecidas, e os pontos onde um arquivo vindo de fora é processado têm proteções específicas — como a neutralização de fórmulas em planilhas."
  );
}

// ================================================================ 10. o que muda no PC
pres.addSection({ title: "Implantação" });
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Implantação" });
  s.addText("O que muda no seu computador", { placeholder: "title" });

  const w = 7.3;
  const rows = [
    { data: ic.monitorP, name: "bandeja", title: "Um ícone novo na bandeja do sistema", desc: "O app fica em segundo plano, ao lado do relógio. É daí que o gesto funciona a qualquer momento." },
    { data: ic.powerP, name: "autostart", title: "Abre sozinho com o Windows", desc: "Ligado por padrão para o gesto estar sempre disponível. Dá para desligar pelo menu da bandeja." },
    { data: ic.minimizeP, name: "fechar", title: "Fechar a janela não encerra o app", desc: "A janela principal é opcional — o gesto continua funcionando. Para sair de verdade: menu da bandeja → Sair." },
    { data: ic.docP, name: "libreoffice", title: "Documentos precisam do LibreOffice", desc: "Já instalado nas estações. Sem ele, a conversão de documentos avisa em vez de falhar em silêncio." },
  ];
  rows.forEach((r, i) => iconRow(s, { x: M, y: 1.65 + i * 1.28, w, data: r.data, name: r.name, circleFill: C.accent4, titleColor: C.text1, descColor: C.text2, title: r.title, desc: r.desc }));

  // mock do menu da bandeja
  const mx = 8.75, my = 2.0, mw = 3.95, mh = 3.25;
  card(s, { x: mx, y: my, w: mw, h: mh, fill: C.background1, line: { color: C.accent4, width: 1 }, withShadow: true, name: "menu da bandeja" });
  s.addImage({ path: APP_ICON, x: mx + 0.3, y: my + 0.3, w: 0.45, h: 0.45, objectName: "ícone no menu" });
  s.addText("arquivoX", { x: mx + 0.9, y: my + 0.3, w: 2.5, h: 0.45, fontSize: 16, bold: true, color: C.text1, margin: 0, valign: "middle", isTextBox: true, objectName: "nome no menu" });
  s.addShape(pres.ShapeType.line, { x: mx + 0.3, y: my + 0.95, w: mw - 0.6, h: 0, line: { color: C.accent4, width: 1 }, objectName: "separador do menu" });
  const items = [["Abrir arquivoX", null], ["Iniciar com o Windows", ic.checkSqP], ["Sair", null]];
  items.forEach(([label, chk], i) => {
    const iy = my + 1.15 + i * 0.65;
    if (chk) s.addImage({ data: chk, x: mx + 0.35, y: iy + 0.1, w: 0.3, h: 0.3, objectName: "marcação " + label });
    s.addText(label, { x: mx + 0.8, y: iy, w: mw - 1.1, h: 0.5, fontSize: 15, color: C.text1, margin: 0, valign: "middle", isTextBox: true, objectName: "item " + label });
  });
  s.addText("Menu do ícone na bandeja do sistema", { x: mx, y: my + mh + 0.2, w: mw, h: 0.4, fontSize: 12, color: C.text2, align: "center", margin: 0, isTextBox: true, objectName: "legenda do menu" });
  s.addNotes(
    "Na prática, o que vocês vão notar é um ícone roxo novo ao lado do relógio. O app fica ali, em segundo plano, e abre sozinho com o Windows — por isso o gesto funciona a qualquer hora, sem precisar abrir nada. " +
    "Se fechar a janela principal, o app continua rodando; isso é proposital. Para sair de verdade, é pelo menu da bandeja. " +
    "A única dependência externa é o LibreOffice, usado para converter documentos de texto — e ele já está instalado nas estações."
  );
}

// ================================================================ 11. para a TI
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Implantação" });
  s.addText("Para a equipe de TI: como chega em cada estação", { placeholder: "title" });

  const items = [
    ["Um instalador .exe", " gerado pelo próprio projeto (npm run tauri build); sem dependências além do app."],
    ["Aviso do SmartScreen na 1ª execução", " — o instalador ainda não é assinado digitalmente; assinatura de código é o passo recomendado antes do rollout."],
    ["LibreOffice em cada estação", ", instalado e aberto ao menos uma vez, para a conversão de documentos. O resto é 100% nativo."],
    ["Nada para liberar no firewall", ": sem rede, sem telemetria, sem serviço em nuvem."],
    ["Código aberto e auditável", " em github.com/joaodeon/arquivox (Rust + Tauri 2, React)."],
  ];
  items.forEach(([lead, rest], i) => {
    const y = 1.65 + i * 1.02;
    iconCircle(s, { x: M, y: y + 0.02, d: 0.5, fill: C.accent4, data: ic.checkP, name: "check " + (i + 1) });
    s.addText([{ text: lead, options: { bold: true, color: C.text1 } }, { text: rest, options: { color: C.text2 } }],
      { x: M + 0.75, y, w: 6.9, h: 0.9, fontSize: 15, margin: 0, valign: "top", isTextBox: true, objectName: "requisito " + (i + 1) });
  });

  const tx = 8.85, tw = SW - M - tx;
  const tiles = [["1", "instalador, sem pré-requisitos"], ["0", "serviços em nuvem ou contas"], ["Rust + Tauri", "backend nativo, interface leve"]];
  tiles.forEach(([big, small], i) => {
    const y = 1.65 + i * 1.72;
    card(s, { x: tx, y, w: tw, h: 1.5, name: "indicador " + big });
    s.addText(big, { x: tx + 0.3, y: y + 0.15, w: tw - 0.6, h: 0.75, fontSize: big.length > 2 ? 26 : 44, bold: true, color: C.accent1, margin: 0, valign: "middle", isTextBox: true, objectName: "valor " + big });
    s.addText(small, { x: tx + 0.3, y: y + 0.9, w: tw - 0.6, h: 0.45, fontSize: 13, color: C.text2, margin: 0, valign: "top", isTextBox: true, objectName: "rótulo " + big });
  });
  s.addNotes(
    "Para a equipe de TI: é um instalador único, sem pré-requisitos. Dois pontos de atenção. Primeiro, o instalador ainda não é assinado digitalmente, então o SmartScreen avisa na primeira execução — assinar o instalador é o passo recomendado antes de distribuir em escala. " +
    "Segundo, a conversão de documentos depende do LibreOffice; ele precisa estar instalado e ter sido aberto ao menos uma vez em cada estação, senão a primeira conversão pode travar. " +
    "Fora isso: nada de rede, nada de firewall, e o código está aberto no GitHub para quem quiser auditar."
  );
}

// ================================================================ 12. limitações e próximos passos
{
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Implantação" });
  s.addText("O que ainda não faz — e o que vem a seguir", { placeholder: "title" });

  const cw = (CW - 0.3) / 2, y = 1.65, ch = 4.95;
  const cols = [
    { x: M, fill: C.background2, circle: C.accent4, heading: "Limitações conhecidas", name: "limitações", rows: [
      { data: ic.minusP, name: "heic", title: "Fotos HEIC (iPhone)", desc: "Ainda não são lidas — converta para JPG no próprio celular antes." },
      { data: ic.minusP, name: "pdf origem", title: "PDF só como destino", desc: "A importação de PDF corrompe acentos nesta versão do LibreOffice; por isso não é oferecida." },
      { data: ic.minusP, name: "markdown", title: "Markdown só de/para TXT", desc: "Sem conversão com formatação rica para Word ou PDF." },
    ] },
    { x: M + cw + 0.3, fill: C.accent4, circle: C.background1, heading: "Próximos passos", name: "próximos", rows: [
      { data: ic.videoP, name: "vídeo", title: "Vídeo e áudio", desc: "Novo módulo de conversão, na mesma roda." },
      { data: ic.awardP, name: "assinatura", title: "Instalador assinado", desc: "Sem aviso do SmartScreen na instalação." },
      { data: ic.usersP, name: "feedback", title: "Prioridades definidas por vocês", desc: "O retorno dos primeiros usuários decide o que vem antes." },
    ] },
  ];
  cols.forEach((c) => {
    card(s, { x: c.x, y, w: cw, h: ch, fill: c.fill, name: c.name });
    s.addText(c.heading, { x: c.x + 0.35, y: y + 0.3, w: cw - 0.7, h: 0.5, fontSize: 20, bold: true, color: C.text1, margin: 0, valign: "middle", isTextBox: true, objectName: "cabeçalho " + c.name });
    c.rows.forEach((r, i) => iconRow(s, { x: c.x + 0.35, y: y + 1.05 + i * 1.25, w: cw - 0.7, data: r.data, name: r.name, circleFill: c.circle, titleColor: C.text1, descColor: C.text2, title: r.title, desc: r.desc, d: 0.56, titleSize: 16, descSize: 13 }));
  });
  s.addNotes(
    "Para ser transparente: três coisas que ele ainda não faz. Fotos de iPhone no formato HEIC — converta no celular antes. PDF como origem — o PDF é só destino, porque a importação corrompe acentos. E Markdown só vira texto puro. " +
    "Do lado dos próximos passos: vídeo e áudio na mesma roda, instalador assinado, e — o mais importante — as prioridades vão ser definidas pelo que vocês reportarem nas primeiras semanas de uso."
  );
}

// ================================================================ 13. encerramento
pres.addSection({ title: "Encerramento" });
{
  const s = pres.addSlide({ masterName: "COVER", sectionTitle: "Encerramento" });
  s.addImage({ path: APP_ICON, x: (SW - 1.5) / 2, y: 1.35, w: 1.5, h: 1.5, objectName: "ícone do arquivoX" });
  s.addText("Arraste. Segure Shift. Solte.", { x: M, y: 3.15, w: CW, h: 1.0, fontSize: 44, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: "frase final" });
  s.addText("Dúvidas?", { x: M, y: 4.3, w: CW, h: 0.6, fontSize: 24, color: C.accent3, align: "center", margin: 0, isTextBox: true, objectName: "perguntas" });
  s.addText("github.com/joaodeon/arquivox", { x: M, y: 5.15, w: CW, h: 0.4, fontSize: 14, color: C.accent4, align: "center", margin: 0, isTextBox: true, objectName: "repositório" });
  s.addNotes(
    "Para fechar: arraste, segure Shift, solte. É isso. O app chega nas estações nas próximas semanas, e o canal para dúvidas e sugestões é [definir: e-mail, chamado na TI ou grupo]. " +
    "Obrigado. Fico à disposição para perguntas — e, se alguém quiser testar agora, a máquina está aqui."
  );
}

await pres.writeFile({ fileName: OUT });
await applyTheme(OUT, THEME);
console.log("ok:", OUT);
