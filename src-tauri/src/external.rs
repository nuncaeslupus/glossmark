use crate::error::{ErrorKind, IpcError};
use url::Url;

/// The `mailto:` query fields passed on; others (e.g. `attach=`, which some clients honour) are dropped.
const MAILTO_FIELDS: [&str; 4] = ["subject", "body", "cc", "bcc"];

/// Only `http:`, `https:` and `mailto:` leave the app; other schemes are `not_permitted`.
pub fn check_url(url: &str) -> Result<Url, IpcError> {
    let mut url = Url::parse(url)
        .ok()
        .filter(|u| matches!(u.scheme(), "http" | "https" | "mailto"))
        .ok_or_else(|| IpcError::new(ErrorKind::NotPermitted, format!("cannot open {url}")))?;
    if url.scheme() == "mailto" && url.query().is_some() {
        let kept: Vec<(String, String)> = url
            .query_pairs()
            .filter(|(k, _)| MAILTO_FIELDS.iter().any(|f| k.eq_ignore_ascii_case(f)))
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();
        url.set_query(None);
        if !kept.is_empty() {
            url.query_pairs_mut().extend_pairs(kept);
        }
    }
    Ok(url)
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

    #[test]
    fn test_open_external_mailto_keeps_only_mail_fields() {
        let url =
            check_url("mailto:me@a.org?subject=Hi&attach=/etc/passwd&CC=x@a.org&body=b").unwrap();
        assert_eq!(
            url.as_str(),
            "mailto:me@a.org?subject=Hi&CC=x%40a.org&body=b"
        );
        let url = check_url("mailto:me@a.org?attach=%2Fhome%2Fu%2F.ssh%2Fid_rsa").unwrap();
        assert_eq!(url.as_str(), "mailto:me@a.org");
        let url = check_url("https://a.org/?attach=1").unwrap();
        assert_eq!(url.as_str(), "https://a.org/?attach=1");
    }
}
