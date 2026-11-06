//! Gera os arquivos de exemplo em `exemplos/` (um por formato de entrada
//! suportado pelo app), para teste manual de cada conversão.

use std::path::Path;

use image::{ImageFormat, Rgb, RgbImage};

fn make_gradient() -> RgbImage {
    let (w, h) = (320, 200);
    let mut img = RgbImage::new(w, h);
    for (x, y, px) in img.enumerate_pixels_mut() {
        let r = (x as f32 / w as f32 * 255.0) as u8;
        let g = (y as f32 / h as f32 * 255.0) as u8;
        *px = Rgb([r, g, 148]);
    }
    img
}

fn main() {
    let out_dir = Path::new("../../exemplos");
    std::fs::create_dir_all(out_dir).expect("falha ao criar pasta exemplos");

    let img = make_gradient();

    for (ext, fmt) in [
        ("jpg", ImageFormat::Jpeg),
        ("png", ImageFormat::Png),
        ("webp", ImageFormat::WebP),
        ("tiff", ImageFormat::Tiff),
        ("avif", ImageFormat::Avif),
        ("bmp", ImageFormat::Bmp),
    ] {
        let path = out_dir.join(format!("exemplo-imagem.{ext}"));
        img.save_with_format(&path, fmt)
            .unwrap_or_else(|e| panic!("falha ao salvar {ext}: {e}"));
        println!("ok: {}", path.display());
    }

    // XLSX com algumas linhas de dados reais, para a conversão de
    // planilha ter algo para mostrar além de células vazias.
    let mut wb = rust_xlsxwriter::Workbook::new();
    let sheet = wb.add_worksheet();
    sheet.write_string(0, 0, "nome").unwrap();
    sheet.write_string(0, 1, "cargo").unwrap();
    sheet.write_string(0, 2, "ano_ingresso").unwrap();
    let rows = [
        ("Ana Souza", "Analista Judiciário", 2019),
        ("Bruno Lima", "Técnico Judiciário", 2021),
        ("Carla Dias", "Assessora", 2017),
    ];
    for (i, (nome, cargo, ano)) in rows.iter().enumerate() {
        let r = (i + 1) as u32;
        sheet.write_string(r, 0, *nome).unwrap();
        sheet.write_string(r, 1, *cargo).unwrap();
        sheet.write_number(r, 2, *ano as f64).unwrap();
    }
    let xlsx_path = out_dir.join("exemplo-planilha.xlsx");
    wb.save(&xlsx_path).expect("falha ao salvar xlsx");
    println!("ok: {}", xlsx_path.display());
}
