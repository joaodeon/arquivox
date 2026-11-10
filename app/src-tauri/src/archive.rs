//! Compactação ZIP (menu Ctrl da roda, para um ou mais arquivos
//! selecionados no Explorer/Área de Trabalho). Implementação 100% nativa,
//! sem depender de nenhum programa externo instalado na máquina.

use std::fs::File;
use std::io::BufReader;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, Result};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

/// Nome do .zip gerado: "Compactado_AAAA-MM-DD_HH-MM-SS.zip", baseado na
/// data/hora local no momento da compactação. Como pode haver qualquer
/// quantidade de arquivos de origem com nomes diferentes, não existe um
/// "nome do arquivo" óbvio para herdar — a data/hora é sempre única,
/// legível e ordena os arquivos cronologicamente na pasta. Em caso de
/// colisão (duas compactações no mesmo segundo), acrescenta um sufixo
/// numérico.
fn unique_archive_path(output_dir: &str) -> PathBuf {
    let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let base = format!("Compactado_{timestamp}");

    let mut candidate = Path::new(output_dir).join(format!("{base}.zip"));
    let mut counter = 1;
    while candidate.exists() {
        candidate = Path::new(output_dir).join(format!("{base} ({counter}).zip"));
        counter += 1;
    }
    candidate
}

/// Compacta um ou mais arquivos em um único .zip (compressão padrão).
pub fn zip_files(input_paths: &[String], output_dir: &str) -> Result<Vec<String>> {
    if input_paths.is_empty() {
        return Err(anyhow!("Nenhum arquivo selecionado"));
    }
    let paths: Vec<PathBuf> = input_paths.iter().map(PathBuf::from).collect();

    for p in &paths {
        if !p.exists() {
            return Err(anyhow!("Arquivo não encontrado: {}", p.display()));
        }
        if p.is_dir() {
            return Err(anyhow!(
                "Pastas não são suportadas nesta versão, apenas arquivos: {}",
                p.display()
            ));
        }
    }

    let output_path = unique_archive_path(output_dir);

    let file = File::create(&output_path).map_err(|e| anyhow!("Falha ao criar ZIP: {e}"))?;
    let mut writer = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    // Nomes duplicados (arquivos de mesmo nome em pastas diferentes, por
    // exemplo) recebem um sufixo numérico para não se sobreporem dentro
    // do arquivo compactado.
    let mut used_names = std::collections::HashSet::new();
    for p in &paths {
        let original_name = p
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| anyhow!("Nome de arquivo inválido: {}", p.display()))?
            .to_string();

        let mut name = original_name.clone();
        let mut counter = 1;
        while !used_names.insert(name.clone()) {
            let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("arquivo");
            let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
            name = if ext.is_empty() {
                format!("{stem} ({counter})")
            } else {
                format!("{stem} ({counter}).{ext}")
            };
            counter += 1;
        }

        writer
            .start_file(&name, options)
            .map_err(|e| anyhow!("Falha ao adicionar {name} ao ZIP: {e}"))?;
        let mut f = BufReader::new(
            File::open(p).map_err(|e| anyhow!("Falha ao ler {original_name}: {e}"))?,
        );
        std::io::copy(&mut f, &mut writer)
            .map_err(|e| anyhow!("Falha ao compactar {original_name}: {e}"))?;
    }

    writer
        .finish()
        .map_err(|e| anyhow!("Falha ao finalizar ZIP: {e}"))?;

    Ok(vec![output_path.to_string_lossy().to_string()])
}

#[cfg(test)]
mod tests {
    use super::*;

    // Cada teste usa sua própria subpasta. Os testes rodam em paralelo por
    // padrão, e como o nome do .zip agora tem só precisão de segundo
    // (data/hora), testes compartilhando uma pasta podiam gerar o mesmo
    // nome candidato ao mesmo tempo e colidir — um problema só do arranjo
    // de testes, não da lógica de produção (duas chamadas sequenciais no
    // mesmo processo, como o usuário realmente faz, já são protegidas
    // pelo loop de `unique_archive_path`).
    fn make_test_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("arquivox_archive_test_{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn zipa_varios_arquivos_em_um_so() {
        let dir = make_test_dir("varios");
        let a = dir.join("a.txt");
        let b = dir.join("b.txt");
        std::fs::write(&a, b"conteudo a").unwrap();
        std::fs::write(&b, b"conteudo b").unwrap();

        let inputs = vec![
            a.to_str().unwrap().to_string(),
            b.to_str().unwrap().to_string(),
        ];
        let outputs = zip_files(&inputs, dir.to_str().unwrap()).unwrap();
        assert_eq!(outputs.len(), 1);
        assert!(Path::new(&outputs[0]).exists());

        // Confirma que é mesmo um ZIP válido contendo os dois arquivos.
        let file = File::open(&outputs[0]).unwrap();
        let archive = zip::ZipArchive::new(file).unwrap();
        assert_eq!(archive.len(), 2);
    }

    #[test]
    fn zipa_um_unico_arquivo() {
        let dir = make_test_dir("unico");
        let a = dir.join("solo.txt");
        std::fs::write(&a, b"conteudo").unwrap();

        let outputs = zip_files(&[a.to_str().unwrap().to_string()], dir.to_str().unwrap()).unwrap();
        assert_eq!(outputs.len(), 1);
        let name = Path::new(&outputs[0]).file_name().unwrap().to_str().unwrap();
        assert!(name.starts_with("Compactado_"), "nome inesperado: {name}");
        assert!(name.ends_with(".zip"));
    }

    #[test]
    fn evita_sobrescrever_zip_existente_no_mesmo_segundo() {
        let dir = make_test_dir("colisao");
        let a = dir.join("x.txt");
        std::fs::write(&a, b"conteudo").unwrap();

        let first = zip_files(&[a.to_str().unwrap().to_string()], dir.to_str().unwrap()).unwrap();
        let second = zip_files(&[a.to_str().unwrap().to_string()], dir.to_str().unwrap()).unwrap();

        assert_ne!(first[0], second[0], "a segunda compactação não pode sobrescrever a primeira");
        assert!(Path::new(&first[0]).exists());
        assert!(Path::new(&second[0]).exists());
    }

    #[test]
    fn renomeia_arquivos_duplicados_dentro_do_zip() {
        let dir = make_test_dir("duplicados");
        let sub1 = dir.join("sub1");
        let sub2 = dir.join("sub2");
        std::fs::create_dir_all(&sub1).unwrap();
        std::fs::create_dir_all(&sub2).unwrap();
        std::fs::write(sub1.join("mesmo-nome.txt"), b"a").unwrap();
        std::fs::write(sub2.join("mesmo-nome.txt"), b"b").unwrap();

        let inputs = vec![
            sub1.join("mesmo-nome.txt").to_str().unwrap().to_string(),
            sub2.join("mesmo-nome.txt").to_str().unwrap().to_string(),
        ];
        let outputs = zip_files(&inputs, dir.to_str().unwrap()).unwrap();
        let file = File::open(&outputs[0]).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        assert_eq!(archive.len(), 2);
        assert!(archive.by_name("mesmo-nome.txt").is_ok());
        assert!(archive.by_name("mesmo-nome (1).txt").is_ok());
    }
}
