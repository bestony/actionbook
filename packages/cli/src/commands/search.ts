import { Command } from 'commander'
import { Actionbook } from '@actionbookdev/sdk'
import chalk from 'chalk'
import { getApiKey, handleError } from '../output.js'

export const searchCommand = new Command('search')
  .alias('s')
  .description('Search for action manuals by keyword')
  .argument('<query>', 'Search keyword (e.g., "airbnb search", "google login")')
  .option('-d, --domain <domain>', 'Filter by domain (e.g., "airbnb.com")')
  .option('-u, --url <url>', 'Filter by URL')
  .option('-p, --page <number>', 'Page number', '1')
  .option('-s, --page-size <number>', 'Results per page (1-100)', '10')
  .action(async (query: string, options) => {
    try {
      const apiKey = getApiKey(options)
      const client = new Actionbook({ apiKey })

      const result = await client.searchActions({
        query,
        domain: options.domain,
        url: options.url,
        page: parseInt(options.page, 10),
        page_size: parseInt(options.pageSize, 10),
      })

      // Result is now plain text, output directly
      console.log(result)

      console.log(chalk.cyan('\nNext step: ') + chalk.white(`actionbook get "<area_id>"`))
    } catch (error) {
      handleError(error)
    }
  })
