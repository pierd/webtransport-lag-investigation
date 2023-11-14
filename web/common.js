var waitDurationMs = null;

export function initUI(id) {
    document.getElementById(id || "components").innerHTML = `
        <p>Frame time: <span id="frame"></span></p>
        <button id="plus" style="visibility: hidden">+</button>
        <button id="minus" style="visibility: hidden">-</button>
        <p>Datagram latency: <span id="latency"></span></p>
        <p>Write latency: <span id="write"></span></p>
    `;

    document.getElementById("plus").addEventListener("click", () => {
        if (waitDurationMs !== null) {
            waitDurationMs += 10;
        }
    });

    document.getElementById("minus").addEventListener("click", () => {
        if (waitDurationMs !== null && waitDurationMs >= 10) {
            waitDurationMs -= 10;
        }
    });
}

function createReportInSpan(spanId) {
    return (val) => {
        const span = document.getElementById(spanId);
        if (typeof val === "number") {
            span.textContent = "" + val + "ms";
        } else if (val instanceof Error) {
            span.textContent = val.message;
        } else {
            span.textContent = val;
        }
    };
}

export const reportFrameTime = createReportInSpan("frame");
export const reportLatency = createReportInSpan("latency");
export const reportWriteTime = createReportInSpan("write");

export function busyWait(durationMs) {
    if (waitDurationMs === null) {
        waitDurationMs = durationMs;
        document.getElementById("plus").style.visibility = "visible";
        document.getElementById("minus").style.visibility = "visible";
    }
    const startTime = Date.now();
    while (Date.now() < startTime + waitDurationMs) { }
}

export function shortNow() {
    return Date.now() & 0xFFFFFFFF;
}

export function nowAsBuffer() {
    const now = shortNow();
    const buffer = new Uint8Array(4);
    buffer[0] = now >> 24;
    buffer[1] = now >> 16;
    buffer[2] = now >> 8;
    buffer[3] = now;
    return buffer;
}

export function timestampFromBuffer(buffer) {
    return buffer[0] << 24 | buffer[1] << 16 | buffer[2] << 8 | buffer[3];
}

export function writePacket(writer) {
    const now = shortNow();
    writer.write(nowAsBuffer()).then(() => {
        reportWriteTime(shortNow() - now);
    }, (e) => {
        reportWriteTime(e);
    });
}

export function createReaderCallback(reader) {
    const callback = () => {
        reader.read().then(({ value, done }) => {
            const now = shortNow();
            const timestamp = timestampFromBuffer(value);
            reportLatency(now - timestamp);
            callback();
        }, (e) => {
            reportLatency(e);
        });
    }
    return callback;
}

var lastFrame = shortNow();
export function onFrame() {
    const now = shortNow();
    const frameTime = shortNow() - lastFrame;
    reportFrameTime(frameTime);
    lastFrame = now;
}
