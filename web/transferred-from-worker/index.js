import * as common from "/common.js";

var writer = null;

const animationFrameCallback = () => {
    common.onFrame();
    common.busyWait(50);

    if (writer !== null) {
        for (let i = 0; i < 10; i++) {
            common.writePacket(writer);
        }
    } else {
        console.log("writer not available yet");
    }

    requestAnimationFrame(animationFrameCallback);
};

export async function run() {
    common.initUI();
    animationFrameCallback();

    let worker = new Worker("worker.js", { type: "module" });
    worker.postMessage("https://127.0.0.1:9000");
    worker.onmessage = (e) => {
        if (e.data.writer !== undefined) {
            writer = e.data.writer.getWriter();
        }
        if (e.data.reader !== undefined) {
            const reader = e.data.reader;
            common.createReaderCallback(reader.getReader())();
        }
        if (e.data.stream !== undefined) {
            const stream = e.data.stream;
            common.createReaderCallback(stream.getReader(), common.reportStream)();
        }
        if (e.data.error !== undefined) {
            common.reportError(e.data.error);
        }
    };
}
