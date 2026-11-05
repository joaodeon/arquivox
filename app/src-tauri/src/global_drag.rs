//! Observador global (apenas Windows). A janela oculta da roda radial
//! acompanha o cursor SOMENTE durante um clique-e-arrasto real: botão
//! esquerdo do mouse pressionado, cursor efetivamente deslocado um pouco
//! em relação a onde o botão foi pressionado, E (Shift ou Ctrl) também
//! pressionado. O resto do tempo a roda fica estacionada fora de qualquer
//! monitor. Quando ela está "no ar" e o usuário arrasta um arquivo por
//! cima, o próprio mecanismo nativo de drag-and-drop do Windows (OLE)
//! entrega o arrasto para ela normalmente — reaproveitando a mesma lógica
//! usada dentro do app (módulo 2).
//!
//! A exigência de deslocamento mínimo existe porque um clique parado com
//! Ctrl ou Shift pressionado é exatamente o gesto de seleção múltipla do
//! Explorer (Ctrl+clique, Shift+clique) — sem essa checagem, a roda surgia
//! a cada clique de seleção, atrapalhando o próprio gesto que o usuário
//! precisa fazer antes de arrastar vários arquivos.
//!
//! O estado do botão do mouse, das teclas e do cursor é obtido por
//! CONSULTA direta (`GetAsyncKeyState`/`GetCursorPos`) a cada ciclo, em vez
//! de hooks baseados em evento. Hooks de baixo nível podem perder
//! mensagens de tecla solta — isso é especialmente comum durante um
//! drag-and-drop do Windows, que usa Ctrl/Shift internamente para
//! alternar entre copiar/mover, e isso deixava nosso estado interno
//! "travado" como pressionado mesmo depois da tecla ser solta de verdade.
//! Consultar o estado real a cada ciclo nunca fica dessincronizado, porque
//! não depende de nenhuma notificação chegar.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition};
use windows::Win32::Foundation::{HWND, POINT};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_CONTROL, VK_LBUTTON, VK_SHIFT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE,
    SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_EX_TRANSPARENT,
};

// Verdadeiro depois que a roda já foi ancorada num ponto fixo para a
// pressão atual de um modificador. Evita reposicionar a cada ciclo — sem
// isso, o centro da roda ficava sempre grudado no cursor e nunca dava pra
// "sair" até uma fatia.
static ANCHORED: AtomicBool = AtomicBool::new(false);

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

