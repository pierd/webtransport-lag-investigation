import * as common from "/common.js";

var writer = null;

function reportWriteTime(writeData) {
    postMessage({ write: writeData });
}

function reportDatagram(data) { 
    postMessage({ data: data });
}

function createReaderCallback(reader) {
    const callback = () => {
        reader.read().then(({ value, done }) => {
            reportDatagram(value);
            callback();
        }, (e) => {
            reportDatagram(e.message);
        });
    }
    return callback;
}

onmessage = function (e) {
    if (writer !== null) {
        const now = common.shortNow();
        writer.write(e.data).then(() => {
            reportWriteTime(common.shortNow() - now);
        }, (e) => {
            reportWriteTime(e.message);
        });
    } else {
        console.error("Got data but no stream is available");
    }
};

let w = new WebTransport("https://127.0.0.1:9000");
w.ready.then(() => {
    writer = w.datagrams.writable.getWriter();
    createReaderCallback(w.datagrams.readable.getReader())();
});

console.info("Worker started");
