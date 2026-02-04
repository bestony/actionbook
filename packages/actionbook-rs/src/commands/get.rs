use colored::Colorize;

use crate::api::ApiClient;
use crate::cli::Cli;
use crate::config::Config;
use crate::error::Result;

pub async fn run(cli: &Cli, id: &str) -> Result<()> {
    let config = Config::load()?;
    let client = ApiClient::from_config(&config)?;

    let action = client.get_action(id).await?;

    if cli.json {
        println!("{}", serde_json::to_string_pretty(&action)?);
    } else {
        println!("{} {}\n", "Action:".bold(), action.action_id.cyan());

        if let Some(ref title) = action.document_title {
            println!("{} {}", "Title:".dimmed(), title);
        }

        if let Some(ref url) = action.document_url {
            println!("{} {}", "URL:".dimmed(), url);
        }

        if let Some(ref heading) = action.heading {
            println!("{} {}", "Section:".dimmed(), heading);
        }

        println!();
        println!("{}", "Content:".bold());
        println!("{}", "-".repeat(40).dimmed());
        println!("{}", action.content);
        println!("{}", "-".repeat(40).dimmed());

        // Display elements if present
        if let Some(ref elements) = action.elements {
            if !elements.is_empty() {
                println!();
                println!("{}", "Elements:".bold());

                for (name, info) in elements {
                    println!("\n  {} {}", "●".cyan(), name.bold());

                    if let Some(ref css) = info.css_selector {
                        println!("    {} {}", "CSS:".dimmed(), css);
                    }

                    if let Some(ref xpath) = info.xpath_selector {
                        println!("    {} {}", "XPath:".dimmed(), xpath);
                    }

                    if let Some(ref desc) = info.description {
                        println!("    {} {}", "Desc:".dimmed(), desc);
                    }

                    if let Some(ref elem_type) = info.element_type {
                        println!("    {} {}", "Type:".dimmed(), elem_type);
                    }

                    if let Some(ref methods) = info.allow_methods {
                        println!("    {} {}", "Methods:".dimmed(), methods.join(", "));
                    }
                }
            }
        }
    }

    Ok(())
}
