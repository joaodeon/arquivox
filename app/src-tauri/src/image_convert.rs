use std::fs::File;
use std::io::BufWriter;
use std::path::Path;

use anyhow::{anyhow, Result};
use image::{DynamicImage, ImageFormat as ImgFormat};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TargetFormat {
    Jpg,
    Png,
    Webp,
    Tiff,
    Avif,
    Bmp,
    Pdf,
}

impl TargetFormat {
    fn from_str(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "jpg" | "jpeg" => Ok(TargetFormat::Jpg),
            "png" => Ok(TargetFormat::Png),
            "webp" => Ok(TargetFormat::Webp),
            "tiff" | "tif" => Ok(TargetFormat::Tiff),
            "avif" => Ok(TargetFormat::Avif),
            "bmp" => Ok(TargetFormat::Bmp),
            "pdf" => Ok(TargetFormat::Pdf),
            other => Err(anyhow!("Formato de destino não suportado: {other}")),
        }
    }

    fn extension(&self) -> &'static str {
        match self {
            TargetFormat::Jpg => "jpg",
            TargetFormat::Png => "png",
            TargetFormat::Webp => "webp",
            TargetFormat::Tiff => "tiff",
            TargetFormat::Avif => "avif",
            TargetFormat::Bmp => "bmp",
            TargetFormat::Pdf => "pdf",
        }
    }

    fn image_format(&self) -> Option<ImgFormat> {
        match self {
            TargetFormat::Jpg => Some(ImgFormat::Jpeg),
            TargetFormat::Png => Some(ImgFormat::Png),
            TargetFormat::Webp => Some(ImgFormat::WebP),
            TargetFormat::Tiff => Some(ImgFormat::Tiff),
            TargetFormat::Avif => Some(ImgFormat::Avif),
            TargetFormat::Bmp => Some(ImgFormat::Bmp),
            TargetFormat::Pdf => None,
        }
    }
}

/// Carrega a imagem de origem. SVG é rasterizado; HEIC ainda não é suportado
/// nesta versão (depende de um codec nativo do Windows, módulo futuro).
pub(crate) fn load_source_image(input_path: &Path) -> Result<DynamicImage> {
    let ext = input_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext == "svg" {
        return load_svg_as_image(input_path);
    }

    if ext == "heic" || ext == "heif" {
        return Err(anyhow!(
            "Conversão de HEIC ainda não implementada nesta versão. Será adicionada em uma atualização futura."
        ));
    }

    image::open(input_path).map_err(|e| anyhow!("Falha ao abrir a imagem de origem: {e}"))
}

fn load_svg_as_image(input_path: &Path) -> Result<DynamicImage> {
    let svg_data =
        std::fs::read(input_path).map_err(|e| anyhow!("Falha ao ler o arquivo SVG: {e}"))?;

    let opt = resvg::usvg::Options::default();
    let tree = resvg::usvg::Tree::from_data(&svg_data, &opt)
        .map_err(|e| anyhow!("Falha ao interpretar SVG: {e}"))?;

    let size = tree.size();
    let width = size.width().ceil().max(1.0) as u32;
    let height = size.height().ceil().max(1.0) as u32;

    let mut pixmap = resvg::tiny_skia::Pixmap::new(width, height)
        .ok_or_else(|| anyhow!("Dimensões de SVG inválidas"))?;

    resvg::render(
        &tree,
        resvg::tiny_skia::Transform::default(),
        &mut pixmap.as_mut(),
    );

    let rgba = pixmap.data().to_vec();
    let buffer = image::RgbaImage::from_raw(width, height, rgba)
        .ok_or_else(|| anyhow!("Falha ao converter pixels do SVG renderizado"))?;

    Ok(DynamicImage::ImageRgba8(buffer))
}

