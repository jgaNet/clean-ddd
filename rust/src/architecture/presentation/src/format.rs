//! The two ways this application answers: JSON for API clients, HTML fragments for the HTMX
//! front end, told apart by the `HX-Request` header. One presenter per format for a given view
//! model; JSON is mandatory (every use case has an API), HTMX is optional and falls back to
//! JSON. A `ByFormat` is a plain value the controller owns: nothing registers or looks up a
//! presenter by name.

use axum::http::HeaderMap;
use axum::response::Response;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    Json,
    Htmx,
}

/// What a request wants: HTMX sends `HX-Request: true`, an API client sends nothing.
pub fn format_of(headers: &HeaderMap) -> Format {
    if headers.contains_key("hx-request") { Format::Htmx } else { Format::Json }
}

/// Turns a view model into a response, in one format.
pub trait Presenter<T>: Send + Sync {
    fn present(&self, data: &T) -> Response;
}

/// The presenters of one view model, one per format.
pub struct ByFormat<T: 'static> {
    pub json: &'static dyn Presenter<T>,
    pub htmx: Option<&'static dyn Presenter<T>>,
}

impl<T> ByFormat<T> {
    pub fn present(&self, format: Format, data: &T) -> Response {
        match (format, self.htmx) {
            (Format::Htmx, Some(htmx)) => htmx.present(data),
            _ => self.json.present(data),
        }
    }
}

#[cfg(test)]
mod tests {
    use axum::http::HeaderValue;
    use axum::response::{Html, IntoResponse, Json};

    use super::*;

    struct Greeting(String);
    struct AsJson;
    impl Presenter<Greeting> for AsJson {
        fn present(&self, data: &Greeting) -> Response {
            Json(serde_json::json!({ "greeting": data.0 })).into_response()
        }
    }
    struct AsHtml;
    impl Presenter<Greeting> for AsHtml {
        fn present(&self, data: &Greeting) -> Response {
            Html(format!("<p>{}</p>", data.0)).into_response()
        }
    }

    const BOTH: ByFormat<Greeting> = ByFormat { json: &AsJson, htmx: Some(&AsHtml) };
    const JSON_ONLY: ByFormat<Greeting> = ByFormat { json: &AsJson, htmx: None };

    #[test]
    fn reads_the_format_from_the_htmx_header() {
        let mut headers = HeaderMap::new();
        assert_eq!(format_of(&headers), Format::Json);
        headers.insert("hx-request", HeaderValue::from_static("true"));
        assert_eq!(format_of(&headers), Format::Htmx);
    }

    #[test]
    fn presents_in_the_format_asked_and_falls_back_on_json() {
        let content_type = |response: Response| response.headers()["content-type"].to_str().unwrap().to_string();

        assert!(content_type(BOTH.present(Format::Htmx, &Greeting("hi".into()))).starts_with("text/html"));
        assert!(content_type(BOTH.present(Format::Json, &Greeting("hi".into()))).starts_with("application/json"));
        assert!(content_type(JSON_ONLY.present(Format::Htmx, &Greeting("hi".into()))).starts_with("application/json"));
    }
}
