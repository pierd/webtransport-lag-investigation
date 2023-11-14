import * as common from "/common.js";

let hostname = "127.0.0.1";
let port = 9000;

let webTransport = new WebTransport(`https://${hostname}:${port}`);
let connection = webTransport.ready;

let datagrams;
let writer;

async function initWebTransport() {
    let webtransportElement = document.getElementById("webtransport");
    webtransportElement.textContent = "WebTransport is connecting...";

    try {
        await connection;
        datagrams = webTransport.datagrams;
        writer = datagrams.writable.getWriter();

        webtransportElement.textContent += "\nConnection is ready!";

        requestAnimationFrame(animationFrameCallback);
        common.createReaderCallback(datagrams.readable.getReader())();
    } catch (e) {
        console.error("Failed to establish WebTransport connection:", e);
        webtransportElement.textContent += `\nFailed to establish connection: ${e}`;
    }
}

const animationFrameCallback = () => {
    common.onFrame();

    let a = 0;
    let b = 2.5;

    while (a < 1000000) {
        b = Math.abs(Math.exp(Math.sin(b)));
        a++;
    }

    for (let i = 0; i < 10; i++) {
        sendDatagram(common.nowAsBuffer());
    }

    requestAnimationFrame(animationFrameCallback);
};

var packets = 0;

function sendDatagram(data) {

    packets += 1;
    // console.log(packets);

    const now = common.shortNow();
    writer.write(data).then(() => {
        // You might want to do something here after successful write
        common.reportWriteTime(common.shortNow() - now);
    }).catch((error) => {
        console.error("Failed to send datagram:", error);
    });
}

common.initUI();
initWebTransport();
