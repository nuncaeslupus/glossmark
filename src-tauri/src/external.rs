use crate::error::{ErrorKind, IpcError};
use url::Url;

/// Only `http:`, `https:` and `mailto:` leave the app; other schemes are `not_permitted`.
pub fn check_url(url: &str) -> Result<Url, IpcError> {
    Url::parse(url)
        .ok()
        .filter(|u| matches!(u.scheme(), "http" | "https" | "mailto"))
        .ok_or_else(|| IpcError::new(ErrorKind::NotPermitted, format!("cannot open {url}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_open_external_allows_only_web_and_mail() {
        for ok in ["https://a.org/x", "HTTP://a.org", "mailto:me@a.org"] {
            assert!(check_url(ok).is_ok(), "{ok}");
        }
        for bad in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "/etc",
            "smb://h/s",
        ] {
            assert_eq!(check_url(bad).unwrap_err().kind, ErrorKind::NotPermitted);
        }
    }
}
