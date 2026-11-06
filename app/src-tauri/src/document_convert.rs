//! Conversão de documentos de texto (Word, LibreOffice Writer, PDF, RTF,
//! TXT, Markdown). Motor: LibreOffice instalado na máquina, chamado em
//! modo headless (`soffice --headless --convert-to ...`). Não existe
//! biblioteca Rust que converta esses formatos preservando formatação sem
//! depender de um programa externo — diferente do resto do app, este
//! módulo só funciona se o LibreOffice estiver instalado, e falha com uma
//! mensagem clara quando não está.
//!
//! Duas limitações conhecidas, verificadas empiricamente nesta versão do
//! LibreOffice, por isso não oferecidas:
//! - PDF como arquivo de ORIGEM: a importação de PDF para formato editável
//!   corrompe acentuação (dupla codificação UTF-8) e duplica conteúdo em
//!   caixas de texto. PDF continua disponível como formato de DESTINO.
//! - Markdown (.md): o filtro de exportação do LibreOffice gera arquivo
//!   vazio, e a importação não interpreta a sintaxe (trata `#`/`**` como
//!   texto literal). Por isso `.md` só converte de/para `.txt` (cópia de
//!   conteúdo, já que markdown é texto puro válido), nunca para/de
//!   DOCX/DOC/ODT/RTF/PDF com formatação real.

use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{anyhow, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DocumentFormat {
    Docx,
    Doc,
    Odt,
    Rtf,
    Txt,
    Pdf,
    Md,
}

impl DocumentFormat {
    fn from_str(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "docx" => Ok(DocumentFormat::Docx),
            "doc" => Ok(DocumentFormat::Doc),
            "odt" => Ok(DocumentFormat::Odt),
            "rtf" => Ok(DocumentFormat::Rtf),
            "txt" => Ok(DocumentFormat::Txt),
            "pdf" => Ok(DocumentFormat::Pdf),
            "md" => Ok(DocumentFormat::Md),
            other => Err(anyhow!("Formato de destino não suportado: {other}")),
        }
    }

    fn extension(&self) -> &'static str {
        match self {
            DocumentFormat::Docx => "docx",
            DocumentFormat::Doc => "doc",
            DocumentFormat::Odt => "odt",
            DocumentFormat::Rtf => "rtf",
            DocumentFormat::Txt => "txt",
            DocumentFormat::Pdf => "pdf",
            DocumentFormat::Md => "md",
        }
    }

    /// Nome de filtro explícito do LibreOffice. Necessário quando o nome
    /// do formato é ambíguo (ex: "doc" sozinho não diz se é o legado do
    /// Word 97 ou outra variante), ou quando o filtro padrão tem um
    /// comportamento errado — o filtro "Text" puro exporta na codificação
    /// do sistema (Windows-1252 nesta máquina), corrompendo acentuação;
    /// "Text (encoded):UTF8" força UTF-8, consistente com o resto do app.
    fn export_filter(&self) -> Option<&'static str> {
        match self {
            DocumentFormat::Doc => Some("MS Word 97"),
            DocumentFormat::Txt => Some("Text (encoded):UTF8"),
            _ => None,
        }
    }
}

pub fn supported_target_formats() -> Vec<&'static str> {
    vec!["docx", "doc", "odt", "rtf", "txt", "pdf", "md"]
}

pub fn is_engine_available() -> bool {
    find_libreoffice().is_some()
}

fn find_libreoffice() -> Option<PathBuf> {
    const CANDIDATES: &[&str] = &[
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ];
    CANDIDATES
        .iter()
        .map(PathBuf::from)
        .find(|p| p.exists())
}

