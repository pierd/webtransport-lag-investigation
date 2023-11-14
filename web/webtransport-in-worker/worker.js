import * as common from "/common.js";

var writer = null;

function reportWriteTime(writeData) {
    postMessage({ write: writeData });
}

function reportDatagram(data) { 
    postMessage({ data: data });
}

function writePacket(writer) {
    const now = common.shortNow();
    writer.write(common.nowAsBuffer()).then(() => {
        reportWriteTime(common.shortNow() - now);
    }, (e) => {
        reportWriteTime(e.message);
    });
}

const reportLatency = reportDatagram;
function createReaderCallback(reader) {
    const callback = () => {
        reader.read().then(({ value, done }) => {
            const now = common.shortNow();
            const timestamp = common.timestampFromBuffer(value);
            reportLatency(now - timestamp);
            callback();
        }, (e) => {
            reportLatency(e.message);
        });
    }
    return callback;
}

onmessage = function (e) {
    if (writer !== null) {
        writePacket(writer);
    } else {
        console.error("Got data but no stream is available");
    }
};

let w = new WebTransport("https://127.0.0.1:9000");
w.ready.then(() => {
    writer = w.datagrams.writable.getWriter();
    createReaderCallback(w.datagrams.readable.getReader())();
});

console.info("Stream writer worker started");
