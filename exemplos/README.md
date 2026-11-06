# Exemplos

Um arquivo de teste para cada formato de **entrada** que o arquivoX converte, pra testar manualmente arrastando pra roda (Shift) ou compactando (Ctrl).

## Imagens (Shift)

`exemplo-imagem.{jpg,png,webp,tiff,avif,bmp}` — o mesmo gradiente colorido em cada formato, gerado com o próprio motor de imagem do app (`image` crate), pra garantir compatibilidade real com o decodificador que o arquivoX usa.

`exemplo-vetor.svg` — um círculo roxo com texto, formato de entrada apenas (o app rasteriza pra converter).

## Planilhas (Shift)

`exemplo-planilha.{csv,tsv,xlsx,xls,ods}` — mesma tabela de 3 linhas em cada formato.

- `.csv`/`.tsv`: texto puro, escritos à mão.
- `.xlsx`: gerado com `rust_xlsxwriter` (a mesma biblioteca que o app usa pra escrever XLSX).
- `.xls`/`.ods`: gerados a partir do `.xlsx` via LibreOffice em modo headless (`soffice --headless --convert-to ...`).

**`.xlsb` não está incluído**: nem o LibreOffice nem (nesta máquina) o Excel conseguem *escrever* nesse formato — LibreOffice só lê XLSB, não exporta pra ele, e é um formato binário proprietário da Microsoft sem biblioteca de escrita livre disponível. O app continua lendo `.xlsb` normalmente (via `calamine`); só não há como gerar um exemplo confiável sem o Excel instalado. Se precisar testar essa conversão específica, use um arquivo `.xlsb` real que você já tenha.

## Compactação (Ctrl)

Não precisa de exemplo próprio — a compactação ZIP funciona com qualquer arquivo, incluindo todos os acima. Selecione um ou mais, arraste segurando Ctrl.

## Como foram gerados

As imagens e o `.xlsx` foram gerados por `app/src-tauri/examples/gen_samples.rs` (reaproveita as mesmas bibliotecas de conversão do app):

```bash
cd app/src-tauri
cargo run --example gen_samples
```
