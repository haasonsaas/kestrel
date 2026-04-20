//! Rust SDK foundation for Kestrel desktop integrations with EvalOps.

pub const SDK_NAME: &str = "kestrel-sdk";
pub const SDK_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EvalOpsProviderRef {
    pub provider: String,
    pub environment: String,
    pub credential_name: Option<String>,
    pub team_id: Option<String>,
}

impl EvalOpsProviderRef {
    pub fn new(provider: impl Into<String>, environment: impl Into<String>) -> Self {
        Self {
            provider: provider.into(),
            environment: environment.into(),
            credential_name: None,
            team_id: None,
        }
    }
}
