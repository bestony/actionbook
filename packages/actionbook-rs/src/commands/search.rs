use colored::Colorize;

use crate::api::{ApiClient, SearchActionsParams, SearchType};
use crate::cli::Cli;
use crate::config::Config;
use crate::error::Result;

pub async fn run(
    cli: &Cli,
    query: &str,
    search_type: Option<&str>,
    limit: u32,
    source_ids: Option<&str>,
    min_score: Option<f64>,
) -> Result<()> {
    let config = Config::load()?;
    let client = ApiClient::from_config(&config)?;

    // Parse search type
    let search_type = search_type.map(|t| match t {
        "vector" => SearchType::Vector,
        "fulltext" => SearchType::Fulltext,
        "hybrid" => SearchType::Hybrid,
        _ => SearchType::Hybrid, // Default to hybrid
    });

    let params = SearchActionsParams {
        query: query.to_string(),
        search_type,
        limit: Some(limit),
        source_ids: source_ids.map(|s| s.to_string()),
        min_score,
    };

    let response = client.search_actions(params).await?;

    if cli.json {
        println!("{}", serde_json::to_string_pretty(&response.results)?);
    } else {
        if response.results.is_empty() {
            println!("{} No results found for: {}", "!".yellow(), query.bold());
            return Ok(());
        }

        println!(
            "{} Found {} results for: {}\n",
            "✓".green(),
            response.count,
            query.bold()
        );

        for (i, result) in response.results.iter().enumerate() {
            // Truncate content for display
            let content_preview = result
                .content
                .lines()
                .take(3)
                .collect::<Vec<_>>()
                .join("\n");
            let content_preview = if content_preview.len() > 200 {
                format!("{}...", &content_preview[..200])
            } else {
                content_preview
            };

            println!(
                "{}. {} {}",
                (i + 1).to_string().cyan(),
                "ID:".dimmed(),
                result.action_id.bold()
            );
            println!("   {} {:.2}", "Score:".dimmed(), result.score);
            println!("   {}", content_preview.dimmed());
            println!();
        }

        if response.has_more {
            println!(
                "{}",
                format!("Showing {} of {} total results", response.count, response.total).dimmed()
            );
        }
    }

    Ok(())
}
