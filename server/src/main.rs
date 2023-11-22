use std::{
    io::Read,
    net::{Ipv4Addr, SocketAddr, SocketAddrV4},
    path::Path,
    sync::Arc,
    time::Duration,
};

use anyhow::Context;
use bytes::Bytes;
use futures::AsyncWriteExt;
use h3_webtransport::server::WebTransportSession;
use http::Method;
use quinn::{Endpoint, ServerConfig, TransportConfig};
use rustls::{Certificate, PrivateKey};
use tracing::subscriber::set_global_default;
use tracing_subscriber::{layer::SubscriberExt, EnvFilter, Registry};

fn read_all(path: impl AsRef<Path>) -> anyhow::Result<Vec<u8>> {
    let mut contents = Vec::new();
    std::fs::File::open(path)?.read_to_end(&mut contents)?;
    Ok(contents)
}

fn load_certificate_chain(
    cert_file: impl AsRef<Path> + std::fmt::Display + Clone,
) -> Result<Vec<Certificate>, anyhow::Error> {
    let contents = read_all(cert_file.clone())?;
    let certs = if contents.starts_with(b"-----BEGIN") {
        rustls_pemfile::certs(&mut contents.as_slice())?
            .into_iter()
            .map(Certificate)
            .collect()
    } else {
        vec![Certificate(contents)]
    };
    tracing::debug!("Loaded {} certificates from {}", certs.len(), cert_file);
    Ok(certs)
}

fn load_private_key(
    cert_key_file: impl AsRef<Path> + std::fmt::Display + Clone,
) -> Result<PrivateKey, anyhow::Error> {
    let contents = read_all(cert_key_file.clone())?;
    let key_bytes = if contents.starts_with(b"-----BEGIN") {
        rustls_pemfile::read_all(&mut std::io::BufReader::new(std::fs::File::open(
            cert_key_file.clone(),
        )?))?
        .into_iter()
        .find_map(|item| match item {
            rustls_pemfile::Item::RSAKey(key) => Some(key),
            rustls_pemfile::Item::PKCS8Key(key) => Some(key),
            rustls_pemfile::Item::ECKey(key) => Some(key),
            _ => None,
        })
        .ok_or_else(|| anyhow::anyhow!("No private key found"))?
    } else {
        contents
    };
    tracing::debug!(
        "Loaded private key ({}B) from {}",
        key_bytes.len(),
        cert_key_file
    );
    Ok(PrivateKey(key_bytes))
}

fn create_endpoint(addr: SocketAddr) -> anyhow::Result<Endpoint> {
    let certificate_chain = load_certificate_chain("localhost.crt")?;
    let private_key = load_private_key("localhost.key")?;

    let mut tls_config = rustls::ServerConfig::builder()
        .with_safe_default_cipher_suites()
        .with_safe_default_kx_groups()
        .with_protocol_versions(&[&rustls::version::TLS13])
        .unwrap()
        .with_no_client_auth()
        .with_single_cert(certificate_chain.clone(), private_key.clone())?;
    tls_config.max_early_data_size = u32::MAX;
    tls_config.alpn_protocols = vec![b"h3".to_vec()];

    let mut server_conf = ServerConfig::with_crypto(Arc::new(tls_config));
    let mut transport = TransportConfig::default();
    transport.max_idle_timeout(Some(
        Duration::from_secs(30)
            .try_into()
            .expect("Should fit in VarInt"),
    ));
    server_conf.transport = Arc::new(transport);

    let endpoint = Endpoint::server(server_conf, addr)?;
    Ok(endpoint)
}

