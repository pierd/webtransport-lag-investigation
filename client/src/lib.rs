use std::{cell::RefCell, rc::Rc};

use js_sys::{wasm_bindgen::prelude::*, Date, Reflect, Uint8Array};
use tracing_subscriber::{filter::Targets, layer::SubscriberExt, util::SubscriberInitExt};
use tracing_web::MakeConsoleWriter;
use web_sys::{console, window, MessageEvent, Worker, WorkerOptions};

#[wasm_bindgen(module = "/common.js")]
extern "C" {
    fn initUI();

    fn onFrame();
    fn busyWait(_: f64);

    fn nowAsBuffer() -> Uint8Array;

    fn reportLatency(_: JsValue);
    fn reportStream(_: JsValue);
    fn reportWriteTime(_: JsValue);
    fn reportError(_: JsValue);

    fn shortNow() -> u32;
    fn timestampFromBuffer(_: Uint8Array) -> u32;
}

fn init_tracing() {
    let fmt_layer = tracing_subscriber::fmt::layer()
        .with_ansi(true) // Only partially supported, but works on Chrome
        .without_time()
        .with_writer(MakeConsoleWriter); // write events to the console
    tracing_subscriber::registry()
        .with(Targets::default())
        .with(fmt_layer)
        .init();
}

fn request_animation_frame(f: &Closure<dyn FnMut()>) {
    window()
        .expect("window should be available")
        .request_animation_frame(f.as_ref().unchecked_ref())
        .expect("should register `requestAnimationFrame` OK");
}

fn handle_data(data: JsValue, report: fn(JsValue)) {
    match data.dyn_into::<js_sys::Uint8Array>() {
        Ok(buf) => {
            let now = shortNow();
            let timestamp = timestampFromBuffer(buf);
            report((now - timestamp).into());
        }
        Err(data) => report(data),
    }
}

fn js_get(obj: &JsValue, key: &str) -> Option<JsValue> {
    Reflect::get(obj, &JsValue::from_str(key))
        .ok()
        .filter(|x| !x.is_undefined())
}

#[wasm_bindgen(start)]
pub async fn start() -> Result<(), JsValue> {
    // This provides better error messages in debug mode.
    // It's disabled in release mode so it doesn't bloat up the file size.
    #[cfg(debug_assertions)]
    console_error_panic_hook::set_once();

    init_tracing();

    initUI();

    let mut options = WorkerOptions::new();
    options.type_(web_sys::WorkerType::Module);
    let worker = Worker::new_with_options("worker.js", &options)?;

    let cb = Box::new(Closure::<dyn FnMut(_)>::new({
        move |event: MessageEvent| {
            let data = event.data();
            if let Some(data) = js_get(&data, "ping") {
                let latency = Date::now() - data.as_f64().unwrap();
                console::log_1(&format!("latency: {:?}ms", latency).into());
            } else if let Some(data) = js_get(&data, "data") {
                handle_data(data, reportLatency);
            } else if let Some(data) = js_get(&data, "stream") {
                handle_data(data, reportStream);
            } else if let Some(data) = js_get(&data, "write") {
                reportWriteTime(data);
            } else if let Some(data) = js_get(&data, "error") {
                reportError(data);
            } else {
                console::log_1(&data);
            }
        }
    }));
    // leak the closure so it's not dropped - not the best solution, but it works
    let cb = Box::leak(cb);
    worker.set_onmessage(Some(cb.as_ref().unchecked_ref()));

    let callback = Rc::new(RefCell::new(None));
    *callback.borrow_mut() = Some(Closure::new({
        // note: this creates a reference cycle
        let callback = callback.clone();
        move || {
            onFrame();
            busyWait(50.);

            for _ in 0..10 {
                worker.post_message(&nowAsBuffer()).unwrap();
            }

            request_animation_frame(callback.borrow().as_ref().unwrap());
        }
    }));
    request_animation_frame(callback.borrow().as_ref().unwrap());

    Ok(())
}
