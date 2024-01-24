/** @type {RTCDataChannel} */
var channel = null;

onmessage = function (e) {
    if (channel === null && e.data instanceof RTCDataChannel) {
        channel = e.data;
        channel.onopen = (e) => {
            console.log("Data channel opened");
            // let the main thread know that the channel is open
            postMessage({ open: true });
        };
        channel.onclose = (e) => {
            console.log("Data channel closed");
            channel = null;
        };
        channel.onmessage = (e) => {
            postMessage(e.data, [e.data]);
        };
    } else if (channel !== null) {
        if (channel.readyState === "open") {
            channel.send(e.data);
        } else {
            console.error("Channel is not open (yet?)");
        }
    } else {
        console.error("Got data but no channel is available");
    }
};

console.info("Worker started");
