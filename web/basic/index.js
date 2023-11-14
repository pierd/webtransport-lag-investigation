import * as common from "/common.js";

var writer = null;

const animationFrameCallback = () => {
    common.onFrame();
    common.busyWait(50);

    if (writer !== null) {
        for (let i = 0; i < 10; i++) {
            common.writePacket(writer);
        }
    }

    requestAnimationFrame(animationFrameCallback);
};

export async function run() {
    common.initUI();
    let w = new WebTransport("https://127.0.0.1:9000")
    await w.ready;

    writer = w.datagrams.writable.getWriter();
    animationFrameCallback();
    common.createReaderCallback(w.datagrams.readable.getReader())();
}