async fn start(endpoint: Endpoint) -> anyhow::Result<()> {
    loop {
        tokio::select! {
            Some(mut conn) = endpoint.accept() => {
                tracing::info!("Accepted connection from {:?}", conn.remote_address());
                let handshake_data = conn
                    .handshake_data()
                    .await
                    .context("Failed to acquire handshake data")?
                    .downcast::<quinn::crypto::rustls::HandshakeData>()
                    .ok()
                    .context("Failed to downcast handshake data")?;
                tracing::info!("Handshake protocol: {:?}", handshake_data.protocol.as_ref().map(|p| String::from_utf8_lossy(p)));
                tokio::spawn(async move {
                    let conn = match conn.await {
                        Ok(conn) => conn,
                        Err(e) => {
                            tracing::error!("Connection error: {:?}", e);
                            return;
                        }
                    };
                    if let Err(e) = handle_h3_connection(conn).await {
                        tracing::error!("Error handling connection: {:?}", e);
                    }
                });
            }
            _ = tokio::signal::ctrl_c() => {
                tracing::info!("Ctrl-C received, shutting down");
                return Ok(());
            }
        }
    }
}

async fn handle_h3_connection(conn: quinn::Connection) -> anyhow::Result<()> {
    let remote_addr = conn.remote_address();

    let mut conn: h3::server::Connection<h3_quinn::Connection, Bytes> = h3::server::builder()
        .enable_webtransport(true)
        .enable_connect(true)
        .enable_datagram(true)
        .max_webtransport_sessions(1)
        .build(h3_quinn::Connection::new(conn))
        .await
        .unwrap();

    loop {
        let req = conn.accept().await?;

        if let Some((req, resp)) = req {
            match req.method() {
                &Method::CONNECT => {
                    let session = WebTransportSession::accept(req, resp, conn)
                        .await
                        .context("Failed to accept webtransport session")?;
                    tracing::info!("Accepted webtransport session: {:?}", session.session_id());

                    return handle_session(session, remote_addr).await;
                }
                method => {
                    tracing::info!(?method, "Received other HTTP/3 request")
                }
            }
        }
    }
}

async fn handle_session(
    session: WebTransportSession<h3_quinn::Connection, Bytes>,
    remote_addr: SocketAddr,
) -> anyhow::Result<()> {
    let mut log_tick = tokio::time::interval(Duration::from_secs(10));
    let stream = spawn_uni_stream(&session).await?;
    loop {
        tokio::select! {
            Ok(datagram) = session.accept_datagram() => {
                tracing::debug!("Received datagram: {:?}", datagram);
                if let Some((_session_id, data)) = datagram {
                    // send the data back over stream
                    // Note:
                    //  in real network we should handle framing of the data, on localhost we don't really have to
                    //  worry about any bufferring so what we send is what we receive
                    stream.send_async(data.clone()).await?;

                    // send the data back
                    if let Err(e) = session.send_datagram(data) {
                        tracing::error!("Failed to send datagram: {:?}", e);
                    }
                }
            }
            _ = log_tick.tick() => {
                tracing::info!("{:?} of {:?} still connected", session.session_id(), remote_addr);
            }
            _ = tokio::signal::ctrl_c() => {
                tracing::info!("Ctrl-C received, shutting down");
                return Ok(());
            }
        }
    }
}

async fn spawn_uni_stream(
    session: &WebTransportSession<h3_quinn::Connection, Bytes>,
) -> anyhow::Result<flume::Sender<Bytes>> {
    let (tx, rx) = flume::unbounded::<Bytes>();
    let mut stream = session.open_uni(session.session_id()).await?;
    tokio::spawn(async move {
        loop {
            match rx.recv_async().await {
                Ok(data) => {
                    if let Err(e) = stream.write_all(data.as_ref()).await {
                        tracing::error!("Failed to write to stream: {:?}", e);
                        break;
                    }
                }
                Err(e) => {
                    tracing::error!("Failed to receive data: {:?}", e);
                    break;
                }
            }
        }
        anyhow::Ok(())
    });

    Ok(tx)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    set_global_default(
        Registry::default()
            .with(
                EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| EnvFilter::new("webtransport_lag_investigation=info,warn")),
            )
            .with(tracing_subscriber::fmt::layer().with_writer(std::io::stderr)),
    )?;

    let endpoint = create_endpoint(SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 9000)))?;
    tracing::info!("Listening on {:?}", endpoint.local_addr()?);
    start(endpoint).await?;

    Ok(())
}
