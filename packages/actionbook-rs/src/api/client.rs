use std::time::Duration;

use reqwest::{Client, StatusCode};

use super::types::*;
use crate::config::Config;
use crate::error::{ActionbookError, Result};

/// Actionbook API client
pub struct ApiClient {
    client: Client,
    base_url: String,
    api_key: Option<String>,
}

impl ApiClient {
    /// Create a new API client from config
    pub fn from_config(config: &Config) -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| ActionbookError::ApiError(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self {
            client,
            base_url: config.api.base_url.clone(),
            api_key: config.api.api_key.clone(),
        })
    }

    /// Build a request with common headers
    fn request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        let url = format!("{}{}", self.base_url, path);
        let mut req = self.client.request(method, &url);

        if let Some(ref key) = self.api_key {
            req = req.header("X-API-Key", key);
        }

        req.header("Content-Type", "application/json")
    }

    /// Search for actions
    pub async fn search_actions(&self, params: SearchActionsParams) -> Result<SearchActionsResponse> {
        let mut query_params = vec![("q", params.query)];

        if let Some(search_type) = params.search_type {
            query_params.push(("type", search_type.to_string()));
        }

        if let Some(limit) = params.limit {
            query_params.push(("limit", limit.to_string()));
        }

        if let Some(source_ids) = params.source_ids {
            query_params.push(("sourceIds", source_ids));
        }

        if let Some(min_score) = params.min_score {
            query_params.push(("minScore", min_score.to_string()));
        }

        let response = self
            .request(reqwest::Method::GET, "/api/actions/search")
            .query(&query_params)
            .send()
            .await
            .map_err(|e| ActionbookError::ApiError(format!("Request failed: {}", e)))?;

        self.handle_response(response).await
    }

    /// Get action by ID
    pub async fn get_action(&self, id: &str) -> Result<ActionDetail> {
        let response = self
            .request(reqwest::Method::GET, "/api/actions")
            .query(&[("id", id)])
            .send()
            .await
            .map_err(|e| ActionbookError::ApiError(format!("Request failed: {}", e)))?;

        // API returns ActionDetail directly, not wrapped
        self.handle_response(response).await
    }

    /// List all sources
    pub async fn list_sources(&self, limit: Option<u32>) -> Result<ListSourcesResponse> {
        let mut query_params = vec![];

        if let Some(limit) = limit {
            query_params.push(("limit", limit.to_string()));
        }

        let response = self
            .request(reqwest::Method::GET, "/api/sources")
            .query(&query_params)
            .send()
            .await
            .map_err(|e| ActionbookError::ApiError(format!("Request failed: {}", e)))?;

        self.handle_response(response).await
    }

    /// Search sources
    pub async fn search_sources(&self, query: &str, limit: Option<u32>) -> Result<SearchSourcesResponse> {
        let mut query_params = vec![("q", query.to_string())];

        if let Some(limit) = limit {
            query_params.push(("limit", limit.to_string()));
        }

        let response = self
            .request(reqwest::Method::GET, "/api/sources/search")
            .query(&query_params)
            .send()
            .await
            .map_err(|e| ActionbookError::ApiError(format!("Request failed: {}", e)))?;

        self.handle_response(response).await
    }

    /// Handle API response
    async fn handle_response<T: serde::de::DeserializeOwned>(&self, response: reqwest::Response) -> Result<T> {
        let status = response.status();

        if status.is_success() {
            response
                .json()
                .await
                .map_err(|e| ActionbookError::ApiError(format!("Failed to parse response: {}", e)))
        } else {
            let error_msg = match status {
                StatusCode::NOT_FOUND => "Resource not found".to_string(),
                StatusCode::TOO_MANY_REQUESTS => "Rate limited. Please try again later.".to_string(),
                StatusCode::UNAUTHORIZED => "Invalid or missing API key".to_string(),
                _ => {
                    // Try to parse error response
                    match response.json::<ApiErrorResponse>().await {
                        Ok(err) => err.message,
                        Err(_) => format!("API error: {}", status),
                    }
                }
            };
            Err(ActionbookError::ApiError(error_msg))
        }
    }
}
