# arquivoX

Conversor e compactador de arquivos para Windows, 100% local, operado por gestos: arraste um ou mais arquivos, segure uma tecla, solte sobre o formato ou a ação desejada. Sem upload, sem internet, sem instalar nada além do próprio app.

Inspirado no [Tangerine](https://tangerineformac.com/) (macOS), recriado do zero para Windows.

## Motivação

Converter um arquivo isolado — uma imagem escaneada, uma planilha exportada de outro sistema — normalmente significa abrir um site de conversão online, fazer upload do arquivo, esperar, baixar o resultado e apagar os rastros. Isso é lento, depende de internet, e no caso de documentos institucionais levanta uma questão simples: **por que um arquivo que pode conter informação sensível precisa sair da máquina só para mudar de formato?**

O arquivoX resolve isso localmente. Toda conversão e compactação roda no seu computador, nenhum arquivo é enviado a lugar nenhum. O fluxo foi pensado para ser mais rápido que abrir qualquer site: você já está arrastando o arquivo (para anexar em um e-mail, por exemplo) — basta segurar uma tecla a mais.

## Como funciona

1. Arraste um ou mais arquivos no Explorer ou na Área de Trabalho (funciona em qualquer lugar do sistema, não só dentro do app) — selecione vários com Ctrl+clique ou Shift+clique normalmente, como de costume.
2. **Enquanto já está arrastando** (o cursor precisa ter se movido um pouco, não é só clicar), segure **Shift** para abrir o menu de conversão de formato, ou **Ctrl** para compactar em ZIP.
3. Solte sobre a fatia desejada. O resultado aparece na mesma pasta dos arquivos originais — os arquivos de origem nunca são sobrescritos ou movidos.

O app roda em segundo plano (ícone na bandeja do sistema) para que o gesto funcione a qualquer momento, mesmo com a janela principal fechada, e abre sozinho com o Windows (pode ser desligado a qualquer momento pelo menu da bandeja).

## Funcionalidades

**Conversão de imagens** (Shift)
JPG, PNG, WebP, TIFF, AVIF, BMP, PDF (saída) e SVG (entrada), com conversão entre todos os formatos de imagem.

**Conversão de planilhas** (Shift)
CSV, TSV, XLSX, XLS, XLSB e ODS como entrada; CSV e XLSX como saída. Células que começam com `=`, `+`, `-` ou `@` na origem são neutralizadas ao exportar para CSV, para não virarem fórmulas executáveis ao reabrir no Excel (proteção contra planilhas de fontes externas).

**Compactação ZIP** (Ctrl)
Compacta um ou vários arquivos selecionados — de qualquer tipo — em um único `.zip`, nomeado com a data e hora da compactação (`Compactado_2026-11-05_14-56-38.zip`). Implementado de forma 100% nativa, sem depender de 7-Zip, WinRAR ou qualquer outro programa instalado na máquina.

**Em segundo plano, de forma previsível**
- Roda na bandeja do sistema; fechar a janela principal não encerra o app.
- Abre sozinho com o Windows (ligado por padrão, com opção de desligar pelo menu da bandeja).
- Só uma instância por vez — tentar abrir de novo só traz a janela existente para frente.

**Privacidade por padrão**
Nenhum arquivo, nome de arquivo ou metadado sai da máquina em nenhuma etapa. Toda a conversão e compactação acontece em processo local.

## Possíveis usos no TRE-RN

Alguns cenários onde esse tipo de ferramenta pode ajudar no dia a dia de um órgão público:

- **Digitalização e protocolo**: converter imagens escaneadas (JPG/PNG) para PDF antes de anexar a processos (ex: SEI), sem depender de scanner com saída direta em PDF.
- **Anexos com limite de tamanho**: muitos sistemas de protocolo eletrônico têm limite por arquivo — compactar vários documentos em um único `.zip` antes de anexar reduz o tamanho total e evita retrabalho.
- **Interoperabilidade de planilhas**: converter exportações de sistemas legados (CSV) para XLSX para análise em Excel, ou o caminho inverso para importação em outros sistemas.
- **Publicação institucional**: converter imagens para os formatos usados em sites, intranet ou materiais de comunicação.
- **Organização de lotes de arquivos**: compactar fotos, documentos digitalizados ou exportações de um processo inteiro em um único arquivo antes de arquivar ou enviar por e-mail.

São sugestões de uso geral — o app não foi desenhado para nenhum processo específico do tribunal, mas os módulos cobrem necessidades comuns de qualquer rotina administrativa.

## Segurança

O projeto passou por uma revisão de segurança dedicada, com foco em dependências e nos pontos onde arquivos de origem externa (fora do controle do usuário) são processados:

- **Dependências**: auditoria via `cargo-audit` contra o banco RUSTSEC encontrou 12 vulnerabilidades conhecidas (a mais grave, um estouro de memória no parser de `.xls` da biblioteca de leitura de planilhas). Todas corrigidas via atualização de dependências, exceto uma — não explorável no uso que o app faz dela (biblioteca de PDF usada só para escrever, nunca para ler um PDF fornecido pelo usuário).
- **Injeção de fórmula em CSV**: células de planilhas de origem que começam com `=`, `+`, `-` ou `@` são neutralizadas ao exportar para CSV, evitando que uma planilha de fonte externa execute uma fórmula ao ser reaberta no Excel.
- **Política de segurança de conteúdo (CSP)**: restrita ao conteúdo local do app (estava desabilitada por padrão no scaffold inicial).
- **Permissões mínimas**: o app só solicita as permissões do Tauri que realmente usa.
- **Limites de decodificação de imagem**: dimensão e alocação máximas definidas explicitamente, para que um arquivo de imagem malformado não consiga esgotar a memória do processo.

## Instalação

Baixe e rode o instalador mais recente (gerado via `npm run tauri build`, disponível em `app/src-tauri/target/release/bundle/nsis/` após o build). Como o app não é assinado digitalmente, o Windows SmartScreen pode avisar na primeira execução — clique em "Mais informações" → "Executar assim mesmo".

## Rodando em desenvolvimento

```bash
cd app
npm install
npm run tauri dev
```

Requer Rust (toolchain MSVC) e Node.js instalados.

## Stack técnica

- **Backend**: Rust + [Tauri 2](https://tauri.app/)
  - Conversão de imagem: `image`, `resvg` (SVG), `printpdf` (PDF)
  - Conversão de planilha: `calamine` (leitura), `rust_xlsxwriter` (escrita XLSX), `csv`
  - Compactação: `zip`, com nomes de arquivo gerados via `chrono`
  - Observador de teclado/mouse nativo do Windows (`windows-rs`, consulta direta de estado em vez de hooks de evento) para o gesto global de arrastar-e-soltar em qualquer lugar do sistema
  - `tauri-plugin-single-instance`, `tauri-plugin-autostart`, `tauri-plugin-dialog`
- **Frontend**: React + TypeScript + Tailwind CSS, com a roda radial desenhada em SVG (`d3-shape`)

## Status

Projeto em desenvolvimento ativo. Módulos já implementados:

- [x] Conversão de imagens
- [x] Conversão de planilhas
- [x] Compactação ZIP (um ou vários arquivos)
- [x] Roda radial (interface de seleção por gesto)
- [x] Gesto global (Shift/Ctrl + arrastar, em qualquer lugar do Windows)
- [x] Execução em segundo plano, inicialização automática, instância única
- [x] Empacotamento como instalador
- [x] Revisão de segurança
- [ ] Novos módulos (vídeo/áudio, documentos)
