//! Compactação de arquivos (menu Ctrl da roda, quando o que é arrastado
//! são vários arquivos — ou um único arquivo que não é imagem; uma única
//! imagem continua indo para o menu de ferramentas de imagem já existente).
//!
//! Duas opções: "ZIP" (compressão padrão, sempre disponível, sem depender
//! de nenhum programa externo instalado) e "Compactar" — que reaproveita
//! a ferramenta de compressão de imagem já existente quando todos os
//! arquivos selecionados são imagens, ou cai para um ZIP com compressão
//! máxima caso contrário.

use std::fs::File;
use std::io::BufReader;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, Result};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::image_tools;

fn archive_base_name(input_paths: &[PathBuf]) -> String {
    if input_paths.len() == 1 {
        input_paths[0]
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("arquivo")
            .to_string()
    } else {
        input_paths[0]
            .parent()
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str())
            .unwrap_or("arquivos")
            .to_string()
    }
}

fn write_zip(input_paths: &[PathBuf], output_path: &Path, max_compression: bool) -> Result<()> {
    for p in input_paths {
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

    let file = File::create(output_path).map_err(|e| anyhow!("Falha ao criar ZIP: {e}"))?;
    let mut writer = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .compression_level(if max_compression { Some(9) } else { None });

    // Nomes duplicados (arquivos de mesmo nome em pastas diferentes, por
    // exemplo) recebem um sufixo numérico para não se sobreporem dentro
    // do arquivo compactado.
    let mut used_names = std::collections::HashSet::new();
    for p in input_paths {
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
    Ok(())
}

/// Compacta um ou mais arquivos em um único .zip (compressão padrão).
pub fn zip_files(input_paths: &[String], output_dir: &str) -> Result<Vec<String>> {
    if input_paths.is_empty() {
        return Err(anyhow!("Nenhum arquivo selecionado"));
    }
    let paths: Vec<PathBuf> = input_paths.iter().map(PathBuf::from).collect();
    let base = archive_base_name(&paths);
    let output_path = Path::new(output_dir).join(format!("{base}-zip.zip"));
    write_zip(&paths, &output_path, false)?;
    Ok(vec![output_path.to_string_lossy().to_string()])
}

fn is_image_ext(p: &Path) -> bool {
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    matches!(
        ext.as_str(),
        "jpg" | "jpeg" | "png" | "webp" | "tiff" | "tif" | "avif" | "bmp"
    )
}

/// "Compactar": se todos os arquivos selecionados forem imagens, reduz
/// cada uma individualmente (a mesma lógica usada para uma imagem só).
/// Caso contrário, compacta tudo em um .zip com compressão máxima.
pub fn compact_files(input_paths: &[String], output_dir: &str) -> Result<Vec<String>> {
    if input_paths.is_empty() {
        return Err(anyhow!("Nenhum arquivo selecionado"));
    }
    let paths: Vec<PathBuf> = input_paths.iter().map(PathBuf::from).collect();

    if paths.iter().all(|p| is_image_ext(p)) {
        let mut outputs = Vec::with_capacity(paths.len());
        for p in &paths {
            let path_str = p
                .to_str()
                .ok_or_else(|| anyhow!("Caminho de arquivo inválido: {}", p.display()))?;
            outputs.push(image_tools::compress_image(path_str, output_dir)?);
        }
        Ok(outputs)
    } else {
        let base = archive_base_name(&paths);
        let output_path = Path::new(output_dir).join(format!("{base}-compactado.zip"));
        write_zip(&paths, &output_path, true)?;
        Ok(vec![output_path.to_string_lossy().to_string()])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join("arquivox_archive_test");
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn zipa_varios_arquivos_em_um_so() {
        let dir = make_test_dir();
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
        let mut archive = zip::ZipArchive::new(file).unwrap();
        assert_eq!(archive.len(), 2);
    }

    #[test]
    fn compacta_varias_imagens_individualmente() {
        use image::{Rgb, RgbImage};

        let dir = make_test_dir();
        for name in ["foto1.png", "foto2.png"] {
            let mut img = RgbImage::new(32, 32);
            for (x, y, px) in img.enumerate_pixels_mut() {
                *px = Rgb([x as u8 * 4, y as u8 * 4, 50]);
            }
            img.save(dir.join(name)).unwrap();
        }

        let inputs = vec![
            dir.join("foto1.png").to_str().unwrap().to_string(),
            dir.join("foto2.png").to_str().unwrap().to_string(),
        ];
        let outputs = compact_files(&inputs, dir.to_str().unwrap()).unwrap();
        assert_eq!(outputs.len(), 2, "cada imagem deve virar um arquivo próprio");
        for out in &outputs {
            assert!(Path::new(out).exists());
        }
    }

    #[test]
    fn compacta_arquivos_mistos_como_zip_maximo() {
        let dir = make_test_dir();
        std::fs::write(dir.join("doc.txt"), b"texto").unwrap();
        std::fs::write(dir.join("dados.csv"), b"a,b\n1,2\n").unwrap();

        let inputs = vec![
            dir.join("doc.txt").to_str().unwrap().to_string(),
            dir.join("dados.csv").to_str().unwrap().to_string(),
        ];
        let outputs = compact_files(&inputs, dir.to_str().unwrap()).unwrap();
        assert_eq!(outputs.len(), 1, "arquivos não-imagem devem virar um único ZIP");
        assert!(outputs[0].ends_with(".zip"));
    }
}
