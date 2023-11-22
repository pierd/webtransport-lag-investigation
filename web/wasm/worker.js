import * as common from "/common.js";

var writer = null;

function reportWriteTime(write) {
    postMessage({ write });
}

function reportDatagram(data) { 
    postMessage({ data });
}

function reportStream(data) { 
    postMessage({ stream: data });
}

function reportError(error) {
    postMessage({ error });
}

function createReaderCallback(reader, reportCallback) {
    const report = reportCallback || reportDatagram;
    const callback = () => {
        reader.read().then(({ value, done }) => {
            report(value);
            callback();
        }, (e) => {
            report(e.message);
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
    w.incomingUnidirectionalStreams.getReader().read().then(({ value, done }) => {
        createReaderCallback(value.getReader(), reportStream)();
    });
}, (e) => {
    reportError(e.message);
});

const pinger = () => {
    postMessage({ ping: Date.now() });
    setTimeout(pinger, 1000);
};
pinger();

console.info("Worker started");
