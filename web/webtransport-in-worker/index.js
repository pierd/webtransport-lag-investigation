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
    worker.onmessage = (e) => {
        if (e.data.data !== undefined) {
            if (e.data.data instanceof Uint8Array) {
                const now = common.shortNow();
                const timestamp = common.timestampFromBuffer(e.data.data);
                common.reportLatency(now - timestamp);
            } else {
                common.reportLatency(e.data.data);
            }
        } else if (e.data.write !== undefined) {
            common.reportWriteTime(e.data.write);
        } else {
            console.log(e.data);
        }
    };
}
