import * as common from "/common.js";

const worker = new Worker("worker.js", { type: "module" });
var workerReady = false;

const animationFrameCallback = () => {
    common.onFrame();
    common.busyWait(50);

    if (workerReady) {
        for (let i = 0; i < 10; i++) {
            const now = common.shortNow();
            worker.postMessage(common.nowAsBuffer());
            common.reportWriteTime(common.shortNow() - now);
        }
    }

    requestAnimationFrame(animationFrameCallback);
};

export async function run() {
    common.initUI();
    animationFrameCallback();

    try {
        let peerConnection = new RTCPeerConnection();
        let dataChannel = peerConnection.createDataChannel("test");
        dataChannel.binaryType = "arraybuffer"; // Chrome is ok without it but others default to "blob"
        // not attaching anything to the channel as we're going to transfer it to the worker!
        worker.postMessage(dataChannel, [dataChannel]);
        worker.onmessage = (e) => {
            workerReady = true;
            if (e.data instanceof ArrayBuffer) {
                const now = common.shortNow();
                const timestamp = common.timestampFromBuffer(new Uint8Array(e.data));
                common.reportLatency(now - timestamp);
            } else {
                console.log(e.data);
            }
        };

        peerConnection.ondatachannel = (e) => {
            console.log("Data channel: " + e.channel.label);
        };

        peerConnection.onicecandidate = (e) => {
            if (e.candidate !== null) {
                console.log("ICE candidate: " + e.candidate.candidate);
            }
        };
        peerConnection.oniceconnectionstatechange = (e) => {
            console.log("ICE connection state: " + peerConnection.iceConnectionState);
        };
        peerConnection.onconnectionstatechange = (e) => {
            console.log("Connection state: " + peerConnection.connectionState);
        };

        peerConnection.onnegotiationneeded = (e) => {
            console.log("Negotiation needed");
            console.log(e);

            async function negotiate() {
                let offer = await peerConnection.createOffer();
                console.log(offer);
                peerConnection.setLocalDescription(offer);
                const hostname = window.location.hostname;
                let response = await fetch(`http://${hostname}:9000`, {
                    method: "POST",
                    body: offer.sdp,
                });
                let answer = await response.json();
                console.log("Answer: " + answer.sdp);
                return answer;
            }

            negotiate().then((answer) => {
                peerConnection.setRemoteDescription(answer);
            });
        };

        peerConnection.ontrack = (e) => {
            console.log("Track: " + e.track.kind);
        };
        peerConnection.ondatachannel = (e) => {
            console.log("Data channel: " + e.channel.label);
        };
    } catch (e) {
        common.reportError(e);
    }
}
