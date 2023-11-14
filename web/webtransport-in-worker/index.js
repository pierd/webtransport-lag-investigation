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

function handleData(data, report) {
    if (data instanceof Uint8Array) {
        const now = common.shortNow();
        const timestamp = common.timestampFromBuffer(data);
        report(now - timestamp);
    } else {
        report(data);
    }
}

export async function run() {
    common.initUI();
    animationFrameCallback();

    worker.onmessage = (e) => {
        if (e.data.data !== undefined) {
            handleData(e.data.data, common.reportLatency);
        } else if (e.data.stream !== undefined) {
            handleData(e.data.stream, common.reportStream);
        } else if (e.data.write !== undefined) {
            common.reportWriteTime(e.data.write);
        } else if (e.data.error !== undefined) {
            common.reportError(e.data.error);
        } else {
            console.log(e.data);
        }
    };
}
