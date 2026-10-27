//! The `image:` protocol: a document's local images, and nothing else, for `<img src>`.
//!
//! Not Tauri's asset protocol: its scope only grants whole folders (`allow_directory`) or exact
//! files, with every path glob-escaped, so it cannot be narrowed to image types; a folder grant
//! would serve a document's neighbours of any type. Here each request goes through `Scope`
//! (canonical path, so symlinks out of the opened folders are refused) and an image extension.

use crate::document::read_capped;
use crate::error::{ErrorKind, IpcError};
use std::path::{Path, PathBuf};
use tauri::http::{header, Response, StatusCode};

pub const SCHEME: &str = "image";
pub const MAX_IMAGE_BYTES: u64 = 50 * 1024 * 1024;

const TYPES: [(&str, &str); 9] = [
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("webp", "image/webp"),
    ("avif", "image/avif"),
    ("bmp", "image/bmp"),
    ("ico", "image/x-icon"),
    ("svg", "image/svg+xml"),
];

/// The media type of an image file, by extension; `None` for anything else.
pub fn media_type(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?;
    TYPES
        .iter()
        .find(|(e, _)| ext.eq_ignore_ascii_case(e))
        .map(|(_, t)| *t)
}

/// The file an `image://localhost/<percent-encoded path>` request names.
pub fn request_path(uri_path: &str) -> PathBuf {
    let encoded = uri_path.strip_prefix('/').unwrap_or(uri_path);
    PathBuf::from(
        percent_encoding::percent_decode_str(encoded)
            .decode_utf8_lossy()
            .into_owned(),
    )
}

/// Checks the request against `scope` (under its lock), then reads the file without it.
pub fn respond(
    scope: impl FnOnce(&Path) -> Result<PathBuf, IpcError>,
    uri_path: &str,
) -> Response<Vec<u8>> {
    let read = scope(&request_path(uri_path)).and_then(|path| {
        let media = media_type(&path).ok_or_else(|| IpcError::not_permitted(&path))?;
        let (bytes, _) = read_capped(&path, MAX_IMAGE_BYTES, "50 MB")?;
        Ok((media, bytes))
    });
    let response = Response::builder()
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        // An SVG opened as a page rather than an `<img>` still runs nothing.
        .header(
            header::CONTENT_SECURITY_POLICY,
            "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        );
    match read {
        Ok((media, bytes)) => response.header(header::CONTENT_TYPE, media).body(bytes),
        Err(e) => response
            .status(match e.kind {
                ErrorKind::NotFound => StatusCode::NOT_FOUND,
                ErrorKind::NotPermitted => StatusCode::FORBIDDEN,
                ErrorKind::TooLarge => StatusCode::PAYLOAD_TOO_LARGE,
                ErrorKind::Io => StatusCode::INTERNAL_SERVER_ERROR,
            })
            .body(Vec::new()),
    }
    .expect("static headers are valid")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scope::Scope;
    use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
    use std::fs;

    #[test]
    fn test_image_protocol_serves_only_images_in_scope() {
        let root = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(root.path()).unwrap();
        let notes = root.join("notes");
        let secret = root.join("secret");
        fs::create_dir_all(notes.join("img")).unwrap();
        fs::create_dir_all(&secret).unwrap();
        fs::write(notes.join("readme.md"), "# hi").unwrap();
        fs::write(notes.join("img/My Pic.PNG"), "png").unwrap();
        fs::write(notes.join("id_rsa"), "key").unwrap();
        fs::write(secret.join("x.png"), "png").unwrap();
        let mut scope = Scope::default();
        scope.allow(&notes.join("readme.md")).unwrap();

        let get = |path: &Path| {
            let uri = format!(
                "/{}",
                utf8_percent_encode(&path.to_string_lossy(), NON_ALPHANUMERIC)
            );
            respond(|p| scope.check_image(p), &uri)
        };
        let ok = get(&notes.join("img/My Pic.PNG"));
        assert_eq!(ok.status(), StatusCode::OK);
        assert_eq!(ok.headers()[header::CONTENT_TYPE], "image/png");
        assert_eq!(ok.body(), b"png");

        assert_eq!(
            get(&notes.join("img/missing.png")).status(),
            StatusCode::NOT_FOUND
        );
        let mut denied = vec![
            notes.join("id_rsa"),
            notes.join("readme.md"),
            secret.join("x.png"),
            notes.join("../secret/x.png"),
        ];
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(secret.join("x.png"), notes.join("link.png")).unwrap();
            denied.push(notes.join("link.png"));
        }
        for path in denied {
            assert_eq!(get(&path).status(), StatusCode::FORBIDDEN, "{path:?}");
        }
    }
}
