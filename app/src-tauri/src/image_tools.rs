//! Ferramentas rápidas de imagem (menu Ctrl da roda): comprimir, girar,
//! espelhar e remover metadados. Pensadas para ações de "um clique só",
//! sem parâmetros extra, já que a roda radial não tem como pedir valores.

use std::path::Path;

use anyhow::{anyhow, Result};
use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, ExtendedColorType, ImageEncoder, ImageFormat};

use crate::image_convert::load_source_image;

fn original_format_or_png(input_path: &Path) -> ImageFormat {
    ImageFormat::from_path(input_path).unwrap_or(ImageFormat::Png)
}

fn save_like_original(
    img: &DynamicImage,
    input_path: &Path,
    output_dir: &str,
    suffix: &str,
) -> Result<String> {
    let stem = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("arquivo");
    let fmt = original_format_or_png(input_path);
    let ext = fmt.extensions_str().first().copied().unwrap_or("png");

    let output_path = Path::new(output_dir).join(format!("{stem}-{suffix}.{ext}"));
    img.save_with_format(&output_path, fmt)
        .map_err(|e| anyhow!("Falha ao salvar: {e}"))?;
    Ok(output_path.to_string_lossy().to_string())
}

/// Reduz o tamanho do arquivo. Imagens com transparência continuam em PNG
/// (não dá pra comprimir com perdas sem perder o canal alfa); as demais
/// viram JPEG com qualidade reduzida, que é onde a compressão realmente
/// aparece.
pub fn compress_image(input_path: &str, output_dir: &str) -> Result<String> {
    let input = Path::new(input_path);
    let img = load_source_image(input)?;
    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("arquivo");

    if img.color().has_alpha() {
        let output_path = Path::new(output_dir).join(format!("{stem}-comprimido.png"));
        img.save_with_format(&output_path, ImageFormat::Png)
            .map_err(|e| anyhow!("Falha ao comprimir: {e}"))?;
        Ok(output_path.to_string_lossy().to_string())
    } else {
        let output_path = Path::new(output_dir).join(format!("{stem}-comprimido.jpg"));
        let rgb = img.to_rgb8();
        let mut file = std::fs::File::create(&output_path)
            .map_err(|e| anyhow!("Falha ao criar arquivo: {e}"))?;
        JpegEncoder::new_with_quality(&mut file, 65)
            .write_image(rgb.as_raw(), rgb.width(), rgb.height(), ExtendedColorType::Rgb8)
            .map_err(|e| anyhow!("Falha ao comprimir: {e}"))?;
        Ok(output_path.to_string_lossy().to_string())
    }
}

/// Gira a imagem 90° no sentido horário ou anti-horário.
pub fn rotate_image(input_path: &str, output_dir: &str, clockwise: bool) -> Result<String> {
    let input = Path::new(input_path);
    let img = load_source_image(input)?;
    let rotated = if clockwise { img.rotate90() } else { img.rotate270() };
    save_like_original(&rotated, input, output_dir, "girado")
}

/// Espelha a imagem horizontalmente.
pub fn flip_image(input_path: &str, output_dir: &str) -> Result<String> {
    let input = Path::new(input_path);
    let img = load_source_image(input)?;
    save_like_original(&img.fliph(), input, output_dir, "espelhado")
}

/// Regrava a imagem sem metadados (EXIF, GPS, etc). Como o decodificador já
/// não preserva esses dados ao reconstruir a imagem, isso já acontece por
/// padrão em qualquer conversão — aqui só deixamos explícito como uma ação
/// própria, preservando o restante igual ao original.
pub fn strip_metadata(input_path: &str, output_dir: &str) -> Result<String> {
    let input = Path::new(input_path);
    let img = load_source_image(input)?;
    save_like_original(&img, input, output_dir, "sem-metadados")
}