fn key_is_down(vk: i32) -> bool {
    unsafe { (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 }
}

fn shift_is_down() -> bool {
    key_is_down(VK_SHIFT.0 as i32)
}

fn ctrl_is_down() -> bool {
    key_is_down(VK_CONTROL.0 as i32)
}

fn left_mouse_is_down() -> bool {
    key_is_down(VK_LBUTTON.0 as i32)
}

fn cursor_pos() -> (i32, i32) {
    let mut pt = POINT::default();
    let ok = unsafe { GetCursorPos(&mut pt) };
    if ok.is_ok() {
        (pt.x, pt.y)
    } else {
        (0, 0)
    }
}

// Distância mínima (em pixels) que o cursor precisa percorrer com o botão
// pressionado para contar como arrasto, não só um clique parado. Valor
// próximo do que o próprio Windows usa internamente (SM_CXDRAG/SM_CYDRAG,
// tipicamente 4px) para decidir quando um clique vira um drag de verdade.
const DRAG_THRESHOLD_PX: i32 = 8;

fn poller_thread() {
    let mut click_through_ready = false;
    let mut was_mouse_down = false;
    let mut down_anchor: (i32, i32) = (0, 0);

    loop {
        std::thread::sleep(std::time::Duration::from_millis(16));

        let Some(app) = APP_HANDLE.get() else {
            continue;
        };

        // Repete a tentativa a cada ciclo até a janela nativa estar pronta
        // (na primeira chamada, logo no setup(), ela ainda pode não existir
        // de fato no SO, e a chamada falha silenciosamente).
        if !click_through_ready {
            click_through_ready = make_click_through(app);
        }

        let shift = shift_is_down();
        let ctrl = ctrl_is_down();
        let mouse_down_now = left_mouse_is_down();
        let cursor_now = cursor_pos();

        if mouse_down_now && !was_mouse_down {
            // Botão acabou de ser pressionado: guarda a posição de
            // referência para medir o deslocamento a partir daqui.
            down_anchor = cursor_now;
        }
        was_mouse_down = mouse_down_now;

        let dx = cursor_now.0 - down_anchor.0;
        let dy = cursor_now.1 - down_anchor.1;
        let moved_enough = dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX;
        let dragging = mouse_down_now && moved_enough;

        if dragging && (shift || ctrl) {
            // Só ancora UMA VEZ por "sessão" de clique-e-arrasto com
            // modificador — no ponto onde o cursor estava quando as duas
            // condições ficaram verdadeiras juntas. Depois disso a janela
            // fica fixa ali até soltar o botão do mouse ou a tecla,
            // permitindo o usuário mover o cursor para escolher uma fatia.
            if !ANCHORED.swap(true, Ordering::Relaxed) {
                let (x, y) = cursor_pos();
                position_wheel(app, x, y);
                set_wheel_top(app, true);
                let mode = if shift { "format" } else { "tools" };
                let _ = app.emit_to("wheel", "wheel-mode", mode);
            }
        } else {
            // Reaplica o estacionamento em TODO ciclo (não só na transição)
            // — garante que qualquer falha pontual se autocorrija no
            // próximo tick em vez de deixar a janela "presa".
            ANCHORED.store(false, Ordering::Relaxed);
            park_wheel(app);
            set_wheel_top(app, false);
        }
    }
}

const OFFSCREEN_POS: i32 = -10000;

fn position_wheel(app: &AppHandle, cursor_x: i32, cursor_y: i32) {
    if let Some(window) = app.get_webview_window("wheel") {
        if let Ok(size) = window.outer_size() {
            let x = cursor_x - (size.width as i32) / 2;
            let y = cursor_y - (size.height as i32) / 2;
            let _ = window.set_position(PhysicalPosition::new(x, y));
        }
    }
}

fn park_wheel(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("wheel") {
        let _ = window.set_position(PhysicalPosition::new(OFFSCREEN_POS, OFFSCREEN_POS));
    }
}

fn set_wheel_top(app: &AppHandle, top: bool) {
    if let Some(window) = app.get_webview_window("wheel") {
        let _ = window.set_always_on_top(top);
    }
}

/// Reseta o estado imediatamente após um drop, sem esperar a tecla ser
/// solta. Se ela continuar pressionada, a roda volta a seguir o cursor
/// (vazia) no próximo tick, o que é inofensivo pois a janela é click-through.
pub fn dismiss_wheel(app: &AppHandle) {
    park_wheel(app);
    set_wheel_top(app, false);
}

/// Torna a janela "click-through": cliques normais do mouse atravessam para
/// quem estiver por baixo. Isso é o que garante que a janela da roda nunca
/// atrapalhe o uso normal do sistema, mesmo que esteja posicionada em algum
/// lugar visível por engano. O drag-and-drop OLE continua funcionando
/// normalmente, pois usa um mecanismo de detecção diferente do clique.
/// Retorna `true` se conseguiu aplicar (a janela nativa já existia).
fn make_click_through(app: &AppHandle) -> bool {
    if let Some(window) = app.get_webview_window("wheel") {
        if let Ok(hwnd) = window.hwnd() {
            unsafe {
                let hwnd = HWND(hwnd.0);
                let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, style | (WS_EX_TRANSPARENT.0 as isize));
                // Necessário para o Windows reavaliar o estilo estendido
                // imediatamente; sem isso, a mudança às vezes só "pega" na
                // próxima vez que a janela é movida/redimensionada.
                let _ = SetWindowPos(
                    hwnd,
                    None,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
                );
            }
            return true;
        }
    }
    false
}

/// Inicia a thread de observação. Deve ser chamada uma única vez, no setup
/// do app.
pub fn start(app: AppHandle) {
    let _ = APP_HANDLE.set(app);
    std::thread::spawn(poller_thread);
}
