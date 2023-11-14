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
    let worker = new Worker("worker.js", { type: "module" });
    worker.postMessage("https://127.0.0.1:9000");
    worker.onmessage = (e) => {
        writer = e.data.writer.getWriter();

        const reader = e.data.reader;
        common.createReaderCallback(reader.getReader())();
    };
    animationFrameCallback();
}
