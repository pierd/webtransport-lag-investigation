import * as common from "/common.js";

var writer = null;

const reportWriteTime = postMessage;

function writePacket(writer) {
    const now = common.shortNow();
    writer.write(common.nowAsBuffer()).then(() => {
        reportWriteTime(common.shortNow() - now);
    }, (e) => {
        reportWriteTime(e);
    });
}

onmessage = function (e) {
    if (e.data instanceof WritableStream) {
        console.info("Got a stream");
        writer = e.data.getWriter();
        return;
    } else if (writer !== null) {
        writePacket(writer);
    } else {
        console.error("Got data but no stream is available");
    }
};

console.info("Worker started");
