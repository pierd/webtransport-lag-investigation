onmessage = function (e) {
    console.info("Got a endpoint: " + e.data);
    const w = new WebTransport(e.data);
    w.ready.then(() => {
        const reader = w.datagrams.readable;
        const writer = w.datagrams.writable;
        console.info("Transferring streams");
        postMessage({ reader, writer }, [reader, writer]);
    });
};

console.info("Worker started");
