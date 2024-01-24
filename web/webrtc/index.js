import * as common from "/common.js";

/** @type {RTCDataChannel} */
var channel = null;

const animationFrameCallback = () => {
    common.onFrame();
    common.busyWait(50);

    if (channel !== null && channel.readyState === "open") {
        for (let i = 0; i < 10; i++) {
            const now = common.shortNow();
            channel.send(common.nowAsBuffer());
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
        dataChannel.onopen = (e) => {
            console.log("Data channel opened");
            channel = dataChannel;
        };
        dataChannel.onclose = (e) => {
            console.log("Data channel closed");
        };
        dataChannel.onmessage = (e) => {
            const now = common.shortNow();
            const timestamp = common.timestampFromBuffer(new Uint8Array(e.data));
            common.reportLatency(now - timestamp);
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
                console.log("Offer: " + offer.sdp);
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
