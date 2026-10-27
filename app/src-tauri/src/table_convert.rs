//! Conversor de arquivos tabulares: CSV/TSV ↔ XLSX. Também lê XLS/XLSB/ODS
//! (via calamine) como formatos de entrada de bônus, convertendo para CSV
//! ou XLSX.

use std::path::Path;

use anyhow::{anyhow, Result};
use calamine::{open_workbook_auto, Data, Reader};
use csv::{ReaderBuilder, WriterBuilder};
use rust_xlsxwriter::Workbook;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TableFormat {
    Csv,
    Xlsx,
}

impl TableFormat {
    fn from_str(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "csv" => Ok(TableFormat::Csv),
            "xlsx" => Ok(TableFormat::Xlsx),
            other => Err(anyhow!("Formato de destino não suportado: {other}")),
        }
    }

    fn extension(&self) -> &'static str {
        match self {
            TableFormat::Csv => "csv",
            TableFormat::Xlsx => "xlsx",
        }
    }
}

/// Lê uma tabela de qualquer formato suportado e retorna como matriz de
/// texto. Para workbooks (xlsx/xls/xlsb/ods), usa sempre a primeira aba.
fn read_table(input_path: &Path) -> Result<Vec<Vec<String>>> {
    let ext = input_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "csv" | "tsv" | "txt" => {
            let delimiter = if ext == "tsv" { b'\t' } else { b',' };
            let mut reader = ReaderBuilder::new()
                .delimiter(delimiter)
                .has_headers(false)
                .flexible(true)
                .from_path(input_path)
                .map_err(|e| anyhow!("Falha ao ler o arquivo: {e}"))?;

            let mut rows = Vec::new();
            for record in reader.records() {
                let record = record.map_err(|e| anyhow!("Falha ao ler linha: {e}"))?;
                rows.push(record.iter().map(|s| s.to_string()).collect());
            }
            Ok(rows)
        }
        _ => {
            let mut workbook = open_workbook_auto(input_path)
                .map_err(|e| anyhow!("Falha ao abrir a planilha: {e}"))?;
            let sheet_name = workbook
                .sheet_names()
                .first()
                .cloned()
                .ok_or_else(|| anyhow!("A planilha não tem nenhuma aba"))?;
            let range = workbook
                .worksheet_range(&sheet_name)
                .map_err(|e| anyhow!("Falha ao ler a aba '{sheet_name}': {e}"))?;

            Ok(range
                .rows()
                .map(|row| row.iter().map(cell_to_string).collect())
                .collect())
        }
    }
}

fn cell_to_string(cell: &Data) -> String {
    match cell {
        Data::Empty => String::new(),
        Data::String(s) => s.clone(),
        Data::Float(f) => {
            if f.fract() == 0.0 {
                format!("{}", *f as i64)
            } else {
                f.to_string()
            }
        }
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => b.to_string(),
        Data::DateTime(dt) => dt.to_string(),
        Data::DateTimeIso(s) | Data::DurationIso(s) => s.clone(),
        Data::Error(e) => format!("{e:?}"),
    }
}

fn save_as_csv(rows: &[Vec<String>], output_path: &Path) -> Result<()> {
    let mut writer = WriterBuilder::new()
        .from_path(output_path)
        .map_err(|e| anyhow!("Falha ao criar CSV: {e}"))?;
    for row in rows {
        writer
            .write_record(row)
            .map_err(|e| anyhow!("Falha ao escrever linha: {e}"))?;
    }
    writer
        .flush()
        .map_err(|e| anyhow!("Falha ao salvar CSV: {e}"))?;
    Ok(())
}

fn save_as_xlsx(rows: &[Vec<String>], output_path: &Path) -> Result<()> {
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();

    for (r, row) in rows.iter().enumerate() {
        for (c, value) in row.iter().enumerate() {
            let r = r as u32;
            let c = c as u16;
            if let Ok(n) = value.parse::<f64>() {
                sheet
                    .write_number(r, c, n)
                    .map_err(|e| anyhow!("Falha ao escrever célula: {e}"))?;
            } else {
                sheet
                    .write_string(r, c, value)
                    .map_err(|e| anyhow!("Falha ao escrever célula: {e}"))?;
            }
        }
    }

    workbook
        .save(output_path)
        .map_err(|e| anyhow!("Falha ao salvar XLSX: {e}"))?;
    Ok(())
}

pub fn convert_table(input_path: &str, output_dir: &str, target: &str) -> Result<String> {
    let input = Path::new(input_path);
    if !input.exists() {
        return Err(anyhow!("Arquivo de origem não encontrado: {input_path}"));
    }

    let target_format = TableFormat::from_str(target)?;
    let rows = read_table(input)?;

    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("arquivo_convertido");
    let ext = target_format.extension();
    let output_path = Path::new(output_dir).join(format!("{stem}-{ext}.{ext}"));

    match target_format {
        TableFormat::Csv => save_as_csv(&rows, &output_path)?,
        TableFormat::Xlsx => save_as_xlsx(&rows, &output_path)?,
    }

    Ok(output_path.to_string_lossy().to_string())
}

pub fn supported_target_formats() -> Vec<&'static str> {
    vec!["csv", "xlsx"]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join("arquivox_table_test");
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn converte_csv_para_xlsx_e_volta() {
        let dir = make_test_dir();
        let csv_path = dir.join("origem.csv");
        std::fs::write(&csv_path, "nome,idade\nAna,30\nBeto,25\n").unwrap();

        let xlsx_out = convert_table(csv_path.to_str().unwrap(), dir.to_str().unwrap(), "xlsx")
            .unwrap();
        assert!(Path::new(&xlsx_out).exists());

        let csv_back =
            convert_table(&xlsx_out, dir.to_str().unwrap(), "csv").unwrap();
        let content = std::fs::read_to_string(&csv_back).unwrap();
        assert!(content.contains("nome"));
        assert!(content.contains("Ana"));
        assert!(content.contains("30"));
    }
}
