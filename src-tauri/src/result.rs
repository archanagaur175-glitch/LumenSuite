use serde::Serialize;

#[derive(Serialize)]
pub struct CommandResult<T> {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl<T> CommandResult<T> {
    pub fn ok(data: T) -> CommandResult<T> {
        CommandResult {
            ok: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(error: impl Into<String>) -> CommandResult<T> {
        CommandResult {
            ok: false,
            data: None,
            error: Some(error.into()),
        }
    }
}

pub fn to_unix_file_url(path: &std::path::Path) -> String {
    let p = path.to_string_lossy().replace('\\', "/");
    format!("file:///{}", p)
}