/// Converte um documento de texto para o formato de destino. Retorna o
/// caminho completo do arquivo gerado.
pub fn convert_document(input_path: &str, output_dir: &str, target: &str) -> Result<String> {
    let input = Path::new(input_path);
    if !input.exists() {
        return Err(anyhow!("Arquivo de origem não encontrado: {input_path}"));
    }

    let source_ext = input
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let target_format = DocumentFormat::from_str(target)?;

    // Markdown só tem conversão real (sem perda, sem inventar formatação)
    // de/para texto puro — ver limitações no topo do arquivo.
    if source_ext == "md" || target_format == DocumentFormat::Md {
        return convert_plain_text(input, &source_ext, output_dir, target_format);
    }

    if source_ext == "pdf" {
        return Err(anyhow!(
            "Conversão a partir de PDF não é suportada nesta versão: a importação de PDF \
             corrompe acentuação e duplica conteúdo neste motor. PDF continua disponível \
             como formato de destino."
        ));
    }

    let soffice = find_libreoffice().ok_or_else(|| {
        anyhow!(
            "LibreOffice não encontrado nesta máquina. Instale o LibreOffice \
             (https://www.libreoffice.org/) para converter documentos de texto."
        )
    })?;

    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("arquivo_convertido");
    let ext = target_format.extension();
    let final_path = Path::new(output_dir).join(format!("{stem}-{ext}.{ext}"));

    // O LibreOffice escolhe o nome de saída sozinho (stem original + nova
    // extensão) e não deixa escolher outro — por isso convertemos para uma
    // pasta temporária isolada e depois movemos/renomeamos pro nome final
    // no padrão do resto do app (evita qualquer colisão com um arquivo já
    // existente na pasta de destino, e evita sobrescrever o original
    // quando a extensão de origem e destino coincidem).
    let temp_dir = std::env::temp_dir().join(format!(
        "arquivox_doc_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| anyhow!("Falha ao preparar conversão: {e}"))?;

    let convert_to_arg = match target_format.export_filter() {
        Some(filter) => format!("{ext}:{filter}"),
        None => ext.to_string(),
    };

    let output = Command::new(&soffice)
        .arg("--headless")
        .arg("--convert-to")
        .arg(&convert_to_arg)
        .arg("--outdir")
        .arg(&temp_dir)
        .arg(input)
        .output()
        .map_err(|e| anyhow!("Falha ao executar o LibreOffice: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Err(anyhow!("LibreOffice falhou ao converter: {stderr}"));
    }

    let generated = temp_dir.join(format!("{stem}.{ext}"));
    if !generated.exists() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Err(anyhow!(
            "A conversão não produziu o arquivo esperado. Saída do LibreOffice: {stdout}"
        ));
    }

    std::fs::rename(&generated, &final_path)
        .or_else(|_| std::fs::copy(&generated, &final_path).map(|_| ()))
        .map_err(|e| anyhow!("Falha ao mover o arquivo convertido: {e}"))?;
    let _ = std::fs::remove_dir_all(&temp_dir);

    if target_format == DocumentFormat::Txt {
        strip_utf8_bom(&final_path)?;
    }

    Ok(final_path.to_string_lossy().to_string())
}

/// O filtro "Text (encoded):UTF8" do LibreOffice grava um BOM (marca de
/// ordem de bytes) no início do arquivo. É tecnicamente válido, mas
/// aparece como caractere estranho em alguns editores — removido aqui
/// pra manter o .txt gerado idêntico ao que se espera de um TXT comum.
fn strip_utf8_bom(path: &Path) -> Result<()> {
    const BOM: [u8; 3] = [0xEF, 0xBB, 0xBF];
    let bytes = std::fs::read(path).map_err(|e| anyhow!("Falha ao ler arquivo gerado: {e}"))?;
    if bytes.starts_with(&BOM) {
        std::fs::write(path, &bytes[BOM.len()..])
            .map_err(|e| anyhow!("Falha ao limpar arquivo gerado: {e}"))?;
    }
    Ok(())
}

fn convert_plain_text(
    input: &Path,
    source_ext: &str,
    output_dir: &str,
    target_format: DocumentFormat,
) -> Result<String> {
    let source_is_plain_text = source_ext == "md" || source_ext == "txt";
    let target_is_plain_text =
        target_format == DocumentFormat::Md || target_format == DocumentFormat::Txt;

    if !source_is_plain_text || !target_is_plain_text {
        return Err(anyhow!(
            "Markdown (.md) só converte de/para texto puro (.txt) nesta versão: o filtro de \
             formatação do LibreOffice para Markdown não funciona de forma confiável \
             (exportação gera arquivo vazio, importação não interpreta a sintaxe)."
        ));
    }

    let content =
        std::fs::read_to_string(input).map_err(|e| anyhow!("Falha ao ler o arquivo: {e}"))?;
    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("arquivo_convertido");
    let ext = target_format.extension();
    let output_path = Path::new(output_dir).join(format!("{stem}-{ext}.{ext}"));
    std::fs::write(&output_path, content)
        .map_err(|e| anyhow!("Falha ao salvar o arquivo: {e}"))?;

    Ok(output_path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("arquivox_document_test_{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    // Os testes que dependem do LibreOffice só rodam de verdade se ele
    // estiver instalado na máquina que compila/testa o projeto - são
    // pulados (não falham) quando não está, já que esse é um requisito
    // externo explícito deste módulo, não um bug a ser corrigido em CI.

    #[test]
    fn converte_txt_para_docx_e_volta_se_libreoffice_disponivel() {
        if !is_engine_available() {
            eprintln!("LibreOffice não encontrado, pulando teste");
            return;
        }

        let dir = make_test_dir("roundtrip");
        let txt_path = dir.join("origem.txt");
        std::fs::write(&txt_path, "Conteúdo de teste em português, com acentuação.").unwrap();

        let docx_out =
            convert_document(txt_path.to_str().unwrap(), dir.to_str().unwrap(), "docx").unwrap();
        assert!(Path::new(&docx_out).exists());

        let txt_back = convert_document(&docx_out, dir.to_str().unwrap(), "txt").unwrap();
        let content = std::fs::read_to_string(&txt_back).unwrap();
        assert!(content.contains("Conteúdo de teste"));
    }

    #[test]
    fn rejeita_pdf_como_origem_com_mensagem_clara() {
        let dir = make_test_dir("pdf_source");
        let fake_pdf = dir.join("origem.pdf");
        std::fs::write(&fake_pdf, b"%PDF-1.4 conteudo falso").unwrap();

        let err = convert_document(fake_pdf.to_str().unwrap(), dir.to_str().unwrap(), "docx")
            .unwrap_err();
        assert!(err.to_string().contains("PDF"));
    }

    #[test]
    fn markdown_converte_para_e_de_txt() {
        let dir = make_test_dir("markdown");
        let md_path = dir.join("origem.md");
        std::fs::write(&md_path, "# Título\n\nTexto.").unwrap();

        let txt_out =
            convert_document(md_path.to_str().unwrap(), dir.to_str().unwrap(), "txt").unwrap();
        assert!(Path::new(&txt_out).exists());

        let md_back =
            convert_document(&txt_out, dir.to_str().unwrap(), "md").unwrap();
        let content = std::fs::read_to_string(&md_back).unwrap();
        assert!(content.contains("Título"));
    }

    #[test]
    fn markdown_rejeita_conversao_com_formatacao_real() {
        let dir = make_test_dir("markdown_rich");
        let md_path = dir.join("origem.md");
        std::fs::write(&md_path, "# Título\n\nTexto.").unwrap();

        let err = convert_document(md_path.to_str().unwrap(), dir.to_str().unwrap(), "docx")
            .unwrap_err();
        assert!(err.to_string().contains("Markdown"));
    }
}