fn save_as_pdf(img: &DynamicImage, output_path: &Path) -> Result<()> {
    use printpdf::{ColorBits, ColorSpace, Image, ImageTransform, ImageXObject, Mm, PdfDocument, Px};

    const DPI: f32 = 96.0;
    let rgb = img.to_rgb8();
    let (px_w, px_h) = (rgb.width(), rgb.height());
    let width_mm = (px_w as f32 / DPI) * 25.4;
    let height_mm = (px_h as f32 / DPI) * 25.4;

    let (doc, page1, layer1) = PdfDocument::new(
        "arquivoX - Imagem",
        Mm(width_mm),
        Mm(height_mm),
        "Camada 1",
    );
    let layer = doc.get_page(page1).get_layer(layer1);

    let image_xobject = ImageXObject {
        width: Px(px_w as usize),
        height: Px(px_h as usize),
        color_space: ColorSpace::Rgb,
        bits_per_component: ColorBits::Bit8,
        interpolate: true,
        image_data: rgb.into_raw(),
        image_filter: None,
        clipping_bbox: None,
    };

    let pdf_image: Image = image_xobject.into();
    pdf_image.add_to_layer(
        layer,
        ImageTransform {
            translate_x: Some(Mm(0.0)),
            translate_y: Some(Mm(0.0)),
            dpi: Some(DPI),
            ..Default::default()
        },
    );

    doc.save(&mut BufWriter::new(
        File::create(output_path).map_err(|e| anyhow!("Falha ao criar PDF: {e}"))?,
    ))
    .map_err(|e| anyhow!("Falha ao salvar PDF: {e}"))?;

    Ok(())
}

/// Converte um arquivo de imagem para o formato de destino.
/// Retorna o caminho completo do arquivo de saída.
pub fn convert_image(input_path: &str, output_dir: &str, target: &str) -> Result<String> {
    let input = Path::new(input_path);
    if !input.exists() {
        return Err(anyhow!("Arquivo de origem não encontrado: {input_path}"));
    }

    let target_format = TargetFormat::from_str(target)?;
    let img = load_source_image(input)?;

    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("arquivo_convertido");

    let ext = target_format.extension();
    let output_path = Path::new(output_dir).join(format!("{stem}-{ext}.{ext}"));

    if target_format == TargetFormat::Pdf {
        save_as_pdf(&img, &output_path)?;
    } else {
        let fmt = target_format
            .image_format()
            .ok_or_else(|| anyhow!("Formato de destino inválido"))?;
        img.save_with_format(&output_path, fmt)
            .map_err(|e| anyhow!("Falha ao salvar imagem convertida: {e}"))?;
    }

    Ok(output_path.to_string_lossy().to_string())
}

pub fn supported_target_formats() -> Vec<&'static str> {
    vec!["jpg", "png", "webp", "tiff", "avif", "bmp", "pdf"]
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage};

    fn make_test_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join("arquivox_test");
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn make_test_png(dir: &Path) -> std::path::PathBuf {
        let mut img = RgbImage::new(64, 64);
        for (x, y, px) in img.enumerate_pixels_mut() {
            *px = Rgb([x as u8 * 4, y as u8 * 4, 128]);
        }
        let path = dir.join("origem.png");
        img.save(&path).unwrap();
        path
    }

    #[test]
    fn converte_png_para_todos_os_formatos_de_imagem() {
        let dir = make_test_dir();
        let src = make_test_png(&dir);

        for fmt in ["jpg", "webp", "tiff", "avif", "bmp"] {
            let out = convert_image(src.to_str().unwrap(), dir.to_str().unwrap(), fmt)
                .unwrap_or_else(|e| panic!("falhou convertendo para {fmt}: {e}"));
            assert!(Path::new(&out).exists(), "arquivo de saída não existe: {out}");
            let metadata = std::fs::metadata(&out).unwrap();
            assert!(metadata.len() > 0, "arquivo de saída vazio: {out}");
        }
    }

    #[test]
    fn converte_png_para_pdf() {
        let dir = make_test_dir();
        let src = make_test_png(&dir);

        let out = convert_image(src.to_str().unwrap(), dir.to_str().unwrap(), "pdf").unwrap();
        assert!(Path::new(&out).exists());
        let bytes = std::fs::read(&out).unwrap();
        assert!(bytes.starts_with(b"%PDF"), "arquivo não parece ser um PDF válido");
    }

    #[test]
    fn converte_svg_para_png() {
        let dir = make_test_dir();
        let svg_path = dir.join("origem.svg");
        std::fs::write(
            &svg_path,
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="purple"/></svg>"#,
        )
        .unwrap();

        let out = convert_image(svg_path.to_str().unwrap(), dir.to_str().unwrap(), "png").unwrap();
        assert!(Path::new(&out).exists());
        let decoded = image::open(&out).unwrap();
        assert_eq!(decoded.width(), 100);
        assert_eq!(decoded.height(), 100);
    }

    #[test]
    fn rejeita_heic_com_mensagem_clara() {
        let dir = make_test_dir();
        let heic_path = dir.join("origem.heic");
        std::fs::write(&heic_path, b"dummy").unwrap();

        let err = convert_image(heic_path.to_str().unwrap(), dir.to_str().unwrap(), "png")
            .unwrap_err();
        assert!(err.to_string().contains("HEIC"));
    }
}
