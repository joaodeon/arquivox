# arquivoX

Conversor de arquivos para Windows, 100% local, operado por gestos: arraste um arquivo, segure uma tecla, solte sobre o formato ou a ferramenta desejada. Sem upload, sem internet, sem instalar nada além do próprio app.

Inspirado no [Tangerine](https://tangerineformac.com/) (macOS), recriado do zero para Windows.

## Motivação

Converter um arquivo isolado — uma imagem escaneada, uma planilha exportada de outro sistema — normalmente significa abrir um site de conversão online, fazer upload do arquivo, esperar, baixar o resultado e apagar os rastros. Isso é lento, depende de internet, e no caso de documentos institucionais levanta uma questão simples: **por que um arquivo que pode conter informação sensível precisa sair da máquina só para mudar de formato?**

O arquivoX resolve isso localmente. Toda conversão roda no seu computador, nenhum arquivo é enviado a lugar nenhum. O fluxo foi pensado para ser mais rápido que abrir qualquer site: você já está arrastando o arquivo (para anexar em um e-mail, por exemplo) — basta segurar uma tecla a mais.

## Como funciona

1. Arraste um arquivo no Explorer ou na Área de Trabalho (funciona em qualquer lugar do sistema, não só dentro do app).
2. Enquanto arrasta, segure **Shift** para abrir o menu de conversão de formato, ou **Ctrl** para abrir as ferramentas avançadas.
3. Solte sobre a fatia desejada. O arquivo convertido aparece na mesma pasta do original, com um sufixo no nome (ex: `relatorio-xlsx.xlsx`) — o original nunca é sobrescrito.

O app roda em segundo plano (ícone na bandeja do sistema) para que o gesto funcione a qualquer momento, mesmo com a janela principal fechada.

## Funcionalidades

**Conversão de imagens**
JPG, PNG, WebP, TIFF, AVIF, BMP, PDF (saída) e SVG (entrada), com conversão entre todos os formatos de imagem.

**Ferramentas avançadas de imagem** (menu Ctrl)
Comprimir, girar 90° (horário/anti-horário), espelhar, remover metadados (EXIF/GPS).

**Conversão de planilhas**
CSV, TSV, XLSX, XLS, XLSB e ODS como entrada; CSV e XLSX como saída.

**Privacidade por padrão**
Nenhum arquivo, nome de arquivo ou metadado sai da máquina em nenhuma etapa. Toda a conversão acontece em processo local.

## Possíveis usos no TRE-RN

Alguns cenários onde esse tipo de ferramenta pode ajudar no dia a dia de um órgão público:

- **Digitalização e protocolo**: converter imagens escaneadas (JPG/PNG) para PDF antes de anexar a processos (ex: SEI), sem depender de scanner com saída direta em PDF.
- **Compressão para anexos**: muitos sistemas de protocolo eletrônico têm limite de tamanho por arquivo — comprimir fotos antes de anexar evita retrabalho.
- **Remoção de metadados**: fotos tiradas em locais de votação ou eventos institucionais podem carregar dados de GPS/câmera no EXIF; remover isso antes de publicar é uma prática de segurança da informação simples de aplicar.
- **Interoperabilidade de planilhas**: converter exportações de sistemas legados (CSV) para XLSX para análise em Excel, ou o caminho inverso para importação em outros sistemas.
- **Publicação institucional**: preparar imagens (redimensionar/comprimir) para uso em sites, intranet ou materiais de comunicação.

São sugestões de uso geral — o app não foi desenhado para nenhum processo específico do tribunal, mas os módulos (conversão de imagem, ferramentas avançadas, conversão de planilha) cobrem necessidades comuns de qualquer rotina administrativa.

## Stack técnica

- **Backend**: Rust + [Tauri 2](https://tauri.app/) — conversão de imagem (`image`, `resvg`, `printpdf`), conversão de planilha (`calamine`, `rust_xlsxwriter`, `csv`), e um observador de teclado/mouse nativo do Windows (hooks de baixo nível) para o gesto global de arrastar-e-soltar.
- **Frontend**: React + TypeScript + Tailwind CSS, com a roda radial desenhada em SVG (`d3-shape`).

## Rodando em desenvolvimento

```bash
cd app
npm install
npm run tauri dev
```

Requer Rust (toolchain MSVC) e Node.js instalados.

## Status

Projeto em desenvolvimento ativo. Módulos já implementados:

- [x] Conversão de imagens
- [x] Roda radial (interface de seleção por gesto)
- [x] Gesto global (Shift/Ctrl + arrastar, em qualquer lugar do Windows)
- [x] Ferramentas avançadas de imagem
- [x] Conversão de planilhas
- [ ] Empacotamento como instalador
- [ ] Inicialização automática com o Windows
- [ ] Novos módulos (vídeo/áudio, documentos)
