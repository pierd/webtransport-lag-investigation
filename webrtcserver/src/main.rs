use std::{
    net::{Ipv4Addr, SocketAddr, SocketAddrV4},
    sync::Arc,
};

use anyhow::Ok;
use axum::{extract::State, routing::post, Json, Router};
use tokio::net::UdpSocket;
use tower::ServiceBuilder;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::subscriber::set_global_default;
use tracing_subscriber::{layer::SubscriberExt, EnvFilter};
use webrtc::{
    api::{
        interceptor_registry::register_default_interceptors, media_engine::MediaEngine,
        setting_engine::SettingEngine, APIBuilder, API,
    },
    ice::{
        network_type::NetworkType,
        udp_mux::{UDPMuxDefault, UDPMuxParams},
        udp_network::UDPNetwork,
    },
    interceptor::registry::Registry,
    peer_connection::{
        configuration::RTCConfiguration, sdp::session_description::RTCSessionDescription,
    },
};

const HTTP_PORT: u16 = 9000;
const UDP_PORT: u16 = 9000;

async fn answer_offer(State(api): State<Arc<API>>, offer: String) -> Json<RTCSessionDescription> {
    tracing::debug!("Received offer: {:?}", offer);
    let offer = RTCSessionDescription::offer(offer).unwrap();
    let pc = api
        .new_peer_connection(RTCConfiguration::default())
        .await
        .unwrap();

    let pc_id: Arc<str> = Arc::from(pc.get_stats_id());

    pc.on_peer_connection_state_change(Box::new({
        let pc_id = pc_id.clone();
        move |state| {
            tracing::debug!(%pc_id, "PeerConnection state changed to {}", state);
            Box::pin(async {})
        }
    }));

    pc.on_ice_candidate(Box::new(|candidate| {
        tracing::debug!("New ICE candidate: {:?}", candidate);
        Box::pin(async {})
    }));

    pc.on_data_channel(Box::new(|dc| {
        let label: Arc<str> = Arc::from(dc.label());
        let id = dc.id();
        tracing::debug!(%label, id, "New DataChannel");

        Box::pin(async move {
            let label = label.clone();

            dc.on_open(Box::new({
                let label = label.clone();
                move || {
                    tracing::debug!(%label, id, "DataChannel opened");
                    Box::pin(async {})
                }
            }));

            dc.on_close(Box::new({
                let label = label.clone();
                move || {
                    tracing::debug!(%label, id, "DataChannel closed");
                    Box::pin(async {})
                }
            }));

            dc.on_message(Box::new({
                // FIXME: Arc cycle
                let dc = dc.clone();
                move |msg| {
                    // tracing::debug!(%label, id, "Received message: {:?}", msg);
                    let dc = dc.clone();
                    Box::pin(async move {
                        // echo the message back
                        dc.send(&msg.data).await.unwrap();
                    })
                }
            }))
        })
    }));

    pc.set_remote_description(offer).await.unwrap();

    let mut gather_complete = pc.gathering_complete_promise().await;
    let answer = pc.create_answer(None).await.unwrap();
    pc.set_local_description(answer).await.unwrap();

    // Block until ICE Gathering is complete, disabling trickle ICE
    // we do this because we only can exchange one signaling message
    // in a production application you should exchange ICE Candidates via OnICECandidate
    let _ = gather_complete.recv().await;

    let answer = pc.local_description().await.unwrap();
    tracing::debug!("Sending answer: {:?}", answer);
    Json(answer)
}

async fn create_webrtc_api(port: u16) -> anyhow::Result<API> {
    let mut m = MediaEngine::default();
    // TODO: try without any codecs
    m.register_default_codecs().unwrap();

    let mut registry = Registry::new();
    registry = register_default_interceptors(registry, &mut m).unwrap();

    // make sure we use a single port for all our connections
    let mut setting_engine = SettingEngine::default();
    let udp_socket = UdpSocket::bind(SocketAddr::V4(SocketAddrV4::new(
        Ipv4Addr::UNSPECIFIED,
        port,
    )))
    .await?;
    let udp_mux = UDPMuxDefault::new(UDPMuxParams::new(udp_socket));
    setting_engine.set_udp_network(UDPNetwork::Muxed(udp_mux));
    setting_engine.set_network_types(vec![NetworkType::Udp4]);

    let api = APIBuilder::new()
        .with_media_engine(m)
        .with_interceptor_registry(registry)
        .with_setting_engine(setting_engine)
        .build();
    Ok(api)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    set_global_default(
        tracing_subscriber::Registry::default()
            .with(
                EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| EnvFilter::new("webrtcserver=debug,info")),
            )
            .with(tracing_subscriber::fmt::layer().with_writer(std::io::stderr)),
    )?;

    let api = Arc::new(create_webrtc_api(UDP_PORT).await?);

    let router = Router::new()
        .route("/", post(answer_offer))
        .with_state(api)
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(CorsLayer::permissive()),
        );

    let listener = std::net::TcpListener::bind(SocketAddr::V4(SocketAddrV4::new(
        Ipv4Addr::UNSPECIFIED,
        HTTP_PORT,
    )))?;
    axum::Server::from_tcp(listener)?
        .serve(router.into_make_service())
        .await
        .unwrap();

    Ok(())
}
