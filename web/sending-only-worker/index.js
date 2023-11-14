import * as common from "/common.js";

const worker = new Worker("worker.js", { type: "module" });

const animationFrameCallback = () => {
    common.onFrame();
    common.busyWait(50);

    for (let i = 0; i < 10; i++) {
        worker.postMessage(common.nowAsBuffer());
    }

    requestAnimationFrame(animationFrameCallback);
};

export async function run() {
    common.initUI();
    animationFrameCallback();

    try {
        let w = new WebTransport("https://127.0.0.1:9000")
        await w.ready;

        worker.postMessage(w.datagrams.writable, [w.datagrams.writable]);
        worker.onmessage = (e) => {
            common.reportWriteTime(e.data);
        };
        common.createReaderCallback(w.datagrams.readable.getReader())();
        w.incomingUnidirectionalStreams.getReader().read().then(({ value, done }) => {
            common.createReaderCallback(value.getReader(), common.reportStream)();
        });
    } catch (e) {
        common.reportError(e);
    }
}
