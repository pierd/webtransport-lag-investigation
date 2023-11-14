onmessage = function (e) {
    console.info("Got an endpoint: " + e.data);
    try {
        const w = new WebTransport(e.data);
        w.ready.then(() => {
            const reader = w.datagrams.readable;
            const writer = w.datagrams.writable;
            console.info("Transferring streams");
            postMessage({ reader, writer }, [reader, writer]);

            w.incomingUnidirectionalStreams.getReader().read().then(({ value, done }) => {
                console.info("Got an incoming stream");
                postMessage({ stream: value }, [value]);
            });
        }, (e) => {
            postMessage({ error: e.message });
        });
    } catch (e) {
        postMessage({ error: e.message });
    }
};

console.info("Worker started");
