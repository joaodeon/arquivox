use std::path::Path;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let svg_path = &args[1];
    let out_path = &args[2];

    let svg_data = std::fs::read(svg_path).expect("falha ao ler SVG");
    let opt = resvg::usvg::Options::default();
    let tree = resvg::usvg::Tree::from_data(&svg_data, &opt).expect("falha ao interpretar SVG");

    let size = tree.size();
    let width = size.width().ceil() as u32;
    let height = size.height().ceil() as u32;

    let mut pixmap = resvg::tiny_skia::Pixmap::new(width, height).expect("tamanho inválido");
    resvg::render(&tree, resvg::tiny_skia::Transform::default(), &mut pixmap.as_mut());

    pixmap.save_png(Path::new(out_path)).expect("falha ao salvar PNG");
    println!("ok: {out_path} ({width}x{height})");
}
